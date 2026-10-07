/**
 * Flight recorder.
 *
 * An append-only JSONL log of everything an agent does. One file per run.
 * If it isn't in the log, it didn't happen — and if the log can't be
 * written, the run fails loudly rather than continuing unrecorded.
 */
import { appendFileSync, mkdirSync, openSync, closeSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Decision, ToolCallRequest } from "./policy.js";
import { formatUsd } from "./pricing.js";

export type GaruEvent =
  | { type: "run.start"; agent: string; model: string; trigger: string }
  | { type: "tools.offered"; offered: string[]; hidden: string[] }
  | { type: "run.end"; status: "ok" | "error" | "blocked" | "max_turns" | "budget_exceeded"; summary?: string; costUsd?: number; priced?: boolean }
  | { type: "model.turn"; turn: number; inputTokens?: number; outputTokens?: number; text?: string; costUsd?: number; totalCostUsd?: number }
  | { type: "budget.exceeded"; costUsd: number; maxCostUsd: number; pendingToolCalls: number }
  | { type: "tool.request"; callId: string; request: ToolCallRequest }
  | { type: "policy.decision"; callId: string; decision: Decision }
  | { type: "approval.requested"; callId: string }
  | { type: "approval.resolved"; callId: string; approved: boolean; by: string }
  | { type: "tool.result"; callId: string; ok: boolean; durationMs: number; result?: unknown; error?: string }
  | { type: "error"; message: string; stack?: string };

export interface Envelope {
  /** Monotonic sequence within the run. */
  seq: number;
  ts: string;
  runId: string;
  agent: string;
  event: GaruEvent;
}

export interface RecorderOptions {
  /** Root directory for logs; a run writes to <root>/<agent>/<runId>.jsonl */
  root: string;
  agent: string;
  runId?: string;
  /** Mirror events to this sink too (e.g. stderr pretty-printer). */
  sink?: (e: Envelope) => void;
}

export class Recorder {
  readonly runId: string;
  readonly path: string;
  private seq = 0;
  private readonly sink: ((e: Envelope) => void) | undefined;
  private readonly agent: string;

  constructor(opts: RecorderOptions) {
    this.runId = opts.runId ?? newRunId();
    this.agent = opts.agent;
    this.sink = opts.sink;
    this.path = join(opts.root, opts.agent, `${this.runId}.jsonl`);
    mkdirSync(dirname(this.path), { recursive: true });
    // Create the file up front so a run with zero events still leaves a trace.
    closeSync(openSync(this.path, "a"));
  }

  record(event: GaruEvent): Envelope {
    const env: Envelope = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      runId: this.runId,
      agent: this.agent,
      event,
    };
    try {
      appendFileSync(this.path, JSON.stringify(env) + "\n");
    } catch (e) {
      throw new Error(`flight recorder: cannot append to ${this.path}: ${(e as Error).message}`);
    }
    this.sink?.(env);
    return env;
  }
}

/** Sortable, URL-safe run id: <yyyymmdd-hhmmss>-<8 hex>. */
export function newRunId(now = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-` +
    `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  return `${stamp}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/** Read a run log back. Throws if the file is missing or any line is corrupt. */
export function readRun(path: string): Envelope[] {
  if (!existsSync(path)) throw new Error(`no run log at ${path}`);
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as Envelope;
    } catch {
      throw new Error(`${path}:${i + 1}: corrupt JSONL line`);
    }
  });
}

/** Human-readable one-liner for a log entry. */
export function formatEvent(env: Envelope): string {
  const e = env.event;
  const t = env.ts.slice(11, 19);
  switch (e.type) {
    case "run.start":
      return `${t} ▶ run ${env.runId} (${e.agent}, ${e.model}, trigger=${e.trigger})`;
    case "tools.offered":
      return `${t}   tools: ${e.offered.length} offered${e.hidden.length ? `, ${e.hidden.length} hidden (always blocked: ${e.hidden.join(", ")})` : ""}`;
    case "run.end": {
      const cost = e.costUsd !== undefined ? ` · ${formatUsd(e.costUsd)}${e.priced === false ? " (unpriced model)" : ""}` : "";
      return `${t} ■ run ${e.status}${cost}${e.summary ? ` — ${e.summary}` : ""}`;
    }
    case "model.turn": {
      const cost = e.totalCostUsd !== undefined ? ` · ${formatUsd(e.totalCostUsd)} so far` : "";
      return `${t} ⋯ turn ${e.turn}${cost}${e.text ? `: ${truncate(e.text, 80)}` : ""}`;
    }
    case "budget.exceeded":
      return `${t} ✖ BUDGET ${formatUsd(e.costUsd)} ≥ cap ${formatUsd(e.maxCostUsd)} — stopping, ${e.pendingToolCalls} tool call(s) not executed`;
    case "tool.request":
      return `${t} → ${e.request.server}.${e.request.tool} ${truncate(JSON.stringify(e.request.args), 80)}`;
    case "policy.decision":
      return `${t}   policy: ${e.decision.action.toUpperCase()} (${e.decision.reason})`;
    case "approval.requested":
      return `${t}   waiting for approval…`;
    case "approval.resolved":
      return `${t}   ${e.approved ? "approved" : "denied"} by ${e.by}`;
    case "tool.result":
      return `${t} ← ${e.ok ? "ok" : "ERROR"} in ${e.durationMs}ms${e.error ? `: ${e.error}` : ""}`;
    case "error":
      return `${t} ✖ ${e.message}`;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
