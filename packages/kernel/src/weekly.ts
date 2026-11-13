/**
 * The week in numbers, for a note the control room posts on Sunday evening: every run of the last
 * seven days, per agent and in total, plus how many notes the agents wrote into their notebooks.
 * Numbers only; the sentences are the host's, in the owner's language.
 */
import type { Memory } from "./memory.js";
import type { RunStore } from "./store.js";

export interface WeeklyAgent {
  agent: string;
  runs: number;
  ok: number;
  /** Ended in an error, a block, a hit limit. */
  failed: number;
  /** Cut off by the network or a busy model before changing anything: not counted as failures. */
  offline: number;
  /** Still running, or parked on an ask, when the week was counted. */
  waiting: number;
  asked: number;
  costUsd: number;
}

export interface WeeklyStats {
  /** The first and last local day covered (YYYY-MM-DD). */
  from: string;
  to: string;
  runs: number;
  actions: number;
  asked: number;
  costUsd: number;
  priced: boolean;
  /** Notes the agents wrote into their notebooks this week. */
  notes: number;
  agents: WeeklyAgent[];
}

export function weeklyStats(store: RunStore, opts: { memory?: Memory; agents?: readonly string[]; now?: Date } = {}): WeeklyStats {
  const now = opts.now ?? new Date();
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const out: WeeklyStats = { from: day(new Date(weekAgo + 86_400_000)), to: day(now), runs: 0, actions: 0, asked: 0, costUsd: 0, priced: true, notes: 0, agents: [] };
  const names = new Set([...store.agents(), ...(opts.agents ?? [])]);
  for (const agent of [...names].sort()) {
    const a: WeeklyAgent = { agent, runs: 0, ok: 0, failed: 0, offline: 0, waiting: 0, asked: 0, costUsd: 0 };
    for (const r of store.runs(agent)) {
      if (Date.parse(r.startedAt) < weekAgo) continue;
      a.runs++;
      if (r.offline) a.offline++;
      else if (r.status === "ok") a.ok++;
      else if (r.status === "running" || r.status === "parked") a.waiting++;
      else a.failed++;
      a.asked += r.toolCalls.ask;
      a.costUsd += r.costUsd;
      out.actions += r.toolCalls.allow;
      if (!r.priced) out.priced = false;
    }
    if (opts.memory) for (const n of opts.memory.read(agent)) if (n.at && Date.parse(`${n.at}T12:00:00`) >= weekAgo) out.notes++;
    if (a.runs === 0) continue;
    out.runs += a.runs;
    out.asked += a.asked;
    out.costUsd += a.costUsd;
    out.agents.push(a);
  }
  return out;
}

/** The Sunday the note for `now` belongs to, as a local day; null when it is not yet time (Sunday from 18:00 local). */
export function weeklyDue(now: Date, postedFor: ReadonlySet<string>): string | null {
  if (now.getDay() !== 0 || now.getHours() < 18) return null;
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return postedFor.has(key) ? null : key;
}
