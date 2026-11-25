/**
 * The facts garu doctor checks, gathered once for the terminal and the control room's Settings:
 * Node, .env and the keys the agents reference, the Garufiles, every sign-in and its age, the login
 * service, Tailscale and the reach file, what waits in the inbox and what sits parked.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { Inbox, discoverGarufiles, isRemoteServer, lintPolicy, listParked, localTime, missingEnv, signInFor } from "@garu/kernel";
import type { DoctorFacts } from "./doctor.js";
import { t } from "./i18n.js";
import { launchdLabel, launchdPlistPath, serviceName, systemdUnitPath } from "./service.js";
import { Reach } from "./ui-reach.js";
import { tailscaleAddresses } from "./ui-addresses.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const quiet = async (cmd: string, args: string[]) => { try { await run(cmd, args); return true; } catch { return false; } };

/** Whether this folder's login service is loaded and running (launchd or systemd). */
export async function serviceRunning(root: string): Promise<boolean> {
  if (process.platform === "darwin") {
    const uid = String(process.getuid?.() ?? 501);
    // `launchctl print` succeeds for any loaded service, running or not: read its state line.
    const out = await run("launchctl", ["print", `gui/${uid}/${launchdLabel(root)}`]).then((r) => r.stdout, () => "");
    return /^\s*state = running\b/m.test(out);
  }
  if (process.platform === "linux") return quiet("systemctl", ["--user", "is-active", "--quiet", `${serviceName(root)}.service`]);
  return false;
}

/** The build stamp a page carries, from its HTML. */
const stampIn = (html: string): string | null => /<meta name="garu-build" content="([^"]*)"/.exec(html)?.[1] ?? null;

/** The control room's build on disk (the UI built beside this CLI) and the one the control room on `port` serves right now. */
export async function buildStamps(port: number): Promise<{ onDisk: string | null; served: string | null }> {
  const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/dist
  let onDisk: string | null = null;
  for (const dir of [resolve(here, "..", "..", "ui", "dist"), resolve(here, "ui")]) {
    try { onDisk = stampIn(readFileSync(join(dir, "index.html"), "utf8")); break; } catch { /* not here */ }
  }
  let served: string | null = null;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) served = stampIn(await res.text());
  } catch { /* no control room answering */ }
  return { onDisk, served };
}

export async function gatherFacts(root: string, port: number): Promise<DoctorFacts> {
  const { agents, problems } = discoverGarufiles(root);
  const authRoot = resolve(root, ".garu", "auth");
  const referenced = new Set<string>();
  for (const a of agents) for (const tl of a.garufile.tools) {
    const scan = (v: string) => { for (const m of v.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/g)) referenced.add(m[1]!); };
    if (isRemoteServer(tl)) { scan(tl.url); Object.values(tl.headers).forEach(scan); } else { tl.args.forEach(scan); Object.values(tl.env).forEach(scan); }
  }
  // The model's key is read by the provider, not written in a Garufile: a Gemini agent needs GEMINI_API_KEY, an Anthropic one ANTHROPIC_API_KEY.
  for (const a of agents) {
    if (a.garufile.model.startsWith("gemini/")) referenced.add("GEMINI_API_KEY");
    if (a.garufile.model.startsWith("anthropic/")) referenced.add("ANTHROPIC_API_KEY");
    if (a.garufile.model.startsWith("openai/") && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env["OPENAI_BASE_URL"] ?? "")) referenced.add("OPENAI_API_KEY");
  }
  const installed = process.platform === "darwin" ? existsSync(launchdPlistPath(root)) : process.platform === "linux" ? existsSync(systemdUnitPath(root)) : null;
  const reach = new Reach(join(root, ".garu", "reach.json")).lost();
  return {
    node: process.versions.node,
    dotEnv: existsSync(join(root, ".env")),
    keys: [...referenced].sort().map((name) => ({ name, set: Boolean(process.env[name]) })),
    optional: [
      { name: "GARU_USER", set: Boolean(process.env["GARU_USER"]), does: t("names you in the greeting and the decisions") },
      { name: "GARU_NOTIFY_URL", set: Boolean(process.env["GARU_NOTIFY_URL"]), does: t("pushes asks to the phone through ntfy") },
      { name: "GARU_WEEKLY_WEBHOOK_URL", set: Boolean(process.env["GARU_WEEKLY_WEBHOOK_URL"]), does: t("posts the week in numbers on Sunday evening") },
      { name: "GARU_MONTHLY_BUDGET_USD", set: Boolean(process.env["GARU_MONTHLY_BUDGET_USD"]), does: t("pushes at 80% and 100% of the month's budget") },
    ],
    agents: agents.map((a) => a.garufile.name),
    problems,
    rules: agents.flatMap((a) => lintPolicy(a.garufile.policy, a.garufile.tools.map((tl) => tl.name)).map((l) => ({ agent: a.garufile.name, source: a.source, index: l.index, tool: a.garufile.policy[l.index]!.tool, ...(l.by !== undefined ? { by: { index: l.by, tool: a.garufile.policy[l.by]!.tool } } : {}), ...(l.server ? { server: l.server } : {}) }))),
    signIns: agents.flatMap((a) => a.garufile.tools.filter((tl) => tl.auth === "oauth").map((tl) => ({ agent: a.garufile.name, source: a.source, server: tl.name, at: signInFor(tl, authRoot).signedInAt() ?? null, google: /^https:\/\/accounts\.google\.com/.test(tl.oauth?.issuer ?? "") }))),
    service: installed === null ? null : { installed, running: installed && (await serviceRunning(root)) },
    tailscale: await tailscaleAddresses(port),
    reachLost: reach ? { since: localTime(reach.since, { seconds: false }) } : null,
    pending: new Inbox({ root: join(root, ".garu", "inbox") }).all().filter((r) => !r.decision).map((r) => ({ agent: r.agent, tool: r.tool, expiresAt: r.expiresAt })),
    parked: listParked(join(root, ".garu", "runs")).length,
    build: await buildStamps(port),
  };
}
