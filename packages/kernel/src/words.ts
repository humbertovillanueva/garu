/**
 * A policy in plain words, for the agent page, `garu try` and `garu install`: what the agent may do on its
 * own, what it asks about, what it never does. Built from the rules in order, so it says what the engine
 * would do, not what the file looks like. Pure; the callers word the sentences in the reader's language
 * through the sentence keys this returns.
 */
import type { PolicyRule } from "./garufile.js";

export interface PolicyWords {
  /** Tools (as the rule names them) the agent uses without asking, in rule order, each once. */
  allows: { tool: string; when?: string }[];
  /** Tools it asks about first. */
  asks: { tool: string; when?: string }[];
  /** Tools it never gets; `everything` when a catch-all block closes the file. */
  blocks: { tool: string; when?: string }[];
  /** How the file ends for a call no rule names: "ask" (Garu's default), or what the catch-all says. */
  otherwise: "allow" | "ask" | "block";
}

/** A `when` as a short phrase: `to is lena@example.com`, `url matches ^https://api\.github\.com`. */
export function whenInWords(when: PolicyRule["when"]): string | undefined {
  if (!when) return undefined;
  const parts: string[] = [];
  for (const [path, p] of Object.entries(when)) {
    if (p.eq !== undefined) parts.push(`${path} is ${JSON.stringify(p.eq)}`);
    if (p.neq !== undefined) parts.push(`${path} is not ${JSON.stringify(p.neq)}`);
    if (p.in !== undefined) parts.push(`${path} is one of ${JSON.stringify(p.in)}`);
    // A long pattern (Bea's no-reply list runs to 300 characters) is cut: the words are a glance, the file has the rest.
    if (p.matches !== undefined) parts.push(`${path} matches ${p.matches.length > 48 ? `${p.matches.slice(0, 45)}…` : p.matches}${p.ignoreCase ? " (any case)" : ""}`);
    if (p.gt !== undefined) parts.push(`${path} > ${p.gt}`);
    if (p.gte !== undefined) parts.push(`${path} ≥ ${p.gte}`);
    if (p.lt !== undefined) parts.push(`${path} < ${p.lt}`);
    if (p.lte !== undefined) parts.push(`${path} ≤ ${p.lte}`);
    if (p.exists !== undefined) parts.push(p.exists ? `${path} is given` : `${path} is not given`);
  }
  return parts.join(" and ") || undefined;
}

export function policyWords(rules: readonly PolicyRule[]): PolicyWords {
  const out: PolicyWords = { allows: [], asks: [], blocks: [], otherwise: "ask" };
  const seen = new Set<string>();
  for (const r of rules) {
    if (r.tool === "*" && !r.when) { out.otherwise = r.action; break; } // nothing after a catch-all can win
    const key = `${r.action} ${r.tool} ${whenInWords(r.when) ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const w = whenInWords(r.when);
    const entry = w ? { tool: r.tool, when: w } : { tool: r.tool };
    (r.action === "allow" ? out.allows : r.action === "ask" ? out.asks : out.blocks).push(entry);
  }
  return out;
}
