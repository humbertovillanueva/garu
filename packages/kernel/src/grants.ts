/**
 * Grants — temporary, scoped "yes" decisions.
 *
 * "Allow this for 24 hours" should not mean editing a Garufile. A grant is a
 * small record: this agent, this tool, optionally this exact path/url/recipient,
 * until this time. The approver consults grants before pausing a run, and the
 * flight recorder shows "approved by grant …" so nothing is silent.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { ApprovalContext, Approver } from "./bus.js";
import type { ToolCallRequest } from "./policy.js";

/** Argument keys that identify "the same thing" across calls, in priority order. */
export const SCOPE_KEYS = ["path", "url", "to", "recipient", "recipients", "channel", "command", "cmd", "query"] as const;

export interface Grant {
  id: string;
  agent: string;
  /** "<server>.<tool>" */
  tool: string;
  /** Exact-match on one argument, e.g. { key: "path", value: "/workspace/heartbeat.log" }. Absent = any arguments. */
  scope?: { key: string; value: unknown };
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  /** Set when revoked early. */
  revokedAt?: string;
  uses: number;
}

export function scopeFor(args: Record<string, unknown>): { key: string; value: unknown } | undefined {
  for (const k of SCOPE_KEYS) {
    const v = args[k];
    if (v !== undefined && v !== null && (typeof v !== "object" || Array.isArray(v))) return { key: k, value: v };
  }
  return undefined;
}

export function describeGrant(g: Grant): string {
  const v = g.scope?.value;
  const scope = g.scope ? ` on ${g.scope.key}=${typeof v === "string" ? v : Array.isArray(v) ? v.map(String).join(", ") : JSON.stringify(v)}` : "";
  return `${g.agent} → ${g.tool}${scope}`;
}

export class GrantStore {
  private grants: Grant[] = [];

  constructor(readonly path: string, private readonly now: () => Date = () => new Date()) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const g = JSON.parse(line) as Grant;
          const i = this.grants.findIndex((x) => x.id === g.id);
          if (i >= 0) this.grants[i] = g; else this.grants.push(g); // later lines override earlier ones
        } catch {
          /* torn line */
        }
      }
    }
  }

  private persist(g: Grant): void {
    appendFileSync(this.path, JSON.stringify(g) + "\n");
  }

  /** Rewrite the file without history (used after many updates to keep it small). */
  compact(): void {
    writeFileSync(this.path, this.grants.map((g) => JSON.stringify(g)).join("\n") + (this.grants.length ? "\n" : ""));
  }

  create(input: { agent: string; tool: string; scope?: { key: string; value: unknown } | undefined; durationMs: number; createdBy: string }): Grant {
    const now = this.now();
    const g: Grant = {
      id: randomUUID().replace(/-/g, "").slice(0, 6),
      agent: input.agent,
      tool: input.tool,
      ...(input.scope ? { scope: input.scope } : {}),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.durationMs).toISOString(),
      createdBy: input.createdBy,
      uses: 0,
    };
    this.grants.push(g);
    this.persist(g);
    return g;
  }

  active(): Grant[] {
    const t = this.now().getTime();
    return this.grants.filter((g) => !g.revokedAt && Date.parse(g.expiresAt) > t);
  }

  all(): Grant[] {
    return [...this.grants];
  }

  /** The first active grant that covers this call, if any. */
  find(agent: string, req: ToolCallRequest): Grant | undefined {
    const tool = `${req.server}.${req.tool}`;
    return this.active().find((g) => {
      if (g.agent !== agent || g.tool !== tool) return false;
      if (!g.scope) return true;
      return JSON.stringify(req.args[g.scope.key]) === JSON.stringify(g.scope.value);
    });
  }

  use(id: string): void {
    const g = this.grants.find((x) => x.id === id);
    if (!g) return;
    g.uses++;
    this.persist(g);
  }

  revoke(id: string): Grant {
    const g = this.grants.find((x) => x.id === id);
    if (!g) throw new Error(`no grant "${id}"`);
    if (g.revokedAt) return g;
    g.revokedAt = this.now().toISOString();
    this.persist(g);
    return g;
  }
}

/** Wrap an approver so active grants answer first; only unmatched calls reach the human. */
export function withGrants(inner: Approver, grants: GrantStore): Approver {
  return async (req: ToolCallRequest, decision, ctx: ApprovalContext) => {
    const g = grants.find(ctx.agent, req);
    if (g) {
      grants.use(g.id);
      return { approved: true, by: `grant ${g.id} (${g.createdBy}, until ${g.expiresAt.slice(0, 16).replace("T", " ")})` };
    }
    return inner(req, decision, ctx);
  };
}

/** "24h", "90m", "7d" → ms. */
export function parseDuration(s: string): number {
  const m = /^(\d+)\s*(m|h|d)$/i.exec(s.trim());
  if (!m) throw new Error(`duration must look like 30m, 24h or 7d (got "${s}")`);
  const n = Number(m[1]);
  return n * { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]!.toLowerCase() as "m" | "h" | "d"];
}
