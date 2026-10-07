#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { join, resolve } from "node:path";
import {
  DEFAULT_SANDBOX_IMAGE,
  GarufileError,
  Inbox,
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

const DEFAULT_LOG_ROOT = resolve(process.cwd(), ".garu", "runs");
const DEFAULT_INBOX_ROOT = resolve(process.cwd(), ".garu", "inbox");

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
    const code = await new Promise<number>((done) => {
      const p = spawn("docker", ["build", "-t", opts.tag, opts.context], { stdio: "inherit" });
      p.on("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") fail("Docker isn't installed or not on PATH. Install Docker Desktop and try again.");
        fail(e.message);
      });
      p.on("exit", (c) => done(c ?? 1));
    });
    if (code !== 0) fail(`docker build exited with ${code}`);
    stdout.write(`✔ built ${opts.tag}. Agents with a \`sandbox:\` block will use it.\n`);
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
  program
    .command(cmd)
    .argument("<id>", "approval request id (from `garu inbox`)")
    .option("--inbox-root <dir>", "where approval requests live", DEFAULT_INBOX_ROOT)
    .option("--as <name>", "who is deciding", process.env["USER"] ?? "terminal")
    .description(approved ? "Let a paused tool call through" : "Refuse a paused tool call")
    .action((id: string, opts: { inboxRoot: string; as: string }) => {
      const inbox = new Inbox({ root: opts.inboxRoot });
      try {
        const r = inbox.decide(id, approved, opts.as);
        stdout.write(`${approved ? "✔ approved" : "✖ denied"} ${r.tool} for ${r.agent} — the run will continue\n`);
      } catch (e) {
        fail((e as Error).message);
      }
    });
}

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
    return { approved: answer === "y" || answer === "yes", by: "terminal" };
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

function fail(msg: string): never {
  stderr.write(`garu: ${msg}\n`);
  process.exit(1);
}

program.parseAsync().catch((e: unknown) => {
  fail((e as Error).message);
});
