/**
 * Parked runs.
 *
 * A run that asks and gets no answer within a short hold doesn't sit in memory for hours: it writes
 * what it has (the conversation so far, the step it stopped in, its counters) beside its log, lets the
 * computer go, and ends as "parked". When the answer comes, the run is started again from this file,
 * picks up at the very call that asked, and carries on under the same run id, in the same log.
 * One JSON file per parked run: <root>/<agent>/<runId>.parked.json, readable like everything else.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Decision } from "./policy.js";
import type { ContentBlock, ModelMessage } from "./provider.js";

/** A call the model made that is waiting on a person: everything needed to make it later, or to tell the model it was declined. */
export interface ParkedCall {
  /** The model's id for the call, so its result goes back under the right one. */
  toolUseId: string;
  /** The tool as the model named it. */
  name: string;
  /** "<server>.<tool>" */
  qualified: string;
  args: Record<string, unknown>;
  /** The flight recorder's id for the call: the decision and the result are recorded under it when the run resumes. */
  callId: string;
  /** The inbox request to look up for the answer. */
  requestId: string;
  /** The policy decision that asked, for the "DENIED" line if the answer is no. */
  decision: Decision;
}

export type ParkedStep = { kind: "done"; block: ContentBlock } | { kind: "waiting"; call: ParkedCall };

export interface ParkedRun {
  version: 1;
  agent: string;
  runId: string;
  trigger: string;
  parkedAt: string;
  input?: string;
  dueAt?: string;
  owner?: string;
  /** Opaque to the kernel: whatever the host needs to start the run again the same way (the control room keeps the ask depth here). */
  host?: Record<string, unknown>;
  /** The conversation through the model's last turn. */
  messages: ModelMessage[];
  /** The step the run stopped in: every call of that turn, finished or waiting, in the model's order. */
  step: ParkedStep[];
  turn: number;
  completed: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  unmetered: boolean;
  /** Calls sent before parking: a resumed run that already changed something out there is never replayed as offline. */
  sent: { calls: number; writes: number };
}

export function parkedPath(root: string, agent: string, runId: string): string {
  return join(root, agent, `${runId}.parked.json`);
}

export function writeParked(root: string, p: ParkedRun): string {
  const path = parkedPath(root, p.agent, p.runId);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(p, null, 2) + "\n");
  renameSync(tmp, path);
  return path;
}

/** The parked state of a run, or null when it isn't parked (or the file is unreadable). */
export function readParked(root: string, agent: string, runId: string): ParkedRun | null {
  const path = parkedPath(root, agent, runId);
  if (!existsSync(path)) return null;
  try {
    const p = JSON.parse(readFileSync(path, "utf8")) as ParkedRun;
    return p.version === 1 && p.runId === runId ? p : null;
  } catch {
    return null;
  }
}

export function removeParked(root: string, agent: string, runId: string): void {
  try {
    unlinkSync(parkedPath(root, agent, runId));
  } catch {
    /* already gone */
  }
}

/** Every parked run under the root, oldest first. A file that can't be read is skipped, not fatal. */
export function listParked(root: string): ParkedRun[] {
  if (!existsSync(root)) return [];
  const out: ParkedRun[] = [];
  for (const agent of readdirSync(root)) {
    const dir = join(root, agent);
    let isDir = false;
    try { isDir = statSync(dir).isDirectory(); } catch { continue; }
    if (!isDir) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".parked.json")) continue;
      const p = readParked(root, agent, f.slice(0, -".parked.json".length));
      if (p) out.push(p);
    }
  }
  return out.sort((a, b) => a.parkedAt.localeCompare(b.parkedAt));
}
