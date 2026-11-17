/**
 * The week in numbers, for a note the control room posts on Sunday evening: every run of the last
 * seven days, per agent and in total, the asks that expired unanswered, plus how many notes the agents wrote into their notebooks.
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
  /** Asks nobody answered in time, so they became a no. */
  expired: number;
  /** The tools the policy blocked this week, with how many runs hit each. */
  blocked: { tool: string; runs: number }[];
  costUsd: number;
}

export interface WeeklyStats {
  /** The first and last local day covered (YYYY-MM-DD). */
  from: string;
  to: string;
  runs: number;
  actions: number;
  asked: number;
  /** Asks that expired unanswered this week, over every agent. */
  expired: number;
  costUsd: number;
  priced: boolean;
  /** Notes the agents wrote into their notebooks this week. */
  notes: number;
  agents: WeeklyAgent[];
}

/** The inbox, as far as the week needs it: every request, with how and when it was decided. */
export interface WeeklyInbox { all(): { agent: string; decision?: { by: string; at: string } }[] }

export function weeklyStats(store: RunStore, opts: { memory?: Memory; inbox?: WeeklyInbox; agents?: readonly string[]; now?: Date } = {}): WeeklyStats {
  const now = opts.now ?? new Date();
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const expired = new Map<string, number>();
  if (opts.inbox) for (const r of opts.inbox.all()) if (r.decision && /expired/.test(r.decision.by) && Date.parse(r.decision.at) >= weekAgo) expired.set(r.agent, (expired.get(r.agent) ?? 0) + 1);
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const out: WeeklyStats = { from: day(new Date(weekAgo + 86_400_000)), to: day(now), runs: 0, actions: 0, asked: 0, expired: 0, costUsd: 0, priced: true, notes: 0, agents: [] };
  const names = new Set([...store.agents(), ...(opts.agents ?? []), ...expired.keys()]);
  for (const agent of [...names].sort()) {
    const a: WeeklyAgent = { agent, runs: 0, ok: 0, failed: 0, offline: 0, waiting: 0, asked: 0, expired: expired.get(agent) ?? 0, blocked: [], costUsd: 0 };
    const blockedBy = new Map<string, number>();
    for (const r of store.runs(agent)) {
      if (Date.parse(r.startedAt) < weekAgo) continue;
      a.runs++;
      if (r.offline) a.offline++;
      else if (r.status === "ok") a.ok++;
      else if (r.status === "running" || r.status === "parked") a.waiting++;
      else a.failed++;
      a.asked += r.toolCalls.ask;
      for (const tool of r.blocked ?? []) blockedBy.set(tool, (blockedBy.get(tool) ?? 0) + 1);
      a.costUsd += r.costUsd;
      out.actions += r.toolCalls.allow;
      if (!r.priced) out.priced = false;
    }
    if (opts.memory) for (const n of opts.memory.read(agent)) if (n.at && Date.parse(`${n.at}T12:00:00`) >= weekAgo) out.notes++;
    a.blocked = [...blockedBy.entries()].map(([tool, runs]) => ({ tool, runs })).sort((x, y) => y.runs - x.runs || x.tool.localeCompare(y.tool));
    if (a.runs === 0 && a.expired === 0) continue;
    out.runs += a.runs;
    out.asked += a.asked;
    out.expired += a.expired;
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
