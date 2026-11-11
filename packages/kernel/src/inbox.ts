/**
 * Approval inbox.
 *
 * When an agent hits an `ask` rule and no human is at the terminal, the run
 * pauses here. Each request is a JSON file under <root>/; `garu inbox` lists
 * them, `garu approve <id>` / `garu deny <id>` write the decision, and the
 * paused run picks it up and continues. No server, no database: a folder you
 * can read with `ls`, like the flight recorder. Unanswered requests expire
 * as a deny — silence never means yes.
 *
 * A run that can park doesn't wait in memory for the whole of that time: after a short hold it is
 * told "parked", saves itself and lets go; the request stays open here, and the run is started again
 * when the answer lands (or the request expires). A run that can't park waits the old way.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ApprovalAnswer, ApprovalContext, Approver } from "./bus.js";
import type { Decision, ToolCallRequest } from "./policy.js";

export interface ApprovalRequest {
  id: string;
  agent: string;
  runId: string;
  callId: string;
  tool: string; // "<server>.<tool>"
  args: Record<string, unknown>;
  reason: string;
  createdAt: string;
  expiresAt: string;
  decision?: { approved: boolean; by: string; at: string; note?: string };
}

export interface InboxOptions {
  root: string;
  /** How long a request waits before it is denied as expired. */
  timeoutMs?: number;
  /** How often the paused run checks for a decision. */
  pollMs?: number;
  /** Called when a request is created — hook for notifications (terminal, phone push…). */
  onRequest?: (req: ApprovalRequest) => void | Promise<void>;
  now?: () => Date;
}

export class Inbox {
  readonly root: string;
  private readonly timeoutMs: number;
  private readonly pollMs: number;
  private readonly onRequest: InboxOptions["onRequest"];
  private readonly now: () => Date;

  constructor(opts: InboxOptions) {
    this.root = opts.root;
    this.timeoutMs = opts.timeoutMs ?? 30 * 60_000;
    this.pollMs = opts.pollMs ?? 1_000;
    this.onRequest = opts.onRequest;
    this.now = opts.now ?? (() => new Date());
    mkdirSync(this.root, { recursive: true });
  }

  /**
   * An Approver that pauses the run until someone decides, or the request expires. With `holdMs`, a
   * run that can park is held in memory only that long: past it the answer is "parked" and the
   * request stays open for the run to come back to.
   */
  approver(opts: { holdMs?: number } = {}): Approver {
    return async (req, decision, ctx) => {
      const r = await this.create(req, decision, ctx);
      return this.waitFor(r.id, { ...(opts.holdMs !== undefined ? { holdMs: opts.holdMs } : {}), parkable: ctx.parkable });
    };
  }

  async create(req: ToolCallRequest, decision: Decision, ctx: ApprovalContext): Promise<ApprovalRequest> {
    const now = this.now();
    let id = shortId();
    while (existsSync(this.path(id))) id = shortId(); // six characters: a collision is rare, and would overwrite history
    const r: ApprovalRequest = {
      id,
      agent: ctx.agent,
      runId: ctx.runId,
      callId: ctx.callId,
      tool: `${req.server}.${req.tool}`,
      args: req.args,
      reason: decision.reason,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.timeoutMs).toISOString(),
    };
    writeAtomic(this.path(r.id), r);
    await this.onRequest?.(r);
    return r;
  }

  private closedReason: string | null = null;
  /** Garu is stopping: every wait ends now, declined and recorded with this reason, so no ask outlives the run it paused. */
  close(reason = "inbox: garu stopped"): void {
    this.closedReason = reason;
  }

  /**
   * Resolve when a decision lands or the request expires (expiry = deny). A parkable wait answers
   * "parked" once the hold is over, or at once when Garu is stopping: the request stays open.
   */
  async waitFor(id: string, wait: { holdMs?: number; parkable?: boolean } = {}): Promise<ApprovalAnswer> {
    const holdUntil = wait.holdMs !== undefined ? this.now().getTime() + wait.holdMs : Infinity;
    for (;;) {
      const r = this.get(id);
      if (!r) return { approved: false, by: "inbox: request vanished" };
      if (r.decision) return { approved: r.decision.approved, by: r.decision.by, ...(r.decision.note ? { note: r.decision.note } : {}) };
      if (this.closedReason) {
        if (wait.parkable) return { parked: id };
        try { this.decide(id, false, this.closedReason); } catch { /* decided in the meantime */ }
        return { approved: false, by: this.closedReason };
      }
      if (this.now().getTime() >= Date.parse(r.expiresAt)) {
        this.decide(id, false, "inbox: expired");
        return { approved: false, by: "inbox: expired" };
      }
      if (this.now().getTime() >= holdUntil) {
        if (wait.parkable) return { parked: id };
        // A run that can't put itself away can't hold a server and the computer for hours either.
        const by = "inbox: the run could not wait longer";
        try { this.decide(id, false, by); } catch { /* decided in the meantime */ }
        return { approved: false, by };
      }
      await sleep(this.pollMs);
    }
  }

  /** Requests past their time with no decision are declined now, as expired, so nothing stays open forever once no run is waiting on it. */
  expireOverdue(): ApprovalRequest[] {
    const now = this.now().getTime();
    const out: ApprovalRequest[] = [];
    for (const r of this.all()) {
      if (r.decision || Date.parse(r.expiresAt) > now) continue;
      try { out.push(this.decide(r.id, false, "inbox: expired")); } catch { /* decided in the meantime */ }
    }
    return out;
  }

  /** Record a human decision. Throws if the request is unknown or already decided. */
  decide(id: string, approved: boolean, by: string, note?: string): ApprovalRequest {
    const r = this.get(id);
    if (!r) throw new Error(`no approval request "${id}"`);
    if (r.decision) throw new Error(`request "${id}" was already ${r.decision.approved ? "approved" : "denied"} by ${r.decision.by}`);
    const n = note?.trim().slice(0, 500);
    r.decision = { approved, by, at: this.now().toISOString(), ...(n ? { note: n } : {}) };
    writeAtomic(this.path(id), r);
    return r;
  }

  get(id: string): ApprovalRequest | undefined {
    const p = this.path(id);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf8")) as ApprovalRequest;
  }

  /** Undecided, unexpired requests, oldest first. */
  pending(): ApprovalRequest[] {
    const now = this.now().getTime();
    return this.all().filter((r) => !r.decision && Date.parse(r.expiresAt) > now);
  }

  all(): ApprovalRequest[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.root, f), "utf8")) as ApprovalRequest)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private path(id: string): string {
    if (!/^[a-z0-9]+$/.test(id)) throw new Error(`bad approval id "${id}"`);
    return join(this.root, `${id}.json`);
  }
}

/** 6 lowercase alphanumerics — short enough to type from a phone notification. */
export function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 6).toLowerCase();
}

function writeAtomic(path: string, data: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, path);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One-line human summary for notifications and `garu inbox`. */
export function formatRequest(r: ApprovalRequest): string {
  const args = JSON.stringify(r.args);
  return `${r.id}  ${r.agent}  ${r.tool}  ${args.length > 70 ? args.slice(0, 69) + "…" : args}  — ${r.reason}`;
}
