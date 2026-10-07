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
import { existsSync, readFileSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { extname, join, normalize } from "node:path";
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
} from "@garu/kernel";

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
  log: (line: string) => void;
}

interface LiveRun {
  runId: string;
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

export function startUiServer(opts: UiServerOptions): { close: () => Promise<void>; url: string; agents: number } {
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

  const inbox = new Inbox({
    root: opts.inboxRoot,
    timeoutMs: opts.askTimeoutMs,
    onRequest: async (r) => {
      opts.log(`approval needed: ${formatRequest(r)}`);
      ping();
      if (opts.notify) await notify(opts.notify, r);
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

  const startRun = async (a: DiscoveredAgent, trigger: string, input?: string): Promise<RunResult> => {
    const name = a.garufile.name;
    const started = new Date().toISOString();
    const sink = (e: Envelope) => {
      const l = live.get(name);
      if (e.event.type === "run.start") live.set(name, { runId: e.runId, startedAt: started, turn: 0, trigger });
      else if (e.event.type === "model.turn" && l) l.turn = e.event.turn;
    };
    let result: RunResult | undefined;
    try {
      result = await runAgent({ garufile: a.garufile, logRoot: opts.logRoot, approver, trigger, sink, ...(input ? { input } : {}) });
      return result;
    } catch (e) {
      chat.append(name, { role: "agent", kind: "error", text: (e as Error).message });
      throw e;
    } finally {
      // The thread is the agent's diary: a chat reply for chat runs, a short entry for everything else.
      if (result) {
        const text = result.output?.trim() || `run ${result.status} with nothing to say`;
        chat.append(name, { role: "agent", kind: trigger === "chat" ? (result.status === "ok" ? "chat" : "error") : result.status === "ok" ? "run" : "error", text, runId: result.runId });
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
      runner: (a, trigger) => {
        const fresh = discover().agents.find((x) => x.garufile.name === a.garufile.name) ?? (a as DiscoveredAgent);
        return startRun(fresh, trigger);
      },
      onEvent: (e) => {
        if (e.type === "fire") opts.log(`▶ ${e.agent} (cron ${e.cron})`);
        else if (e.type === "run.done") opts.log(`■ ${e.agent}: ${e.result.status} in ${e.result.turns} turn(s)`);
        else if (e.type === "run.failed") opts.log(`✖ ${e.agent}: ${e.error}`);
        else if (e.type === "skip.overlap") opts.log(`↷ ${e.agent}: still running, skipped`);
      },
    });
    scheduled = scheduler.start(discover().agents);
  }

  const agentView = (a: DiscoveredAgent | undefined, name: string) => {
    const g = a?.garufile;
    const runs = store.runs(name);
    const today = new Date().toISOString().slice(0, 10);
    const todays = runs.filter((r) => r.startedAt.slice(0, 10) === today);
    const pending = inbox.pending().filter((p) => p.agent === name);
    const inFlight = live.get(name);
    const cron = g?.triggers.find((t) => t.cron)?.cron ?? null;
    let nextRun: string | null = null;
    if (cron && opts.up) {
      try {
        nextRun = new Cron(cron, { paused: true }).nextRun()?.toISOString() ?? null;
      } catch {
        /* invalid cron already reported by validate */
      }
    }
    const status = pending.length ? "waiting" : inFlight ? "working" : cron && opts.up ? "scheduled" : "idle";
    const price = g ? (g.budget.pricing ?? priceFor(g.model)) : null;
    return {
      name,
      description: g?.description ?? "",
      model: g?.model ?? runs[0]?.model ?? null,
      source: a?.source ?? null,
      configured: Boolean(g),
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

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    try {
      if (path === "/api/events") return sse(res, clients);

      if (path === "/api/agents") {
        const { agents, problems } = discover();
        const names = new Set([...agents.map((a) => a.garufile.name), ...store.agents()]);
        const byName = new Map(agents.map((a) => [a.garufile.name, a]));
        return json(res, {
          agents: [...names].sort().map((n) => agentView(byName.get(n), n)),
          problems,
          up: opts.up,
          root: opts.root,
        });
      }

      const run = /^\/api\/agents\/([^/]+)\/run$/.exec(path);
      if (run && req.method === "POST") {
        const name = decodeURIComponent(run[1]!);
        const a = discover().agents.find((x) => x.garufile.name === name);
        if (!a) return json(res, { error: `no Garufile for agent "${name}"` }, 404);
        if (live.has(name)) return json(res, { error: `${name} is already running` }, 409);
        const body = (await readBody(req)) as { note?: string };
        const note = body.note?.trim();
        opts.log(`▶ ${name} (from the control room${note ? ", with a note" : ""})`);
        void startRun(a, "ui", note || undefined).then((r) => opts.log(`■ ${name}: ${r.status} in ${r.turns} turn(s)`));
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
          if (!a) return json(res, { error: `no Garufile for agent "${name}"` }, 404);
          if (live.has(name)) return json(res, { error: `${name} is still working on the last message` }, 409);
          const body = (await readBody(req)) as { text?: string };
          const text = body.text?.trim();
          if (!text) return json(res, { error: "empty message" }, 400);
          const displayName = name.charAt(0).toUpperCase() + name.slice(1);
          const input = chat.transcript(name, opts.userName, displayName, text);
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
        return json(res, agent ? store.runs(agent) : store.allRuns().slice(0, 200));
      }
      const m = /^\/api\/runs\/([^/]+)\/([^/]+)$/.exec(path);
      if (m) {
        const events = store.run(decodeURIComponent(m[1]!), decodeURIComponent(m[2]!));
        return events ? json(res, events) : json(res, { error: "no such run" }, 404);
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
      const d = /^\/api\/inbox\/([a-z0-9]+)\/(approve|deny)$/.exec(path);
      if (d && req.method === "POST") {
        const body = (await readBody(req)) as { for?: string };
        try {
          const r = inbox.decide(d[1]!, d[2] === "approve", opts.decider);
          let grant;
          if (d[2] === "approve" && body.for) {
            const scope = scopeFor(r.args);
            grant = grants.create({ agent: r.agent, tool: r.tool, scope, durationMs: parseDuration(body.for), createdBy: opts.decider });
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
        const body = (await readBody(req)) as { ids?: string[]; approve?: boolean };
        const results: { id: string; ok: boolean; error?: string }[] = [];
        for (const id of body.ids ?? []) {
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
        if (!sug) return json(res, { error: "suggestion no longer applies" }, 404);
        const a = discover().agents.find((x) => x.garufile.name === sug.agent);
        if (!a) return json(res, { error: `no Garufile for ${sug.agent}` }, 404);
        try {
          const { inserted } = addPolicyRule(a.path, sug.rule, `learned: approved ${sug.approvals}× by ${opts.decider}, ${new Date().toISOString().slice(0, 10)}`);
          dismissed.add(id); saveDismissed();
          opts.log(`policy: added "${sug.summary}" to ${a.source}`);
          ping();
          return json(res, { applied: true, file: a.source, inserted, rule: sug.rule });
        } catch (e) {
          return json(res, { error: `could not edit ${a.source}: ${(e as Error).message}` }, 500);
        }
      }
      if (path === "/api/feed") return json(res, feed(store, inbox, Number(url.searchParams.get("limit") ?? 80)));
      if (path === "/api/cost") return json(res, store.costByDay(Number(url.searchParams.get("days") ?? 14)));
      if (path.startsWith("/api/")) return json(res, { error: "not found" }, 404);
      return serveStatic(res, opts.staticDir, path);
    } catch (e) {
      return json(res, { error: (e as Error).message }, 500);
    }
  });

  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      opts.log(`port ${opts.port} is already in use — another control room is probably still running. Stop it, or pick a port with --port.`);
      process.exit(1);
    }
    throw e;
  });
  server.listen(opts.port, opts.host);
  const url = `http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${opts.port}`;
  return {
    url,
    agents: scheduled,
    close: async () => {
      for (const w of watchers) w.close();
      for (const c of clients) c.end();
      await scheduler?.stop();
      server.close();
    },
  };
}

/** Notable moments across all agents, newest first: what happened while you were away. */
export function feed(store: RunStore, inbox: Inbox, limit: number) {
  type Item = { ts: string; kind: string; agent: string; runId: string; text: string; detail?: unknown };
  const items: Item[] = [];
  for (const r of store.allRuns().slice(0, 60)) {
    items.push({ ts: r.startedAt, kind: "run.start", agent: r.agent, runId: r.runId, text: `started (${r.trigger})` });
    if (r.endedAt) {
      items.push({
        ts: r.endedAt,
        kind: `run.${r.status}`,
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

async function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Push an approval request to a URL. Plain text so ntfy.sh (free push to your phone) shows it as-is. */
async function notify(url: string, r: ApprovalRequest): Promise<void> {
  const body = `${r.agent} wants ${r.tool}\n${JSON.stringify(r.args).slice(0, 300)}\nreason: ${r.reason}\n\ngaru approve ${r.id}\ngaru deny ${r.id}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain", Title: `Garu: approval needed (${r.agent})`, Priority: "high", Tags: "lock" },
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

function serveStatic(res: ServerResponse, dir: string, urlPath: string): void {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  let file = join(dir, rel);
  if (!file.startsWith(dir)) return void json(res, { error: "forbidden" }, 403);
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
