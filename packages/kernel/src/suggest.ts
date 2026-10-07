/**
 * Policy suggestions learned from your decisions.
 *
 * If you've approved the same agent + tool several times and never declined
 * it, Garu proposes the exact rule that would stop asking — scoped as tightly
 * as your approvals allow (one exact path, a common directory, or the tool).
 * You stay in control: a suggestion is a card with "Add to Garufile" on it,
 * and the edit preserves every comment in your file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument, YAMLSeq, isSeq, isMap } from "yaml";
import type { ApprovalRequest } from "./inbox.js";
import type { PolicyRule } from "./garufile.js";
import { parseGarufile } from "./garufile.js";
import { SCOPE_KEYS } from "./grants.js";

export interface Suggestion {
  id: string; // stable: "<agent>|<tool>"
  agent: string;
  tool: string;
  approvals: number;
  lastApprovedAt: string;
  rule: PolicyRule;
  /** Plain-language version of the rule. */
  summary: string;
}

export interface SuggestOptions {
  minApprovals?: number;
  /** Ignore decisions older than this. */
  windowMs?: number;
  now?: () => Date;
  /** Suggestion ids the user dismissed. */
  dismissed?: ReadonlySet<string>;
}

export function suggestRules(decided: readonly ApprovalRequest[], opts: SuggestOptions = {}): Suggestion[] {
  const min = opts.minApprovals ?? 3;
  const since = (opts.now?.() ?? new Date()).getTime() - (opts.windowMs ?? 14 * 86_400_000);
  const groups = new Map<string, ApprovalRequest[]>();
  for (const r of decided) {
    if (!r.decision || Date.parse(r.decision.at) < since) continue;
    if (/^grant /.test(r.decision.by) || /expired/.test(r.decision.by)) continue; // only human decisions teach
    const key = `${r.agent}|${r.tool}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: Suggestion[] = [];
  for (const [id, rs] of groups) {
    if (opts.dismissed?.has(id)) continue;
    if (rs.some((r) => !r.decision!.approved)) continue; // one decline = no suggestion
    if (rs.length < min) continue;
    const [agent, tool] = id.split("|") as [string, string];
    const rule = narrowestRule(tool, rs.map((r) => r.args));
    out.push({
      id,
      agent,
      tool,
      approvals: rs.length,
      lastApprovedAt: rs.map((r) => r.decision!.at).sort().at(-1)!,
      rule,
      summary: describeRule(rule),
    });
  }
  return out.sort((a, b) => b.approvals - a.approvals);
}

/** One exact value → eq; paths under one directory → regex prefix; otherwise the whole tool. */
export function narrowestRule(tool: string, argsList: Record<string, unknown>[]): PolicyRule {
  for (const key of SCOPE_KEYS) {
    const values = argsList.map((a) => a[key]);
    if (values.some((v) => v === undefined)) continue;
    const strs = values.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
    if (new Set(strs).size === 1) {
      return { tool, action: "allow", when: { [key]: { eq: values[0] } } };
    }
    if (key === "path" && values.every((v) => typeof v === "string")) {
      const dir = commonDir(values as string[]);
      if (dir.length > 1) return { tool, action: "allow", when: { path: { matches: `^${escapeRegex(dir)}` } } };
    }
    break; // the first present scope key decides
  }
  return { tool, action: "allow" };
}

function commonDir(paths: string[]): string {
  const parts = paths.map((p) => p.split("/").slice(0, -1));
  const first = parts[0] ?? [];
  let n = first.length;
  for (const p of parts) {
    let i = 0;
    while (i < n && i < p.length && p[i] === first[i]) i++;
    n = i;
  }
  const dir = first.slice(0, n).join("/");
  return dir ? dir + "/" : "";
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function describeRule(r: PolicyRule): string {
  if (!r.when) return `allow ${r.tool} with any arguments`;
  const [k, pred] = Object.entries(r.when)[0]!;
  if (pred.eq !== undefined) return `allow ${r.tool} when ${k} is exactly ${typeof pred.eq === "string" ? pred.eq : JSON.stringify(pred.eq)}`;
  if (pred.matches) return `allow ${r.tool} when ${k} starts with ${pred.matches.replace(/^\^/, "").replace(/\\(.)/g, "$1")}`;
  return `allow ${r.tool} when ${k} matches ${JSON.stringify(pred)}`;
}

/**
 * Insert a policy rule into a Garufile on disk, before the first existing rule
 * that could match the same tool (first match wins, so ours must come first).
 * Comments and formatting elsewhere are preserved. Validates the result and
 * leaves the file untouched if it would not parse.
 */
export function addPolicyRule(garufilePath: string, rule: PolicyRule, comment?: string): { inserted: number } {
  const text = readFileSync(garufilePath, "utf8");
  const doc = parseDocument(text);
  let policy = doc.get("policy");
  if (!isSeq(policy)) {
    policy = new YAMLSeq();
    doc.set("policy", policy);
  }
  const seq = policy as YAMLSeq;
  // Find the first rule whose glob could match our tool.
  let at = seq.items.length;
  for (let i = 0; i < seq.items.length; i++) {
    const item = seq.items[i];
    const glob = isMap(item) ? (item.get("tool") as string | undefined) : undefined;
    if (glob && globCouldMatch(glob, rule.tool)) { at = i; break; }
  }
  const node = doc.createNode(rule);
  if (comment) node.commentBefore = ` ${comment}`;
  seq.items.splice(at, 0, node);
  const out = doc.toString();
  parseGarufile(out, garufilePath); // throws if we broke it
  writeFileSync(garufilePath, out);
  return { inserted: at };
}

function globCouldMatch(glob: string, tool: string): boolean {
  const re = new RegExp("^" + glob.split("*").map(escapeRegex).join(".*") + "$");
  return re.test(tool);
}
