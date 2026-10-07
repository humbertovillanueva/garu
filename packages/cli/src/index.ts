#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { join, resolve } from "node:path";
import {
  GarufileError,
  PolicyEngine,
  formatEvent,
  parseGarufile,
  readRun,
  runAgent,
  type Approver,
  type Garufile,
} from "@garu/kernel";

const DEFAULT_LOG_ROOT = resolve(process.cwd(), ".garu", "runs");

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
    stderr.write(`\nrun ${res.runId} → ${res.status} in ${res.turns} turn(s). log: ${res.logPath}\n`);
    process.exitCode = res.status === "ok" ? 0 : 1;
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

function fail(msg: string): never {
  stderr.write(`garu: ${msg}\n`);
  process.exit(1);
}

program.parseAsync().catch((e: unknown) => {
  fail((e as Error).message);
});
