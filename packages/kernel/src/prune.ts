/**
 * Pruning old runs.
 *
 * The flight recorder keeps every run forever by default. A heartbeat agent writes four a day, and
 * every count on every page reads them all, so a keep window lets old ones go: a run older than the
 * window loses its log, and nothing else. Never one still running or parked, never one inside the
 * window. Inbox requests that are settled (decided, or expired long ago) and older than the window go
 * too, and so do chat messages older than it (a thread keeps its newer lines, or goes when none is
 * left). A plan says what would go; applying it deletes.
 */
import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RunStore } from "./store.js";

export interface PrunePlan {
  keepMs: number;
  /** Runs that would go, oldest first. */
  runs: { agent: string; runId: string; startedAt: string; path: string }[];
  /** Settled inbox requests that would go. */
  requests: string[];
  /** Runs old enough but kept: still running, or parked on an ask. */
  spared: number;
  /** Chat threads with messages older than the window: how many lines go, and the lines that stay. */
  chats: { agent: string; path: string; drop: number; keep: string[] }[];
}

export function planPrune(opts: { logRoot: string; inboxRoot?: string; chatRoot?: string; keepMs: number; now?: Date }): PrunePlan {
  const cutoff = (opts.now ?? new Date()).getTime() - opts.keepMs;
  const store = new RunStore(opts.logRoot);
  const plan: PrunePlan = { keepMs: opts.keepMs, runs: [], requests: [], spared: 0, chats: [] };
  for (const agent of store.agents()) {
    for (const r of store.runs(agent)) {
      if (Date.parse(r.startedAt) >= cutoff) continue;
      if (r.status === "running" || r.status === "parked") {
        plan.spared++;
        continue;
      }
      plan.runs.push({ agent, runId: r.runId, startedAt: r.startedAt, path: r.path });
    }
  }
  if (opts.inboxRoot && existsSync(opts.inboxRoot)) {
    for (const f of readdirSync(opts.inboxRoot)) {
      if (!f.endsWith(".json")) continue;
      const path = join(opts.inboxRoot, f);
      try {
        const req = JSON.parse(readFileSync(path, "utf8")) as { createdAt?: string; expiresAt?: string; decision?: unknown };
        const created = Date.parse(req.createdAt ?? "");
        const settled = Boolean(req.decision) || Date.parse(req.expiresAt ?? "") < cutoff;
        if (Number.isFinite(created) && created < cutoff && settled) plan.requests.push(path);
      } catch {
        /* not a request of ours: left alone */
      }
    }
  }
  if (opts.chatRoot && existsSync(opts.chatRoot)) {
    for (const f of readdirSync(opts.chatRoot)) {
      if (!f.endsWith(".jsonl")) continue;
      const path = join(opts.chatRoot, f);
      const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim().length > 0);
      // A line that can't be read, or has no time, is kept: never drop what can't be judged.
      const keep = lines.filter((l) => {
        try {
          const ts = Date.parse((JSON.parse(l) as { ts?: string }).ts ?? "");
          return !Number.isFinite(ts) || ts >= cutoff;
        } catch {
          return true;
        }
      });
      if (keep.length < lines.length) plan.chats.push({ agent: f.slice(0, -".jsonl".length), path, drop: lines.length - keep.length, keep });
    }
  }
  plan.runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return plan;
}

export function applyPrune(plan: PrunePlan): { runs: number; requests: number; messages: number } {
  let runs = 0;
  let requests = 0;
  let messages = 0;
  for (const r of plan.runs) {
    try { unlinkSync(r.path); runs++; } catch { /* already gone */ }
  }
  for (const p of plan.requests) {
    try { unlinkSync(p); requests++; } catch { /* already gone */ }
  }
  for (const c of plan.chats) {
    try {
      if (c.keep.length === 0) unlinkSync(c.path);
      else {
        // The thread is rewritten whole, under a temporary name first, so a crash never leaves half of it.
        const tmp = `${c.path}.${process.pid}.tmp`;
        writeFileSync(tmp, c.keep.join("\n") + "\n");
        renameSync(tmp, c.path);
      }
      messages += c.drop;
    } catch { /* left as it was */ }
  }
  return { runs, requests, messages };
}
