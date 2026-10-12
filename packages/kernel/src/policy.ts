/**
 * Policy engine.
 *
 * Every tool call an agent wants to make is turned into a Decision here,
 * before anything reaches an MCP server. Rules are evaluated top to bottom;
 * the first rule whose tool glob AND argument predicates match wins.
 * If nothing matches, the answer is `ask` — never silently allow.
 */
import { posix } from "node:path";
import { minimatch } from "minimatch";
import type { ArgPredicate, PolicyAction, PolicyRule } from "./garufile.js";

export interface ToolCallRequest {
  /** MCP server name from the Garufile, e.g. "gmail". */
  server: string;
  /** Tool name as the server advertises it, e.g. "send". */
  tool: string;
  /** Arguments the model wants to pass. */
  args: Record<string, unknown>;
}

export interface Decision {
  action: PolicyAction;
  /** Index of the matching rule, or -1 for the implicit default. */
  ruleIndex: number;
  /** The matched rule's glob, or "*" for the default. */
  matched: string;
  reason: string;
}

export const DEFAULT_DECISION: Omit<Decision, "reason"> = {
  action: "ask",
  ruleIndex: -1,
  matched: "*",
};

/** "<server>.<tool>" is the fully-qualified name every rule globs against. */
export function qualifiedName(req: Pick<ToolCallRequest, "server" | "tool">): string {
  return `${req.server}.${req.tool}`;
}

/** Resolve a dotted path like "recipients.length" or "to.0.email" on an object. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object" && typeof cur !== "string") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * What a pattern sees. `a/../b` means `b`, so a prefix rule can't be slipped past with dots, and a
 * URL's path is resolved the same way. A value without dot segments passes through untouched.
 */
export function normalizeForMatch(v: string): string {
  if (!/(^|\/)\.\.?(\/|$)/.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
    try { return new URL(v).href; } catch { return v; }
  }
  return posix.normalize(v);
}

export function predicateHolds(value: unknown, p: ArgPredicate): boolean {
  if (p.exists !== undefined && (value !== undefined) !== p.exists) return false;
  if (p.eq !== undefined && !deepEqual(value, p.eq)) return false;
  if (p.neq !== undefined && deepEqual(value, p.neq)) return false;
  if (p.in !== undefined && !p.in.some((x) => deepEqual(x, value))) return false;
  if (p.matches !== undefined) {
    // A flag, not a pattern feature: "(?i:…)" inside the pattern needs Node 23+, and Garu runs on 22.
    const re = new RegExp(p.matches, p.ignoreCase ? "i" : "");
    // A list (recipients, paths) is matched entry by entry: a rule on `to` sees every address, not just the first.
    const values = Array.isArray(value) ? value : [value];
    if (!values.some((v) => typeof v === "string" && re.test(normalizeForMatch(v)))) return false;
  }
  const num = typeof value === "number" ? value : undefined;
  if (p.gt !== undefined && !(num !== undefined && num > p.gt)) return false;
  if (p.gte !== undefined && !(num !== undefined && num >= p.gte)) return false;
  if (p.lt !== undefined && !(num !== undefined && num < p.lt)) return false;
  if (p.lte !== undefined && !(num !== undefined && num <= p.lte)) return false;
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function ruleMatches(rule: PolicyRule, req: ToolCallRequest): boolean {
  if (!minimatch(qualifiedName(req), rule.tool, { nocase: false })) return false;
  if (!rule.when) return true;
  for (const [path, pred] of Object.entries(rule.when)) {
    if (!predicateHolds(getPath(req.args, path), pred)) return false;
  }
  return true;
}

export class PolicyEngine {
  constructor(private readonly rules: readonly PolicyRule[]) {}

  decide(req: ToolCallRequest): Decision {
    const name = qualifiedName(req);
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i]!;
      if (ruleMatches(rule, req)) {
        return {
          action: rule.action,
          ruleIndex: i,
          matched: rule.tool,
          reason: rule.reason ?? `rule #${i + 1} (${rule.tool} → ${rule.action})`,
        };
      }
    }
    return { ...DEFAULT_DECISION, reason: `no rule matched ${name}; default is ask` };
  }

  /**
   * What would happen to this tool regardless of arguments?
   * Returns the action if the first matching rule has no `when` conditions
   * (so every call resolves the same way), or undefined if the outcome
   * depends on arguments. Used to hide always-blocked tools from the model.
   */
  staticDecision(req: Pick<ToolCallRequest, "server" | "tool">): PolicyAction | undefined {
    const name = qualifiedName(req);
    for (const rule of this.rules) {
      if (!minimatch(name, rule.tool, { nocase: false })) continue;
      return rule.when ? undefined : rule.action;
    }
    return DEFAULT_DECISION.action;
  }

  /** Static lint: a rule no request can reach, because an earlier rule with no conditions already covers its tool. */
  unreachableRules(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.rules.length; i++) {
      const r = this.rules[i]!;
      const shadowed = this.rules.slice(0, i).some((e) => !e.when && (e.tool === "*" || e.tool === r.tool || (!r.tool.includes("*") && minimatch(r.tool, e.tool, { nocase: false }))));
      if (shadowed) out.push(i);
    }
    return out;
  }
}
