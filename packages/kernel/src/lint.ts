/**
 * What a policy can't mean. A rule under one that already decides every call it could match never
 * wins (first match wins); a rule naming a tool server the Garufile doesn't have never matches at
 * all. Pure: the rules editor, the agent page and `garu doctor` word the findings.
 */
import type { PolicyRule } from "./garufile.js";

export interface RuleLint {
  /** The rule that has the problem, by position. */
  index: number;
  /** Shadowed: the earlier rule (by position) that matches first for everything this one could match. */
  by?: number;
  /** Orphaned: the tool server this rule names, which the Garufile doesn't have. */
  server?: string;
}

/** Built-in tools every run may be offered, not tied to a server in the Garufile. */
const BUILTIN = "garu";

/** Whether glob `a` matches every tool name glob `b` matches: a literal, or a prefix with one star at the end. */
export function globCovers(a: string, b: string): boolean {
  if (a === "*" || a === b) return true;
  if (!a.endsWith("*") || a.slice(0, -1).includes("*")) return false;
  return b.startsWith(a.slice(0, -1));
}

export function lintPolicy(rules: readonly PolicyRule[], servers: readonly string[] = []): RuleLint[] {
  const out: RuleLint[] = [];
  const known = new Set([...servers, BUILTIN]);
  rules.forEach((rule, i) => {
    const earlier = rules.findIndex((r, j) => j < i && !r.when && globCovers(r.tool, rule.tool));
    if (earlier >= 0) { out.push({ index: i, by: earlier }); return; }
    const dot = rule.tool.indexOf(".");
    const server = dot > 0 ? rule.tool.slice(0, dot) : "";
    if (servers.length && server && !server.includes("*") && !known.has(server)) out.push({ index: i, server });
  });
  return out;
}
