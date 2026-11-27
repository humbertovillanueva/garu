/**
 * `garu install <source>`: bring an agent from a URL, a GitHub path or a file, look at it before it
 * lands (what it runs on your computer, what it may do, what it needs), then write it under agents/.
 * The first step of sharing agents, without a registry. Pure helpers here; the command asks the questions.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isRemoteServer, lintPolicy, missingEnv, parseGarufile, type Garufile } from "@garu/kernel";
import { t } from "./i18n.js";
import { policyLines } from "./words.js";

export type Source = { kind: "url"; url: string } | { kind: "file"; path: string };

/**
 * Where the Garufile is: an https URL (a GitHub "blob" page becomes its raw file), `github:owner/repo/path`
 * (the main branch's raw file; `@branch` after the repo picks another), or a path on this computer.
 */
export function resolveSource(s: string): Source {
  const gh = /^github:([^/@]+)\/([^/@]+)(?:@([^/]+))?\/(.+)$/.exec(s);
  if (gh) return { kind: "url", url: `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3] ?? "main"}/${gh[4]}` };
  if (/^https?:\/\//.test(s)) {
    const u = new URL(s);
    if (u.hostname === "github.com") {
      const m = /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/.exec(u.pathname);
      if (m) return { kind: "url", url: `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}` };
    }
    if (u.protocol !== "https:") throw new Error(t("an agent comes over https, not http"));
    return { kind: "url", url: u.href };
  }
  return { kind: "file", path: s };
}

export async function fetchSource(src: Source, fetchFn: typeof fetch = fetch): Promise<string> {
  if (src.kind === "file") {
    if (!existsSync(src.path)) throw new Error(t("no file at {path}", { path: src.path }));
    return readFileSync(src.path, "utf8");
  }
  const res = await fetchFn(src.url);
  if (!res.ok) throw new Error(t("{url} answered HTTP {status}", { url: src.url, status: res.status }));
  const text = await res.text();
  if (text.length > 200_000) throw new Error(t("that file is too big to be a Garufile"));
  return text;
}

/** The look before it lands: what it runs here, what it may do, what it needs. One line each, for the terminal. */
export function describeForInstall(g: Garufile, env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  out.push(t("{name}: {description}", { name: g.name, description: g.description || t("(no description)") }));
  out.push(t("model {model} · {n} tool server(s) · {rules} rule(s)", { model: g.model, n: g.tools.length, rules: g.policy.length }));
  const cron = g.triggers.find((tr) => tr.cron)?.cron;
  const doors = g.triggers.filter((tr) => tr.webhook).map((tr) => tr.webhook);
  out.push(cron ? t("runs on the schedule {cron}", { cron }) : t("runs when told"));
  if (doors.length) out.push(t("opens a webhook door: {list}", { list: doors.join(", ") }));
  for (const tool of g.tools) {
    if (isRemoteServer(tool)) out.push(t("connects to {url} as {server}", { url: tool.url, server: tool.name }));
    else out.push(t("runs on this computer: {command}", { command: [tool.command, ...tool.args].join(" ") }));
    if (tool.auth === "oauth") out.push(t("  signs in with {issuer} (garu auth, or the agent's page)", { issuer: isRemoteServer(tool) ? tool.url : String(tool.oauth?.issuer) }));
  }
  if (g.sandbox) out.push(t("its tool servers run in a Docker container ({network})", { network: g.sandbox.network }));
  for (const l of policyLines(g.policy)) out.push(l);
  for (const l of lintPolicy(g.policy, g.tools.map((tl) => tl.name))) {
    if (l.by !== undefined) out.push(`⚠ ${t("rule {n} ({tool}) never wins; rule {m} ({other}) above it matches first", { n: l.index + 1, tool: g.policy[l.index]!.tool, m: l.by + 1, other: g.policy[l.by]!.tool })}`);
    else if (l.server) out.push(`⚠ ${t("rule {n} ({tool}) names {server}, a tool server this file doesn't have", { n: l.index + 1, tool: g.policy[l.index]!.tool, server: l.server })}`);
  }
  const needs = missingEnv(g.tools, env);
  if (needs.length) out.push(`⚠ ${t("needs {vars} in .env before it can run", { vars: needs.map((n) => `$\{${n}\}`).join(", ") })}`);
  return out;
}

/** Write it under agents/<name>/Garufile.yaml; an existing agent is left alone unless `force`. */
export function installGarufile(text: string, root: string, opts: { name?: string; force?: boolean } = {}): { file: string; garufile: Garufile } {
  const parsed = parseGarufile(text, opts.name ? `${opts.name}/Garufile.yaml` : "Garufile.yaml");
  let out = text;
  if (opts.name && opts.name !== parsed.name) {
    if (!/^[a-z][a-z0-9-]*$/.test(opts.name)) throw new Error(t("name must be lowercase letters, digits and hyphens, starting with a letter"));
    out = text.replace(/^name:\s*.*$/m, `name: ${opts.name}`);
  }
  const garufile = parseGarufile(out, "Garufile.yaml");
  const dir = join(root, "agents", garufile.name);
  const file = join(dir, "Garufile.yaml");
  if (existsSync(file) && !opts.force) throw new Error(t("{file} already exists (use --force to overwrite)", { file: join("agents", garufile.name, "Garufile.yaml") }));
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, out.endsWith("\n") ? out : `${out}\n`);
  return { file, garufile };
}
