/**
 * The control room's server. Plain Node http on localhost: static files, a
 * JSON API over the flight-recorder and inbox files, run-from-the-browser,
 * and Server-Sent Events so the page is live without polling.
 *
 * With `up: true` it also runs the scheduler for every discovered agent that
 * has a cron trigger — one process for "my agents are running" and "I can
 * see them".
 */
import { createServer, type ServerResponse } from "node:http";
import { existsSync, readFileSync, realpathSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { basename, dirname, extname, join, normalize, relative, resolve } from "node:path";
import { Cron } from "croner";
import {
  ChatStore,
  GrantStore,
  Inbox,
  RunStore,
  Scheduler,
  addPolicyRule,
  describeGrant,
  discoverGarufiles,
  formatRequest,
  parseDuration,
  priceFor,
  runAgent,
  scopeFor,
  suggestRules,
  withGrants,
  type ApprovalRequest,
  type DiscoveredAgent,
  type Envelope,
  type RunResult,
  missingEnv,
  isRemoteServer,
  signInFor,
  WORKSPACE_MOUNT,
  lineDiff,
  diffStats,
  localDay,
} from "@garu/kernel";
import { t } from "./i18n.js";
import { VERSION } from "./version.js";
import { authenticate, clearSessionCookie, corsHeaders, isCrossSiteWrite, isDirectLoopback, isHttps, loadOrCreateToken, rotateToken, sessionCookie, tokensMatch } from "./ui-auth.js";
import { SeenHosts, tailscaleAddresses, type Address } from "./ui-addresses.js";

export interface UiServerOptions {
  port: number;
  host: string;
  /** Project root: Garufiles are discovered under here. */
  root: string;
  logRoot: string;
  inboxRoot: string;
  chatRoot: string;
  grantsPath: string;
  dismissedPath: string;
  staticDir: string;
  /** How the agents address the person. */
  userName: string;
  /** Who approvals are recorded as. */
  decider: string;
  /** Also run cron schedules for discovered agents. */
  up: boolean;
  askTimeoutMs: number;
  notify?: string;
  /** Where the sign-in token lives (created on first start). */
  tokenPath: string;
  /** Make even the browser on this computer sign in. */
  requireLogin?: boolean;
  /** A public demo: visitors may look around and answer the sample asks; nothing runs, nothing is edited, the key never rotates. */
  demo?: boolean;
  log: (line: string) => void;
}

interface LiveRun {
  /** Known once the recorder writes run.start; the agent is busy from the moment the run is asked for. */
  runId: string | null;
  startedAt: string;
  turn: number;
  trigger: string;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

export function startUiServer(opts: UiServerOptions): { close: () => Promise<void>; url: string; token: string; agents: number } {
  const store = new RunStore(opts.logRoot);
  const chat = new ChatStore(opts.chatRoot);
  const grants = new GrantStore(opts.grantsPath);
  const dismissed = new Set<string>(existsSync(opts.dismissedPath) ? (JSON.parse(readFileSync(opts.dismissedPath, "utf8")) as string[]) : []);
  const saveDismissed = () => writeFileSync(opts.dismissedPath, JSON.stringify([...dismissed]));
  const clients = new Set<ServerResponse>();
  const live = new Map<string, LiveRun>(); // agent → in-flight run started from this process

  // --- live updates: debounce fs events into one "changed" ping ---
  let timer: NodeJS.Timeout | undefined;
  const ping = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const res of clients) res.write(`event: changed\ndata: ${Date.now()}\n\n`);
    }, 120);
  };

  const authRoot = resolve(opts.root, ".garu", "auth");

  const inbox = new Inbox({
    root: opts.inboxRoot,
    timeoutMs: opts.askTimeoutMs,
    onRequest: async (r) => {
      opts.log(`approval needed: ${formatRequest(r)}`);
      ping();
      if (opts.notify) await notify(opts.notify, r, (await addresses())[0]?.url);
    },
  });
  const approver = withGrants(inbox.approver(), grants);

  const watchers: FSWatcher[] = [];
  for (const dir of [opts.logRoot, opts.inboxRoot]) {
    if (!existsSync(dir)) continue;
    try {
      watchers.push(watch(dir, { recursive: true }, ping));
    } catch {
      /* recursive watch unsupported here; the UI still works, just not live */
    }
  }

  // --- agents: discovered Garufiles (re-read on each request so edits show up) ---
  const discover = () => discoverGarufiles(opts.root);

  const startRun = async (a: DiscoveredAgent, trigger: string, input?: string, dueAt?: Date): Promise<RunResult> => {
    const name = a.garufile.name;
    const started = new Date().toISOString();
    // Busy from this very moment, before the first await: a second start in the same instant sees it
    // and is refused, instead of two runs of the same agent racing each other.
    live.set(name, { runId: null, startedAt: started, turn: 0, trigger });
    const sink = (e: Envelope) => {
      const l = live.get(name);
      if (!l) return;
      if (e.event.type === "run.start") l.runId = e.runId;
      else if (e.event.type === "model.turn") l.turn = e.event.turn;
    };
    let result: RunResult | undefined;
    try {
      result = await runAgent({ garufile: a.garufile, logRoot: opts.logRoot, approver, trigger, sink, ...(input ? { input } : {}), ...(dueAt ? { dueAt } : {}), ...(opts.userName && opts.userName !== "you" ? { owner: opts.userName } : {}) });
      return result;
    } catch (e) {
      chat.append(name, { role: "agent", kind: "error", text: (e as Error).message });
      throw e;
    } finally {
      // The thread is the agent's diary: a chat reply for chat runs, a short entry for everything else.
      if (result) {
        const text = result.output?.trim() || `run ${result.status} with nothing to say`;
        // A run the network cut off before it changed anything is a diary entry, not a red one: the schedule runs it again.
        chat.append(name, { role: "agent", kind: trigger === "chat" ? (result.status === "ok" ? "chat" : "error") : result.status === "ok" || result.offline ? "run" : "error", text, runId: result.runId, ...(result.quota ? { quota: result.quota } : {}) });
      }
      live.delete(name);
      ping();
    }
  };

  // --- optional scheduler ---
  let scheduler: Scheduler | undefined;
  let scheduled = 0;
  if (opts.up) {
    scheduler = new Scheduler({
      // Re-read the Garufile at fire time so policy edits apply without a restart.
      runner: (a, trigger, dueAt) => {
        const fresh = discover().agents.find((x) => x.garufile.name === a.garufile.name) ?? (a as DiscoveredAgent);
        return startRun(fresh, trigger, undefined, dueAt);
      },
      // A Mac that was asleep or off at fire time still gets its run, once, labelled catch-up.
      catchUp: {
        lastRunAt: (agent) => {
          const r = store.lastScheduledRun(agent);
          return r ? new Date(r.startedAt) : null;
        },
      },
      // A run started from the control room or chat is just as much "running" as a scheduled one.
      isBusy: (name) => live.has(name),
      onEvent: (e) => {
        if (e.type === "fire") opts.log(`▶ ${e.agent} (cron ${e.cron})`);
        else if (e.type === "offline") opts.log(`⏸ ${e.agent}: no network, will catch up`);
        else if (e.type === "catch-up") opts.log(`↺ ${e.agent}: missed ${e.missedAt.toLocaleTimeString()} (cron ${e.cron}), catching up`);
        else if (e.type === "run.done") opts.log(`■ ${e.agent}: ${e.result.status} in ${e.result.turns} turn(s)`);
        else if (e.type === "run.failed") opts.log(`✖ ${e.agent}: ${e.error}`);
        else if (e.type === "skip.overlap") opts.log(`↷ ${e.agent}: still running, skipped`);
      },
    });
    const all = discover().agents;
    const ready = all.filter((a) => {
      const needs = missingEnv(a.garufile.tools, process.env);
      const signIn = a.garufile.tools.filter((t) => t.auth === "oauth" && !signInFor(t, authRoot).signedIn()).map((t) => t.name);
      const hasCron = a.garufile.triggers.some((t) => t.cron);
      if (needs.length && hasCron) opts.log(`${a.garufile.name}: not scheduled — needs ${needs.join(", ")} in .env`);
      if (signIn.length && hasCron) opts.log(`${a.garufile.name}: not scheduled — sign in first: garu auth ${a.source} ${signIn[0]}`);
      return needs.length === 0 && signIn.length === 0;
    });
    scheduled = scheduler.start(ready);
  }

  const agentView = (a: DiscoveredAgent | undefined, name: string) => {
    const g = a?.garufile;
    const runs = store.runs(name);
    const today = localDay(new Date());
    const todays = runs.filter((r) => localDay(r.startedAt) === today);
    const pending = inbox.pending().filter((p) => p.agent === name);
    const inFlight = live.get(name);
    const cron = g?.triggers.find((t) => t.cron)?.cron ?? null;
    let nextRun: string | null = null;
    if (cron && (opts.up || opts.demo)) {
      try {
        nextRun = new Cron(cron, { paused: true }).nextRun()?.toISOString() ?? null;
      } catch {
        /* invalid cron already reported by validate */
      }
    }
    // The demo has no keys or sign-ins and never will; it shows its agents as ready, not as waiting for setup.
    const needs = g && !opts.demo ? missingEnv(g.tools, process.env) : [];
    const signIn = g && !opts.demo ? g.tools.filter((t) => t.auth === "oauth" && !signInFor(t, authRoot).signedIn()).map((t) => t.name) : [];
    // Google ends a sign-in after seven days while the OAuth app is in Testing (docs/google.md). From the
    // sixth day the home screen says so, so the owner signs in again before a morning run fails.
    const signInExpiring =
      g && !opts.demo
        ? g.tools.flatMap((tl) => {
            if (tl.auth !== "oauth" || !/^https:\/\/accounts\.google\.com/.test(tl.oauth?.issuer ?? "")) return [];
            const at = signInFor(tl, authRoot).signedInAt();
            if (!at) return [];
            const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
            return days >= 6 ? [{ server: tl.name, days }] : [];
          })
        : [];
    const status = pending.length ? "waiting" : inFlight ? "working" : needs.length || signIn.length ? "needs-setup" : cron && (opts.up || opts.demo) ? "scheduled" : "idle";
    const price = g ? (g.budget.pricing ?? priceFor(g.model)) : null;
    return {
      name,
      description: g?.description ?? "",
      persona: g?.persona ?? null,
      model: g?.model ?? runs[0]?.model ?? null,
      source: a?.source ?? null,
      configured: Boolean(g),
      needs,
      signIn,
      signInExpiring,
      status,
      inFlight: inFlight ?? null,
      pending: pending.length,
      cron,
      nextRun,
      tools: g?.tools.map((t) => t.name) ?? [],
      policy: g ? { rules: g.policy.length, allow: g.policy.filter((r) => r.action === "allow").length, ask: g.policy.filter((r) => r.action === "ask").length, block: g.policy.filter((r) => r.action === "block").length } : null,
      sandbox: g?.sandbox ? { image: g.sandbox.image, network: g.sandbox.network } : null,
      budget: g ? { maxCostUsd: g.budget.maxCostUsd ?? null, free: price ? price.inputPerMTok === 0 && price.outputPerMTok === 0 : false } : null,
      maxTurns: g?.maxTurns ?? null,
      runs: runs.length,
      runsToday: todays.length,
      costTodayUsd: todays.reduce((s, r) => s + r.costUsd, 0),
      lastRun: runs[0] ?? null,
    };
  };

  let token = loadOrCreateToken(opts.tokenPath);
  const requireLogin = Boolean(opts.requireLogin);
  const seen = new SeenHosts();
  /** Where a phone can reach us: Tailscale's address if it serves us, plus any proxy address already used. */
  const addresses = async (): Promise<Address[]> => {
    const ts = await tailscaleAddresses(opts.port);
    const out: Address[] = ts.map((url) => ({ url, via: "tailscale" as const }));
    for (const url of seen.list()) if (!ts.includes(url)) out.push({ url, via: "seen" });
    return out;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    try {
      // --- the Garu app calls from its own origin ---
      for (const [k, v] of Object.entries(corsHeaders(req))) res.setHeader(k, v);
      if (req.method === "OPTIONS") { res.writeHead(204); return void res.end(); }
      // --- who is this? ---
      if (isCrossSiteWrite(req)) return json(res, { error: t("cross-site request refused") }, 403);
      const linkToken = url.searchParams.get("token");
      if (linkToken !== null && !path.startsWith("/api/")) {
        // A sign-in link (the QR code, or the one printed at start): set the cookie, then show the clean URL.
        if (!tokensMatch(linkToken, token)) {
          res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
          return void res.end("That sign-in link is not valid for this control room. Open Settings → Your phone & other devices on the computer running garu and press Show pairing code to get a fresh one.\n");
        }
        url.searchParams.delete("token");
        seen.note(req.headers);
        res.writeHead(302, { location: url.pathname + url.search, "set-cookie": sessionCookie(token, isHttps(req)), "cache-control": "no-store" });
        return void res.end();
      }
      if (path === "/api/login" && req.method === "POST") {
        const body = (await readBody(req)) as { token?: string };
        if (typeof body.token !== "string" || !tokensMatch(body.token.trim(), token)) return json(res, { error: t("that token is not right") }, 403);
        res.setHeader("set-cookie", sessionCookie(token, isHttps(req)));
        return json(res, { ok: true });
      }
      if (path === "/api/logout" && req.method === "POST") {
        res.setHeader("set-cookie", clearSessionCookie());
        return json(res, { ok: true });
      }
      if (path.startsWith("/api/")) {
        const who = authenticate(req, url, token, requireLogin);
        if (who !== "ok") return json(res, { error: who === "bad" ? t("wrong token") : t("sign in"), signIn: true }, 401);
        seen.note(req.headers); // an address that reached us with the right token is one a phone can use
      }
      // The demo is read-only apart from a plain approve or deny of a sample ask: no runs, no chat, no
      // Garufile edits, no grants (a 24h approve is refused below), no dismissals, no bulk decisions, no new key.
      if (opts.demo && req.method === "POST" && !/^\/api\/inbox\/[a-z0-9]+\/(approve|deny)$/.test(path)) {
        return json(res, { error: t("This is the demo: it can't do that. Garu on your own computer can.") }, 403);
      }
      if (path === "/api/pair" && req.method === "POST") {
        // A new key. Whoever asked stays signed in (fresh cookie); every other device is out.
        token = rotateToken(opts.tokenPath);
        opts.log("sign-in token rotated from the control room; other devices must sign in again");
        res.setHeader("set-cookie", sessionCookie(token, isHttps(req)));
        return json(res, { token, direct: isDirectLoopback(req), addresses: await addresses() });
      }
      if (path === "/api/pair") {
        // Only for someone already in: the token, so the QR code on Settings can carry it to a phone.
        return json(res, { token, direct: isDirectLoopback(req), addresses: await addresses() });
      }

      if (path === "/api/events") return sse(res, clients);

      if (path === "/api/agents") {
        const { agents, problems } = discover();
        const names = new Set([...agents.map((a) => a.garufile.name), ...store.agents()]);
        const byName = new Map(agents.map((a) => [a.garufile.name, a]));
        return json(res, {
          agents: [...names].sort().map((n) => agentView(byName.get(n), n)),
          problems,
          up: opts.up || Boolean(opts.demo),
          root: opts.root,
          demo: Boolean(opts.demo),
        });
      }

      const run = /^\/api\/agents\/([^/]+)\/run$/.exec(path);
      if (run && req.method === "POST") {
        const name = decodeURIComponent(run[1]!);
        const a = discover().agents.find((x) => x.garufile.name === name);
        if (!a) return json(res, { error: t("no Garufile for agent \"{name}\"", { name }) }, 404);
        const body = (await readBody(req)) as { note?: string };
        const note = body.note?.trim();
        // Checked after the body is read, with nothing to wait on between here and startRun marking the
        // agent busy, so two "Run now" taps in the same instant start one run and the other is refused.
        if (live.has(name)) return json(res, { error: t("{name} is already running", { name }) }, 409);
        opts.log(`▶ ${name} (from the control room${note ? ", with a note" : ""})`);
        void startRun(a, "ui", note || undefined)
          .then((r) => opts.log(`■ ${name}: ${r.status} in ${r.turns} turn(s)`))
          .catch((e: unknown) => opts.log(`✖ ${name}: ${(e as Error).message}`));
        // give run.start a moment to land so the client can navigate to it
        await new Promise((r) => setTimeout(r, 250));
        return json(res, { started: true, runId: live.get(name)?.runId ?? null }, 202);
      }

      const chatM = /^\/api\/agents\/([^/]+)\/chat$/.exec(path);
      if (chatM) {
        const name = decodeURIComponent(chatM[1]!);
        if (req.method === "GET") return json(res, chat.messages(name));
        if (req.method === "POST") {
          const a = discover().agents.find((x) => x.garufile.name === name);
          if (!a) return json(res, { error: t("no Garufile for agent \"{name}\"", { name }) }, 404);
          const body = (await readBody(req)) as { text?: string };
          const text = body.text?.trim();
          if (!text) return json(res, { error: t("empty message") }, 400);
          // Same as Run now: the busy check comes after the body, right before the run is started.
          if (live.has(name)) return json(res, { error: t("{name} is still working on the last message", { name }) }, 409);
          const displayName = name.charAt(0).toUpperCase() + name.slice(1);
          const view = agentView(a, name);
          const input = chat.transcript(name, opts.userName, displayName, text, 20, {
            cron: view.cron,
            schedulesOn: Boolean(opts.up),
            nextRun: view.nextRun ? new Date(view.nextRun) : null,
            runs: store.runs(name).slice(0, 6).map((r) => ({ startedAt: new Date(r.startedAt), trigger: r.trigger, status: r.status })),
          });
          chat.append(name, { role: "user", kind: "chat", text });
          opts.log(`💬 ${name}: ${text.slice(0, 60)}`);
          void startRun(a, "chat", input).catch(() => {});
          await new Promise((r) => setTimeout(r, 250));
          ping();
          return json(res, { started: true, runId: live.get(name)?.runId ?? null }, 202);
        }
      }

      if (path === "/api/runs") {
        const agent = url.searchParams.get("agent");
        if (agent !== null && !/^[A-Za-z0-9._-]+$/.test(agent)) return json(res, { error: t("bad agent name") }, 400);
        // Newest first, a page at a time: `offset` skips the newest, `limit` caps the page. Without a
        // limit, one agent's history comes whole and everyone's is capped at 200, as before.
        const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset")) || 0));
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam !== null && Number(limitParam) > 0 ? Math.floor(Number(limitParam)) : agent ? Infinity : 200;
        const all = agent ? store.runs(agent) : store.allRuns();
        return json(res, all.slice(offset, offset + limit));
      }
      const m = /^\/api\/runs\/([^/]+)\/([^/]+)$/.exec(path);
      if (m) {
        const events = store.run(decodeURIComponent(m[1]!), decodeURIComponent(m[2]!));
        return events ? json(res, events) : json(res, { error: t("no such run") }, 404);
      }
      if (path === "/api/inbox") {
        const all = inbox.all();
        return json(res, {
          pending: inbox.pending(),
          recent: all.slice(-50).reverse(),
          grants: grants.active().map((g) => ({ ...g, label: describeGrant(g) })),
          suggestions: suggestRules(all, { dismissed }),
        });
      }
      // What a file write would change: the current file on disk against the content the agent wants to write.
      const diffM = /^\/api\/inbox\/([a-z0-9]+)\/diff$/.exec(path);
      if (diffM) {
        const p = inbox.pending().find((x) => x.id === diffM[1]);
        if (!p) return json(res, { error: t("not pending") }, 404);
        const args = p.args as Record<string, unknown>;
        let target = typeof args["path"] === "string" ? args["path"] : typeof args["file"] === "string" ? args["file"] : null;
        const next = typeof args["content"] === "string" ? args["content"] : typeof args["text"] === "string" ? args["text"] : null;
        if (!target || next === null) return json(res, { error: t("not a file write") }, 400);
        // A sandboxed agent names files as its container sees them, under /workspace; its Garufile says
        // which folder of the project sits there, so the card can show the file that would change.
        const workspace = discover().agents.find((x) => x.garufile.name === p.agent)?.garufile.sandbox?.workspace;
        if (workspace && (target === WORKSPACE_MOUNT || target.startsWith(WORKSPACE_MOUNT + "/"))) target = join(workspace, target.slice(WORKSPACE_MOUNT.length));
        const abs = resolve(opts.root, target);
        if (!abs.startsWith(opts.root + "/") && abs !== opts.root) return json(res, { outside: true });
        // Secrets never go on a review card, not even as "the file this would replace".
        const rel = relative(opts.root, abs);
        if (/^\.env(\.|$)/.test(rel) || rel === ".garu" || rel.startsWith(".garu/")) return json(res, { secret: true });
        // A symlink can't lead outside either. The project folder itself may sit behind one (/var on macOS),
        // so both sides are resolved, and a file that doesn't exist yet is placed by its nearest real parent.
        if (!realPathOf(abs).startsWith(realPathOf(opts.root) + "/")) return json(res, { outside: true });
        let before = "";
        let isNew = true;
        if (existsSync(abs) && !statSync(abs).isDirectory()) {
          if (statSync(abs).size > 512 * 1024) return json(res, { tooBig: true });
          before = readFileSync(abs, "utf8");
          isNew = false;
        }
        const lines = lineDiff(before, next);
        return json(res, { path: abs, isNew, lines, ...diffStats(lines) });
      }

      const d = /^\/api\/inbox\/([a-z0-9]+)\/(approve|deny)$/.exec(path);
      if (d && req.method === "POST") {
        const body = (await readBody(req)) as { for?: string; note?: string };
        // An approve with a duration makes a grant, which is a write any visitor could leave behind.
        if (opts.demo && body.for) return json(res, { error: t("This is the demo: it can't do that. Garu on your own computer can.") }, 403);
        try {
          // The duration is checked before anything is decided: a bad one changes nothing.
          const durationMs = d[2] === "approve" && body.for ? parseDuration(body.for) : null;
          const r = inbox.decide(d[1]!, d[2] === "approve", opts.decider, typeof body.note === "string" ? body.note : undefined);
          let grant;
          if (durationMs !== null) {
            const scope = scopeFor(r.args);
            grant = grants.create({ agent: r.agent, tool: r.tool, scope, durationMs, createdBy: opts.decider });
            opts.log(`grant ${grant.id}: ${describeGrant(grant)} for ${body.for}`);
            // anything else already waiting that this grant covers gets answered now
            for (const p of inbox.pending()) {
              if (p.agent === grant.agent && p.tool === grant.tool && (!scope || JSON.stringify(p.args[scope.key]) === JSON.stringify(scope.value))) {
                inbox.decide(p.id, true, `grant ${grant.id} (${opts.decider})`);
              }
            }
          }
          ping();
          return json(res, { ...r, grant });
        } catch (e) {
          return json(res, { error: (e as Error).message }, 409);
        }
      }
      if (path === "/api/inbox/batch" && req.method === "POST") {
        const body = (await readBody(req)) as { ids?: unknown; approve?: boolean };
        const results: { id: string; ok: boolean; error?: string }[] = [];
        for (const id of Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : []) {
          try { inbox.decide(id, Boolean(body.approve), opts.decider); results.push({ id, ok: true }); }
          catch (e) { results.push({ id, ok: false, error: (e as Error).message }); }
        }
        ping();
        return json(res, { results });
      }
      const gr = /^\/api\/grants\/([a-z0-9]+)\/revoke$/.exec(path);
      if (gr && req.method === "POST") {
        try { const g = grants.revoke(gr[1]!); ping(); return json(res, g); }
        catch (e) { return json(res, { error: (e as Error).message }, 404); }
      }
      const sg = /^\/api\/suggestions\/([^/]+)\/(apply|dismiss)$/.exec(path);
      if (sg && req.method === "POST") {
        const id = decodeURIComponent(sg[1]!);
        if (sg[2] === "dismiss") { dismissed.add(id); saveDismissed(); ping(); return json(res, { dismissed: id }); }
        const sug = suggestRules(inbox.all(), { dismissed }).find((x) => x.id === id);
        if (!sug) return json(res, { error: t("suggestion no longer applies") }, 404);
        const a = discover().agents.find((x) => x.garufile.name === sug.agent);
        if (!a) return json(res, { error: t("no Garufile for {name}", { name: sug.agent }) }, 404);
        try {
          const { inserted } = addPolicyRule(a.path, sug.rule, `learned: approved ${sug.approvals}× by ${opts.decider}, ${new Date().toLocaleDateString("en-CA")}`);
          dismissed.add(id); saveDismissed();
          opts.log(`policy: added "${sug.summary}" to ${a.source}`);
          ping();
          return json(res, { applied: true, file: a.source, inserted, rule: sug.rule });
        } catch (e) {
          return json(res, { error: t("could not edit {file}: {error}", { file: a.source, error: (e as Error).message }) }, 500);
        }
      }
      if (path === "/api/feed") return json(res, feed(store, inbox, Number(url.searchParams.get("limit") ?? 80)));
      if (path === "/api/cost") return json(res, store.costByDay(Number(url.searchParams.get("days") ?? 14)));
      if (path === "/api/today") {
        // An agent that fires more than four times a day is a heartbeat: its results stay in the activity list.
        const often = (cron: string) => { try { const next = new Cron(cron, { paused: true }).nextRuns(5); return next.length === 5 && next[4]!.getTime() - Date.now() < 86_400_000; } catch { return false; } };
        const heartbeats = new Set(discover().agents.filter((a) => a.garufile.triggers.some((t) => t.cron && often(t.cron))).map((a) => a.garufile.name));
        return json(res, store.today(new Date(), heartbeats));
      }
      // The tail of the service log, for "Report a problem". Secrets never go in the log on purpose, but a
      // webhook URL or a token could land there inside an error message, so anything key-shaped is masked.
      if (path === "/api/logs") {
        const n = Math.min(500, Math.max(1, Number(url.searchParams.get("n") ?? 200)));
        const p = join(opts.root, ".garu", "ui.log");
        if (!existsSync(p)) return json(res, { lines: [], path: p });
        const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).slice(-n).map(redactLogLine);
        return json(res, { lines, path: p });
      }
      if (path === "/api/settings") {
        // Only whether a key is set — never its value.
        const isSet = (k: string) => Boolean(process.env[k]);
        const agents = discover().agents;
        const referenced = new Set<string>();
        for (const a of agents) for (const t of a.garufile.tools) {
          const scan = (v: string) => { for (const m of v.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/g)) referenced.add(m[1]!); };
          if (isRemoteServer(t)) { scan(t.url); Object.values(t.headers).forEach(scan); } else { t.args.forEach(scan); Object.values(t.env).forEach(scan); }
        }
        // Remote servers, plus local ones that sign in (shown with who they sign in with).
        const remotes = agents.flatMap((a) => a.garufile.tools.filter((t) => isRemoteServer(t) || t.auth === "oauth").map((t) => ({ agent: a.garufile.name, source: a.source, server: t.name, url: isRemoteServer(t) ? t.url : (t.oauth?.issuer ?? ""), local: !isRemoteServer(t), auth: t.auth ?? "none", signedIn: t.auth === "oauth" ? signInFor(t, authRoot).signedIn() : null })));
        return json(res, {
          version: VERSION,
          root: opts.root,
          up: opts.up || Boolean(opts.demo),
          demo: Boolean(opts.demo),
          user: opts.userName,
          host: opts.host,
          port: opts.port,
          providers: { gemini: isSet("GEMINI_API_KEY"), anthropic: isSet("ANTHROPIC_API_KEY"), ollamaHost: isSet("OLLAMA_HOST") },
          env: [...referenced].sort().map((k) => ({ name: k, set: isSet(k) })),
          remotes,
          notify: Boolean(opts.notify),
          askTimeoutMin: Math.round((opts.askTimeoutMs ?? 30 * 60_000) / 60_000),
          login: { required: requireLogin, direct: isDirectLoopback(req), tokenPath: opts.tokenPath },
        });
      }
      if (path.startsWith("/api/")) return json(res, { error: t("not found") }, 404);
      return serveStatic(res, opts.staticDir, path);
    } catch (e) {
      return json(res, { error: (e as Error).message }, (e as { status?: number }).status ?? 500);
    }
  });

  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      opts.log(`port ${opts.port} is already in use — another control room is probably still running (a terminal, or the login service: \`garu service status\`). Stop it, or pick a port with --port.`);
      process.exit(1);
    }
    throw e;
  });
  server.listen(opts.port, opts.host);
  const url = `http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${opts.port}`;
  return {
    url,
    token,
    agents: scheduled,
    close: async () => {
      for (const w of watchers) w.close();
      for (const c of clients) c.end();
      // A restart shouldn't wait half an hour for an answer nobody is giving: paused asks end now,
      // recorded as declined by the stop, and runs get ten seconds to wrap up.
      inbox.close();
      await scheduler?.stop(10_000);
      server.close();
    },
  };
}

/** Notable moments across all agents, newest first: what happened while you were away. */
/** Mask anything that could be a key: long opaque tokens, and the path/query of any URL (hosts stay). */
export function redactLogLine(line: string): string {
  return line
    .replace(/https?:\/\/([^\s/?#]+)[^\s]*/g, (_m, host: string) => `https://${host}/…`)
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, (m) => (/^\d{8}-\d{6}-[0-9a-f]{8}$/.test(m) ? m : "…"));
}

export function feed(store: RunStore, inbox: Inbox, limit: number) {
  type Item = { ts: string; kind: string; agent: string; runId: string; text: string; detail?: unknown };
  const items: Item[] = [];
  for (const r of store.allRuns().slice(0, 60)) {
    items.push({ ts: r.startedAt, kind: "run.start", agent: r.agent, runId: r.runId, text: `started (${r.trigger})` });
    if (r.endedAt) {
      items.push({
        ts: r.endedAt,
        kind: r.offline ? "run.offline" : `run.${r.status}`,
        agent: r.agent,
        runId: r.runId,
        text: r.summary ?? r.status,
        detail: { turns: r.turns, costUsd: r.costUsd, toolCalls: r.toolCalls },
      });
    }
  }
  for (const a of inbox.all()) {
    items.push({ ts: a.createdAt, kind: a.decision ? "approval.decided" : "approval.pending", agent: a.agent, runId: a.runId, text: a.tool, detail: a });
  }
  return items.sort((x, y) => y.ts.localeCompare(x.ts)).slice(0, limit);
}

const MAX_BODY_BYTES = 1_048_576;

/** The JSON object a request carries, or {}: never more than 1 MB, never anything but an object. */
async function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    // Stop reading and answer 413; Node closes the connection after a response to an unread body.
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("request body too large"), { status: 413 });
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Push an approval request to a URL. Plain text so ntfy.sh (free push to your phone) shows it as-is;
 * with a control-room address, a tap opens the Inbox there (ntfy's Click header).
 */
async function notify(url: string, r: ApprovalRequest, link?: string): Promise<void> {
  const body = `${r.agent} wants ${r.tool}\n${JSON.stringify(r.args).slice(0, 300)}\nreason: ${r.reason}\n\n${link ? "Tap to review." : `garu approve ${r.id} · garu deny ${r.id}`}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        Title: `Garu: approval needed (${r.agent})`,
        Priority: "high",
        Tags: "lock",
        ...(link ? { Click: `${link.replace(/\/$/, "")}/#/inbox` } : {}),
      },
      body,
    });
  } catch {
    /* best effort */
  }
}

function json(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sse(res: ServerResponse, clients: Set<ServerResponse>): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  res.write(`event: hello\ndata: ok\n\n`);
  clients.add(res);
  const keepalive = setInterval(() => res.write(`: ping\n\n`), 25_000);
  res.on("close", () => {
    clearInterval(keepalive);
    clients.delete(res);
  });
}

/** The real path of a file, following symlinks; for one that doesn't exist yet, its nearest existing parent's. */
function realPathOf(p: string): string {
  try { return realpathSync(p); } catch { return p === dirname(p) ? p : join(realPathOf(dirname(p)), basename(p)); }
}

function serveStatic(res: ServerResponse, dir: string, urlPath: string): void {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  let file = join(dir, rel);
  if (!file.startsWith(dir)) return void json(res, { error: t("forbidden") }, 403);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html");
  if (!existsSync(file)) {
    res.writeHead(503, { "content-type": "text/plain" });
    return void res.end("control room UI is not built. Run: npm run build\n");
  }
  const type = MIME[extname(file)] ?? "application/octet-stream";
  const immutable = /\/assets\//.test(file);
  res.writeHead(200, { "content-type": type, "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
  res.end(readFileSync(file));
}
