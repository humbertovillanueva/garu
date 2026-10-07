#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { join, relative, resolve } from "node:path";
import {
  DEFAULT_SANDBOX_IMAGE,
  GarufileError,
  GrantStore,
  Inbox,
  describeGrant,
  parseDuration,
  scopeFor,
  PolicyEngine,
  Scheduler,
  assertValidCron,
  formatEvent,
  formatRequest,
  formatUsd,
  parseGarufile,
  priceFor,
  readRun,
  runAgent,
  type ApprovalRequest,
  type Approver,
  type Envelope,
  type Garufile,
  type SchedulerEvent,
} from "@garu/kernel";

import { startUiServer } from "./ui-server.js";
import { SCHEDULES, cronFor, isFreeModel, renderGarufile, suggestModel, type Schedule, type ScaffoldAnswers } from "./scaffold.js";

const DEFAULT_LOG_ROOT = resolve(process.cwd(), ".garu", "runs");
const DEFAULT_INBOX_ROOT = resolve(process.cwd(), ".garu", "inbox");
const DEFAULT_CHAT_ROOT = resolve(process.cwd(), ".garu", "chat");
const DEFAULT_GRANTS_PATH = resolve(process.cwd(), ".garu", "grants.jsonl");
const DEFAULT_DISMISSED_PATH = resolve(process.cwd(), ".garu", "suggestions-dismissed.json");

// `garu log | head` must not crash when the reader closes the pipe.
stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

const program = new Command()
  .name("garu")
  .description("Garu — the open personal agent cloud. Run agents that can only act through policy you wrote.")
  .version("0.1.0");

program
  .command("validate")
  .argument("[file]", "Garufile path", "Garufile.yaml")
  .description("Parse a Garufile and lint its policy")
  .action((file: string) => {
    const g = loadGarufile(file);
    const engine = new PolicyEngine(g.policy);
    const dead = engine.unreachableRules();
    stdout.write(`✔ ${file}: agent "${g.name}", model ${g.model}, ${g.tools.length} tool server(s), ${g.policy.length} policy rule(s)\n`);
    for (const i of dead) {
      stdout.write(`  ⚠ policy rule #${i + 1} (${g.policy[i]!.tool}) is unreachable: an earlier rule matches everything\n`);
    }
    const last = g.policy.at(-1);
    if (!last || last.tool !== "*") {
      stdout.write(`  ℹ no explicit catch-all rule; unmatched tools default to ask\n`);
    }
    for (const t of g.triggers) {
      if (t.cron) {
        try {
          assertValidCron(t.cron);
          stdout.write(`  trigger: cron "${t.cron}"\n`);
        } catch (e) {
          fail((e as Error).message);
        }
      }
    }
    if (g.sandbox) {
      stdout.write(`  sandbox: image ${g.sandbox.image}, network ${g.sandbox.network}, ${g.sandbox.memory} / ${g.sandbox.cpus} cpu${g.sandbox.workspace ? `, workspace ${g.sandbox.workspace}` : ""}\n`);
    } else if (g.tools.length > 0) {
      stdout.write(`  ⚠ no sandbox: tool servers run directly on this machine. Add a \`sandbox:\` block to containerise them.\n`);
    }
    const price = g.budget.pricing ?? priceFor(g.model);
    if (g.budget.maxCostUsd !== undefined) {
      stdout.write(`  budget: cap ${formatUsd(g.budget.maxCostUsd)} per run${price ? ` at $${price.inputPerMTok}/$${price.outputPerMTok} per MTok` : " — ✖ model has no known price, add budget.pricing"}\n`);
    } else if (price && price.inputPerMTok === 0 && price.outputPerMTok === 0) {
      stdout.write(`  budget: model is priced at $0 (local/free), no cap needed\n`);
    } else {
      stdout.write(`  ⚠ no budget.maxCostUsd — fine for a one-off, risky for an always-on agent\n`);
    }
  });

program
  .command("run")
  .argument("[file]", "Garufile path", "Garufile.yaml")
  .option("-i, --input <text>", "extra input for this run")
  .option("--yes", "auto-approve every `ask` decision (dangerous; for demos)")
  .option("--deny", "auto-deny every `ask` decision")
  .option("--log-root <dir>", "where run logs go", DEFAULT_LOG_ROOT)
  .option("-q, --quiet", "don't stream events to stderr")
  .description("Run an agent once, right now")
  .action(async (file: string, opts: { input?: string; yes?: boolean; deny?: boolean; logRoot: string; quiet?: boolean }) => {
    loadDotEnv();
    const g = loadGarufile(file);
    const approver = opts.yes ? autoApprove : opts.deny ? autoDeny : terminalApprover;
    const res = await runAgent({
      garufile: g,
      logRoot: opts.logRoot,
      approver,
      trigger: "manual",
      ...(opts.input ? { input: opts.input } : {}),
      ...(opts.quiet ? {} : { sink: (e) => stderr.write(formatEvent(e) + "\n") }),
    });
    if (res.output) stdout.write(res.output.trimEnd() + "\n");
    const cost = res.costUsd === null ? "unpriced model" : formatUsd(res.costUsd);
    stderr.write(
      `\nrun ${res.runId} → ${res.status} in ${res.turns} turn(s), ${res.inputTokens + res.outputTokens} tokens, ${cost}. log: ${res.logPath}\n`,
    );
    process.exitCode = res.status === "ok" ? 0 : 1;
  });

program
  .command("up")
  .argument("<files...>", "Garufiles to keep running on their cron triggers")
  .option("--on-ask <mode>", "what to do with `ask` decisions: inbox (pause for `garu approve`) | deny | allow | terminal", "inbox")
  .option("--ask-timeout <minutes>", "inbox mode: deny a request nobody answers after this long", "30")
  .option("--notify <url>", "inbox mode: POST each approval request to this URL (ntfy.sh topic URLs work)")
  .option("--inbox-root <dir>", "where approval requests live", DEFAULT_INBOX_ROOT)
  .option("--log-root <dir>", "where run logs go", DEFAULT_LOG_ROOT)
  .option("-q, --quiet", "only print scheduler events, not every run step")
  .option("--once", "fire every cron agent once right now, then exit (for testing)")
  .description("Run agents on their schedules until stopped (Ctrl-C)")
  .action(async (files: string[], opts: { onAsk: string; askTimeout: string; notify?: string; inboxRoot: string; logRoot: string; quiet?: boolean; once?: boolean }) => {
    loadDotEnv();
    const agents = files.map((f) => ({ source: f, garufile: loadGarufile(f) }));
    if (!["inbox", "deny", "allow", "terminal"].includes(opts.onAsk)) fail(`--on-ask must be inbox, deny, allow or terminal (got "${opts.onAsk}")`);
    const timeoutMin = Number(opts.askTimeout);
    if (!Number.isFinite(timeoutMin) || timeoutMin <= 0) fail(`--ask-timeout must be a positive number of minutes`);
    const approver: Approver =
      opts.onAsk === "allow" ? autoApprove
      : opts.onAsk === "terminal" ? terminalApprover
      : opts.onAsk === "deny" ? unattendedDeny
      : new Inbox({
          root: opts.inboxRoot,
          timeoutMs: timeoutMin * 60_000,
          onRequest: async (r) => {
            stderr.write(`\n┌ APPROVAL NEEDED  (expires ${r.expiresAt.slice(11, 16)} UTC)\n│ ${formatRequest(r)}\n└ garu approve ${r.id}   ·   garu deny ${r.id}\n\n`);
            if (opts.notify) await notify(opts.notify, r);
          },
        }).approver();

    const scheduler = new Scheduler({
      onEvent: printSchedulerEvent,
      runner: (a, trigger) =>
        runAgent({
          garufile: a.garufile,
          logRoot: opts.logRoot,
          approver,
          trigger,
          ...(opts.quiet ? {} : { sink: (e) => stderr.write(`  [${a.garufile.name}] ${formatEvent(e)}\n`) }),
        }),
    });

    const n = scheduler.start(agents);
    if (n === 0) fail("none of these Garufiles has a cron trigger; use `garu run` for one-off agents");
    stderr.write(`garu up: ${n} schedule(s) across ${agents.length} agent(s); ask → ${opts.onAsk}. Ctrl-C to stop.\n`);

    if (opts.once) {
      for (const a of agents) for (const t of a.garufile.triggers) if (t.cron) await scheduler.fire(a, t.cron);
      await scheduler.stop();
      return;
    }

    const shutdown = (sig: string) => {
      stderr.write(`\n${sig}: finishing in-flight runs…\n`);
      void scheduler.stop().then(() => process.exit(0));
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    await new Promise<never>(() => {}); // run until a signal
  });

const sandboxCmd = program.command("sandbox").description("Manage the Docker image tool servers run in");
sandboxCmd
  .command("build")
  .option("--tag <name>", "image tag", DEFAULT_SANDBOX_IMAGE)
  .option("--context <dir>", "Dockerfile directory", defaultSandboxContext())
  .description("Build the sandbox image (node + common MCP servers)")
  .action(async (opts: { tag: string; context: string }) => {
    if (!existsSync(join(opts.context, "Dockerfile"))) fail(`no Dockerfile in ${opts.context}`);
    stderr.write(`building ${opts.tag} from ${opts.context}…\n`);
    let stderrTail = "";
    const code = await new Promise<number>((done) => {
      const p = spawn("docker", ["build", "-t", opts.tag, opts.context], { stdio: ["ignore", "inherit", "pipe"] });
      p.stderr.on("data", (d: Buffer) => {
        const text = d.toString();
        stderrTail = (stderrTail + text).slice(-2000);
        stderr.write(text);
      });
      p.on("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") fail("Docker isn't installed or not on PATH. Install Docker Desktop and try again.");
        fail(e.message);
      });
      p.on("exit", (c) => done(c ?? 1));
    });
    if (code !== 0) {
      if (/docker API|docker\.sock|daemon/i.test(stderrTail)) fail("Docker is installed but not running. Start Docker Desktop, wait for the whale to settle, then try again.");
      fail(`docker build exited with ${code}`);
    }
    stdout.write(`✔ built ${opts.tag}. Agents with a \`sandbox:\` block will use it.\n`);
  });

program
  .command("ui")
  .option("-p, --port <n>", "port", "4000")
  .option("--host <host>", "bind address (localhost only by default)", "127.0.0.1")
  .option("--up", "also run cron schedules for every Garufile found under this directory")
  .option("--ask-timeout <minutes>", "deny approvals nobody answers after this long", "30")
  .option("--notify <url>", "POST approval requests to this URL (ntfy.sh topic URLs work)")
  .option("--log-root <dir>", "where run logs live", DEFAULT_LOG_ROOT)
  .option("--inbox-root <dir>", "where approval requests live", DEFAULT_INBOX_ROOT)
  .option("--as <name>", "your name — how approvals are recorded and how agents address you", process.env["GARU_USER"] ?? process.env["USER"] ?? "you")
  .description("Open the control room: your agents, live, in the browser. Add --up to run their schedules too.")
  .action(async (opts: { port: string; host: string; up?: boolean; askTimeout: string; notify?: string; logRoot: string; inboxRoot: string; as: string }) => {
    loadDotEnv();
    const staticDir = uiStaticDir();
    const t = (msg: string) => stderr.write(`${new Date().toISOString().slice(11, 19)} ${msg}\n`);
    const srv = startUiServer({
      port: Number(opts.port),
      host: opts.host,
      root: process.cwd(),
      logRoot: opts.logRoot,
      inboxRoot: opts.inboxRoot,
      chatRoot: DEFAULT_CHAT_ROOT,
      grantsPath: DEFAULT_GRANTS_PATH,
      dismissedPath: DEFAULT_DISMISSED_PATH,
      staticDir,
      userName: opts.as,
      decider: `${opts.as} (ui)`,
      up: Boolean(opts.up),
      askTimeoutMs: Number(opts.askTimeout) * 60_000,
      ...(opts.notify ? { notify: opts.notify } : {}),
      log: t,
    });
    stderr.write(`garu control room → ${srv.url}\n`);
    if (!/^(127\.0\.0\.1|localhost|::1)$/.test(opts.host)) {
      stderr.write(`  bound to ${opts.host}: the control room has no login, so anyone who can reach this address can approve actions.\n`);
      stderr.write(`  For your phone, prefer \`tailscale serve --bg ${opts.port}\` on the default host — HTTPS, your devices only. See docs/phone.md.\n`);
    }
    if (!existsSync(join(staticDir, "index.html"))) stderr.write(`  UI not built yet: run \`npm run build\` in the repo\n`);
    if (opts.up) stderr.write(`  running ${srv.agents} cron schedule(s) from Garufiles under ${process.cwd()}\n`);
    stderr.write(`Ctrl-C to stop.\n`);
    const shutdown = () => {
      stderr.write(`\nstopping…\n`);
      void srv.close().then(() => process.exit(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    await new Promise<never>(() => {});
  });

program
  .command("inbox")
  .option("--inbox-root <dir>", "where approval requests live", DEFAULT_INBOX_ROOT)
  .option("--all", "include decided and expired requests")
  .description("List approval requests waiting for you")
  .action((opts: { inboxRoot: string; all?: boolean }) => {
    const inbox = new Inbox({ root: opts.inboxRoot });
    const rows = opts.all ? inbox.all() : inbox.pending();
    if (rows.length === 0) {
      stdout.write(opts.all ? "inbox is empty\n" : "nothing waiting for approval\n");
      return;
    }
    for (const r of rows) {
      const state = r.decision ? (r.decision.approved ? `approved by ${r.decision.by}` : `denied by ${r.decision.by}`) : `pending, expires ${r.expiresAt.slice(11, 16)} UTC`;
      stdout.write(`${formatRequest(r)}\n    ${r.createdAt.slice(0, 19).replace("T", " ")}  ·  ${state}\n`);
    }
  });

for (const [cmd, approved] of [["approve", true], ["deny", false]] as const) {
  const c = program
    .command(cmd)
    .argument("<id>", "approval request id (from `garu inbox`)")
    .option("--inbox-root <dir>", "where approval requests live", DEFAULT_INBOX_ROOT)
    .option("--as <name>", "who is deciding", process.env["USER"] ?? "terminal")
    .description(approved ? "Let a paused tool call through" : "Refuse a paused tool call");
  if (approved) c.option("--for <duration>", "also allow this agent+tool (same path/url/recipient) without asking, e.g. 24h, 7d");
  else c.option("--note <text>", "tell the agent why; it reads this before its next step");
  c.action((id: string, opts: { inboxRoot: string; as: string; for?: string; note?: string }) => {
    const inbox = new Inbox({ root: opts.inboxRoot });
    try {
      const r = inbox.decide(id, approved, opts.as, opts.note);
      stdout.write(`${approved ? "✔ approved" : "✖ denied"} ${r.tool} for ${r.agent} — the run will continue\n`);
      if (approved && opts.for) {
        const g = new GrantStore(DEFAULT_GRANTS_PATH).create({ agent: r.agent, tool: r.tool, scope: scopeFor(r.args), durationMs: parseDuration(opts.for), createdBy: opts.as });
        stdout.write(`  grant ${g.id}: ${describeGrant(g)} until ${g.expiresAt.slice(0, 16).replace("T", " ")} UTC\n`);
      }
    } catch (e) {
      fail((e as Error).message);
    }
  });
}

const grantsCmd = program.command("grants").description("Temporary allow rules created with approve --for");
grantsCmd
  .command("list", { isDefault: true })
  .option("--all", "include expired and revoked")
  .description("List grants")
  .action((opts: { all?: boolean }) => {
    const store = new GrantStore(DEFAULT_GRANTS_PATH);
    const rows = opts.all ? store.all() : store.active();
    if (!rows.length) return void stdout.write(opts.all ? "no grants\n" : "no active grants\n");
    for (const g of rows) {
      const state = g.revokedAt ? "revoked" : Date.parse(g.expiresAt) < Date.now() ? "expired" : `until ${g.expiresAt.slice(0, 16).replace("T", " ")} UTC`;
      stdout.write(`${g.id}  ${describeGrant(g)}  · ${state} · used ${g.uses}×\n`);
    }
  });
grantsCmd
  .command("revoke")
  .argument("<id>", "grant id")
  .description("End a grant now")
  .action((id: string) => {
    try { const g = new GrantStore(DEFAULT_GRANTS_PATH).revoke(id); stdout.write(`revoked ${g.id}: ${describeGrant(g)}\n`); }
    catch (e) { fail((e as Error).message); }
  });

program
  .command("log")
  .argument("[agent]", "agent name (omit to list agents)")
  .argument("[run]", "run id (omit for the latest)")
  .option("--log-root <dir>", "where run logs live", DEFAULT_LOG_ROOT)
  .option("--json", "raw JSONL instead of pretty lines")
  .description("Show the flight recorder for a run")
  .action((agent: string | undefined, run: string | undefined, opts: { logRoot: string; json?: boolean }) => {
    if (!existsSync(opts.logRoot)) fail(`no runs yet under ${opts.logRoot}`);
    if (!agent) {
      for (const a of readdirSync(opts.logRoot)) {
        const n = readdirSync(join(opts.logRoot, a)).filter((f) => f.endsWith(".jsonl")).length;
        stdout.write(`${a}  (${n} run${n === 1 ? "" : "s"})\n`);
      }
      return;
    }
    const dir = join(opts.logRoot, agent);
    if (!existsSync(dir)) fail(`no runs for agent "${agent}"`);
    const runs = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
    const pick = run ? `${run}.jsonl` : runs.at(-1);
    if (!pick || !existsSync(join(dir, pick))) fail(`no run ${run ?? ""} for agent "${agent}"`);
    const events = readRun(join(dir, pick));
    for (const e of events) stdout.write((opts.json ? JSON.stringify(e) : formatEvent(e)) + "\n");
    if (!opts.json) stdout.write(summarize(events) + "\n");
  });

// ---------------------------------------------------------------------------
// garu new — scaffold an agent from a few questions
// ---------------------------------------------------------------------------

program
  .command("new")
  .argument("[name]", "agent name (lowercase, digits, hyphens)")
  .description("Create a new agent: a few questions, then a Garufile with a closed policy")
  .option("--task <text>", "what the agent does, in one or two sentences")
  .option("--when <schedule>", "manual | weekday-morning | hourly | daily | a cron expression")
  .option("--model <provider/model>", "e.g. gemini/gemini-3.5-flash-lite, ollama/qwen3:8b")
  .option("--web <hosts>", "comma-separated hosts it may fetch from, 'ask' to review each fetch, or 'none'")
  .option("--fs <path>", "a folder it can use, or 'none'")
  .option("--write <mode>", "allow | ask — whether it may write in that folder without asking")
  .option("--webhook <ENV_VAR>", "post to a Slack/Discord webhook kept in this .env variable")
  .option("--budget <usd>", "cap per run in USD")
  .option("-y, --yes", "accept defaults for anything not given")
  .option("--force", "overwrite an existing Garufile")
  .action(async (nameArg: string | undefined, opts: { task?: string; when?: string; model?: string; web?: string; fs?: string; write?: string; webhook?: string; budget?: string; yes?: boolean; force?: boolean }) => {
    loadDotEnv();
    const interactive = !opts.yes && stdin.isTTY;
    const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;
    const ask = async (label: string, def?: string): Promise<string> => {
      if (!rl) return def ?? "";
      const a = (await rl.question(def !== undefined ? `${label} [${def}] ` : `${label} `)).trim();
      return a || def || "";
    };
    const yesNo = async (label: string, def: boolean): Promise<boolean> => {
      if (!rl) return def;
      const a = (await rl.question(`${label} ${def ? "[Y/n]" : "[y/N]"} `)).trim().toLowerCase();
      return a ? a.startsWith("y") : def;
    };
    const pick = async <T extends string>(label: string, choices: { key: T; label: string }[], def: T): Promise<T> => {
      if (!rl) return def;
      stdout.write(`${label}\n`);
      choices.forEach((c, i) => stdout.write(`  ${i + 1}) ${c.label}${c.key === def ? "   (default)" : ""}\n`));
      const a = (await rl.question(`> `)).trim();
      const n = Number(a);
      if (a && Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1]!.key;
      return (choices.find((c) => c.key === a)?.key as T | undefined) ?? def;
    };
    const section = (s: string) => { if (rl) stdout.write(s ? `\n${s}\n` : "\n"); };

    try {
      if (rl) stdout.write(`\nLet's make an agent. Enter accepts the default.\n`);

      // Name
      let name = nameArg ?? "";
      while (!/^[a-z][a-z0-9-]*$/.test(name)) {
        if (name) stdout.write(`  name must be lowercase letters, digits and hyphens, starting with a letter\n`);
        if (!rl) fail(`agent name "${name || "(missing)"}" must be lowercase letters, digits and hyphens`);
        name = await ask("Name (lowercase, e.g. tomay, inbox-triage):");
      }
      const dir = join("agents", name);
      const file = join(dir, "Garufile.yaml");
      if (existsSync(file) && !opts.force) fail(`${file} already exists (use --force to overwrite)`);

      // Task
      let task = opts.task?.trim() ?? "";
      if (!task) {
        section(`What should ${name} do? One or two sentences, like you'd brief a new hire.`);
        task = await ask(">");
      }
      if (!task) fail(`--task is required when not interactive`);

      // Schedule
      let schedule: Schedule;
      if (opts.when) {
        schedule = (opts.when in SCHEDULES ? (opts.when as Schedule) : { cron: opts.when });
      } else {
        section("");
        const k = await pick(`When should it run?`, [
          { key: "manual", label: SCHEDULES.manual.label },
          { key: "weekday-morning", label: SCHEDULES["weekday-morning"].label },
          { key: "hourly", label: SCHEDULES.hourly.label },
          { key: "daily", label: SCHEDULES.daily.label },
          { key: "cron", label: "a cron expression I'll type" },
        ], "manual");
        schedule = k === "cron" ? { cron: await ask("Cron (minute hour day month weekday):", "0 9 * * *") } : k;
      }
      const cron = cronFor(schedule);
      if (cron) assertValidCron(cron);

      // Model
      const suggestions = suggestModel(process.env);
      let model = opts.model ?? "";
      if (!model) {
        section("");
        model = await pick(`Which model?`, suggestions.map((s) => ({ key: s.model, label: `${s.model}   — ${s.why}` })), suggestions[0]!.model);
      }
      if (!/^[a-z0-9-]+\/.+$/.test(model)) fail(`model must look like provider/model-id (got "${model}")`);

      // Web
      let web: ScaffoldAnswers["web"] = null;
      if (opts.web !== undefined) {
        web = opts.web === "none" ? null : opts.web === "ask" ? { hosts: [] } : { hosts: opts.web.split(",").map((h) => h.trim()).filter(Boolean) };
      } else if (rl) {
        section("");
        if (await yesNo(`Does it need to read from the web (APIs, pages)?`, false)) {
          const hosts = await ask(`Which hosts? Comma-separated, e.g. api.github.com, hn.algolia.com. Empty = review every fetch:`);
          web = { hosts: hosts.split(",").map((h) => h.trim()).filter(Boolean) };
        }
      }

      // Files
      let fs: ScaffoldAnswers["fs"] = null;
      const defaultWs = `./${dir}/workspace`;
      if (opts.fs !== undefined) {
        if (opts.fs !== "none") fs = { path: opts.fs, write: opts.write === "allow" ? "allow" : "ask" };
      } else if (rl) {
        section("");
        if (await yesNo(`Give it a folder to work in?`, true)) {
          const path = await ask(`Folder:`, defaultWs);
          const write = (await yesNo(`May it write there without asking each time? (it still can't touch anything outside)`, false)) ? "allow" : "ask";
          fs = { path, write };
        }
      } else if (opts.yes) {
        fs = { path: defaultWs, write: opts.write === "allow" ? "allow" : "ask" };
      }

      // Webhook
      let webhook: ScaffoldAnswers["webhook"] = null;
      if (opts.webhook) webhook = { envVar: opts.webhook };
      else if (rl) {
        section("");
        if (await yesNo(`Should it be able to post to a Slack or Discord channel (always asks first)?`, false)) {
          const envVar = await ask(`Name of the .env variable holding the webhook URL:`, `${name.toUpperCase().replace(/-/g, "_")}_WEBHOOK_URL`);
          webhook = { envVar };
        }
      }

      // Budget
      let maxCostUsd: number | null = isFreeModel(model) ? null : 0.05;
      if (opts.budget !== undefined) {
        maxCostUsd = Number(opts.budget);
        if (!Number.isFinite(maxCostUsd) || maxCostUsd < 0) fail(`--budget must be a non-negative number`);
      } else if (rl && maxCostUsd !== null) {
        section("");
        const b = await ask(`Cap per run, in dollars:`, String(maxCostUsd));
        maxCostUsd = Number(b);
        if (!Number.isFinite(maxCostUsd) || maxCostUsd < 0) fail(`budget must be a non-negative number`);
      }

      const answers: ScaffoldAnswers = { name, task, model, schedule, web, fs, webhook, maxCostUsd, fetchServerPath: fetchServerPath() };
      const text = renderGarufile(answers);
      const g = parseGarufile(text, file); // never write a file the kernel would reject

      mkdirSync(dir, { recursive: true });
      if (fs && fs.path.startsWith("./")) mkdirSync(resolve(fs.path), { recursive: true });
      writeFileSync(file, text);

      stdout.write(`\n✔ ${file}\n`);
      stdout.write(`  ${g.description}\n`);
      stdout.write(`  model ${g.model} · ${cron ? `cron "${cron}"` : "runs when told"} · ${g.tools.length} tool server(s) · ${g.policy.length} policy rules${maxCostUsd !== null ? ` · cap ${formatUsd(maxCostUsd)}/run` : ""}\n`);
      if (webhook) stdout.write(`\n  Add the webhook to .env before it runs:\n    read -s -p "webhook url: " W && echo && echo "${webhook.envVar}=$W" >> .env\n`);
      stdout.write(`\n  Try it:\n`);
      stdout.write(`    npm run garu -- run ${file}\n`);
      stdout.write(`  or open the control room (npm run garu -- ui --up), click ${name}, and press Run job.\n`);
      stdout.write(`  Edit ${file} any time; npm run garu -- validate ${file} checks it.\n`);
    } finally {
      rl?.close();
    }
  });

// ---------- helpers ----------

function loadGarufile(file: string): Garufile {
  const path = resolve(file);
  if (!existsSync(path) || !statSync(path).isFile()) fail(`no Garufile at ${path}`);
  try {
    return parseGarufile(readFileSync(path, "utf8"), file);
  } catch (e) {
    if (e instanceof GarufileError) fail(e.message);
    throw e;
  }
}

/** packages/ui/dist when running from source; the published CLI ships the same folder as ./ui. */
function uiStaticDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/dist
  for (const c of [resolve(here, "..", "..", "ui", "dist"), resolve(here, "ui")]) if (existsSync(c)) return c;
  return resolve(here, "..", "..", "ui", "dist");
}

/** docker/sandbox next to the repo root when running from source; falls back to cwd. */
function defaultSandboxContext(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/dist
  const fromSource = resolve(here, "..", "..", "..", "docker", "sandbox");
  return existsSync(fromSource) ? fromSource : resolve(process.cwd(), "docker", "sandbox");
}

/** Tiny .env loader so `garu run` works without extra tooling. Never overrides real env. */
function loadDotEnv(): void {
  const p = resolve(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const key = m[1]!;
    const val = m[2]!.replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const autoApprove: Approver = async () => ({ approved: true, by: "--yes" });
/** `garu up` default: nobody is at the keyboard, so an `ask` is a no. The model is told and moves on. */
const unattendedDeny: Approver = async () => ({ approved: false, by: "unattended (garu up --on-ask deny)" });

/** Push an approval request to a URL. Body is plain text so ntfy.sh (free push to your phone) shows it as-is. */
async function notify(url: string, r: ApprovalRequest): Promise<void> {
  const body = `${r.agent} wants ${r.tool}\n${JSON.stringify(r.args).slice(0, 300)}\nreason: ${r.reason}\n\ngaru approve ${r.id}\ngaru deny ${r.id}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain", Title: `Garu: approval needed (${r.agent})`, Priority: "high", Tags: "lock" },
      body,
    });
    if (!res.ok) stderr.write(`notify: ${url} answered HTTP ${res.status}\n`);
  } catch (e) {
    stderr.write(`notify: could not reach ${url}: ${(e as Error).message}\n`);
  }
}

function printSchedulerEvent(e: SchedulerEvent): void {
  const t = new Date().toISOString().slice(11, 19);
  switch (e.type) {
    case "scheduled":
      stderr.write(`${t} ⏰ ${e.agent}: "${e.cron}" next at ${e.nextRun?.toISOString() ?? "?"}\n`);
      break;
    case "fire":
      stderr.write(`${t} ▶ ${e.agent} (cron ${e.cron})\n`);
      break;
    case "skip.overlap":
      stderr.write(`${t} ↷ ${e.agent}: previous run still going, skipped this tick\n`);
      break;
    case "run.done": {
      const r = e.result;
      const cost = r.costUsd === null ? "unpriced" : formatUsd(r.costUsd);
      stderr.write(`${t} ■ ${e.agent}: ${r.status} in ${r.turns} turn(s), ${cost} — ${r.logPath}\n`);
      break;
    }
    case "run.failed":
      stderr.write(`${t} ✖ ${e.agent}: ${e.error}\n`);
      break;
    case "stopping":
      if (e.inFlight > 0) stderr.write(`${t} waiting for ${e.inFlight} run(s) to finish…\n`);
      break;
    case "stopped":
      stderr.write(`${t} garu up: stopped\n`);
      break;
  }
}
const autoDeny: Approver = async () => ({ approved: false, by: "--deny" });

const terminalApprover: Approver = async (req, decision) => {
  const rl = createInterface({ input: stdin, output: stderr });
  try {
    stderr.write(`\n┌ approval needed: ${req.server}.${req.tool}\n`);
    stderr.write(`│ ${decision.reason}\n`);
    stderr.write(`│ args: ${JSON.stringify(req.args, null, 2).split("\n").join("\n│       ")}\n`);
    const answer = (await rl.question("└ allow? [y/N] ")).trim().toLowerCase();
    if (answer === "y" || answer === "yes") return { approved: true, by: "terminal" };
    const note = (await rl.question("  why? (optional — the agent reads this) ")).trim();
    return { approved: false, by: "terminal", ...(note ? { note } : {}) };
  } finally {
    rl.close();
  }
};

/** One line of totals for a run: turns, tool calls by decision, tokens, cost. */
function summarize(events: Envelope[]): string {
  let turns = 0, inTok = 0, outTok = 0, cost = 0, priced = true;
  const decisions = { allow: 0, ask: 0, block: 0 };
  for (const { event: e } of events) {
    if (e.type === "model.turn") {
      turns++;
      inTok += e.inputTokens ?? 0;
      outTok += e.outputTokens ?? 0;
    } else if (e.type === "policy.decision") decisions[e.decision.action]++;
    else if (e.type === "run.end") {
      cost = e.costUsd ?? 0;
      priced = e.priced !== false;
    }
  }
  const calls = decisions.allow + decisions.ask + decisions.block;
  return `── ${turns} turn(s) · ${calls} tool call(s) (${decisions.allow} allowed, ${decisions.ask} asked, ${decisions.block} blocked) · ${inTok + outTok} tokens · ${priced ? formatUsd(cost) : "unpriced model"}`;
}

/** Path to the bundled fetch server, relative to where the Garufile will be run from (the cwd). */
function fetchServerPath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/dist
  const abs = resolve(here, "..", "..", "mcp-fetch", "dist", "index.js");
  const rel = relative(process.cwd(), abs);
  return rel.startsWith("..") ? abs : rel.split("\\").join("/");
}

function fail(msg: string): never {
  stderr.write(`garu: ${msg}\n`);
  process.exit(1);
}

program.parseAsync().catch((e: unknown) => {
  fail((e as Error).message);
});
