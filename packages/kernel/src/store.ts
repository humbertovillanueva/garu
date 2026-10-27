/**
 * Read-side store over the flight recorder on disk.
 *
 * The control room, `garu log` and anything else that wants to look at what
 * agents did reads through here. The log files are the source of truth; a
 * finished run's summary is kept in memory until its file changes, since the
 * control room asks every two seconds while an agent works.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { readRun, type Envelope } from "./recorder.js";

export interface RunSummary {
  agent: string;
  runId: string;
  startedAt: string;
  endedAt: string | null;
  status: "running" | "interrupted" | "ok" | "error" | "blocked" | "max_turns" | "budget_exceeded";
  trigger: string;
  model: string;
  sandbox: { image: string; network: string } | null;
  turns: number;
  toolCalls: { allow: number; ask: number; block: number };
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  priced: boolean;
  summary: string | null;
  /** Ended before the model answered because the network was down; the schedule doesn't count it. */
  offline?: boolean;
  path: string;
}

/** One agent's newest result, for Home: what it did, and the document it wrote if it wrote one. */
export interface TodayResult {
  agent: string;
  runId: string;
  endedAt: string;
  summary: string | null;
  costUsd: number;
  priced: boolean;
  /** The markdown file the run wrote (a brief, a summary), cut at 4,000 characters. */
  doc: { path: string; content: string } | null;
}
/** The last seven days in four numbers: runs, actions taken without asking, times it asked you, money. */
export interface WeekStats {
  runs: number;
  actions: number;
  asked: number;
  costUsd: number;
  priced: boolean;
}

export interface AgentSummary {
  name: string;
  runs: number;
  lastRun: RunSummary | null;
  costTodayUsd: number;
  runsToday: number;
  model: string | null;
}

/** A run with no run.end whose log hasn't been touched for this long was killed, not paused. */
export const INTERRUPTED_AFTER_MS = 10 * 60_000;
/** A run paused on an approval is quiet on purpose, but an ask expires within the hour; past this it was killed while waiting. */
export const WAITING_INTERRUPTED_AFTER_MS = 2 * 60 * 60_000;

export function summarizeRun(path: string, events: Envelope[], now = Date.now()): RunSummary | null {
  const start = events.find((e) => e.event.type === "run.start");
  if (!start || start.event.type !== "run.start") return null;
  const s: RunSummary = {
    agent: start.agent,
    runId: start.runId,
    startedAt: start.ts,
    endedAt: null,
    status: "running",
    trigger: start.event.trigger,
    model: start.event.model,
    sandbox: start.event.sandbox ?? null,
    turns: 0,
    toolCalls: { allow: 0, ask: 0, block: 0 },
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    priced: true,
    summary: null,
    path,
  };
  for (const { ts, event: e } of events) {
    switch (e.type) {
      case "model.turn":
        s.turns++;
        s.inputTokens += e.inputTokens ?? 0;
        s.outputTokens += e.outputTokens ?? 0;
        if (e.totalCostUsd !== undefined) s.costUsd = e.totalCostUsd;
        break;
      case "policy.decision":
        s.toolCalls[e.decision.action]++;
        break;
      case "run.end":
        s.endedAt = ts;
        s.status = e.status;
        s.costUsd = e.costUsd ?? s.costUsd;
        s.priced = e.priced !== false;
        if (e.offline) s.offline = true;
        s.summary = e.summary ?? null;
        break;
    }
  }
  if (s.status === "running") {
    const last = events.at(-1)?.ts;
    // Waiting on an approval is legitimately quiet; anything else that's silent this long is dead.
    const waiting = events.some((e) => e.event.type === "approval.requested") && !events.some((e) => e.event.type === "approval.resolved");
    if (last && now - Date.parse(last) > (waiting ? WAITING_INTERRUPTED_AFTER_MS : INTERRUPTED_AFTER_MS)) s.status = "interrupted";
  }
  return s;
}

/**
 * The calendar day of an instant on this machine, as YYYY-MM-DD. Garu runs on the owner's computer, so
 * "today" is the owner's day: a run at 7 PM in Denver is today's, not tomorrow's UTC date.
 */
export function localDay(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class RunStore {
  constructor(readonly root: string) {}

  agents(): string[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root)
      .filter((d) => statSync(join(this.root, d)).isDirectory())
      .sort();
  }

  /**
   * One summary per log file, kept while the file's size and mtime stay the same. A run still going
   * is not kept: its status depends on the clock (quiet too long means interrupted), and its file is
   * about to change anyway. A corrupt log is kept as null, so it isn't parsed again until it changes.
   */
  private readonly summaries = new Map<string, { mtimeMs: number; size: number; summary: RunSummary | null }>();

  /** Runs for one agent, newest first. Corrupt logs are skipped, not fatal. */
  runs(agent: string): RunSummary[] {
    const dir = join(this.root, agent);
    if (!existsSync(dir)) return [];
    const out: RunSummary[] = [];
    const seen = new Set<string>();
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const path = join(dir, f);
      seen.add(path);
      let st: { mtimeMs: number; size: number };
      try {
        st = statSync(path);
      } catch {
        continue; // gone between the listing and now
      }
      const kept = this.summaries.get(path);
      let s: RunSummary | null;
      if (kept && kept.mtimeMs === st.mtimeMs && kept.size === st.size) {
        s = kept.summary;
      } else {
        try {
          s = summarizeRun(path, readRun(path));
        } catch {
          s = null; // corrupt or half-written log
        }
        if (!s || s.endedAt) this.summaries.set(path, { mtimeMs: st.mtimeMs, size: st.size, summary: s });
        else this.summaries.delete(path);
      }
      if (s) out.push(s);
    }
    // Logs that were deleted leave the memory too.
    for (const key of this.summaries.keys()) if (key.startsWith(dir + sep) && !seen.has(key)) this.summaries.delete(key);
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  run(agent: string, runId: string): Envelope[] | null {
    if (!/^[A-Za-z0-9._-]+$/.test(agent) || !/^[A-Za-z0-9-]+$/.test(runId)) return null;
    const path = join(this.root, agent, `${runId}.jsonl`);
    return existsSync(path) ? readRun(path) : null;
  }

  allRuns(): RunSummary[] {
    return this.agents()
      .flatMap((a) => this.runs(a))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  agentSummaries(now = new Date()): AgentSummary[] {
    const today = localDay(now);
    return this.agents().map((name) => {
      const runs = this.runs(name);
      const todays = runs.filter((r) => localDay(r.startedAt) === today);
      return {
        name,
        runs: runs.length,
        lastRun: runs[0] ?? null,
        costTodayUsd: todays.reduce((s, r) => s + r.costUsd, 0),
        runsToday: todays.length,
        model: runs[0]?.model ?? null,
      };
    });
  }

  /** The newest run the schedule itself started (cron or catch-up) that reached the model; an offline attempt doesn't count. */
  lastScheduledRun(agent: string): RunSummary | null {
    return this.runs(agent).find((r) => (r.trigger.startsWith("cron:") || r.trigger.startsWith("catch-up:")) && !r.offline) ?? null;
  }

  /**
   * What the agents did lately: each agent's newest good result from the last seven days, newest
   * first (a week, so Friday's brief is still there on Monday morning), and the week in four numbers. `skip` names agents that run so often (a heartbeat)
   * that their results belong in the activity list instead.
   */
  today(now = new Date(), skip: ReadonlySet<string> = new Set()): { results: TodayResult[]; week: WeekStats } {
    const weekAgo = now.getTime() - 7 * 86_400_000;
    const results: TodayResult[] = [];
    const week: WeekStats = { runs: 0, actions: 0, asked: 0, costUsd: 0, priced: true };
    for (const agent of this.agents()) {
      const runs = this.runs(agent);
      for (const r of runs) {
        if (Date.parse(r.startedAt) < weekAgo) continue;
        week.runs++;
        week.actions += r.toolCalls.allow;
        week.asked += r.toolCalls.ask;
        week.costUsd += r.costUsd;
        if (!r.priced) week.priced = false;
      }
      if (skip.has(agent)) continue;
      const last = runs.find((r) => Date.parse(r.startedAt) >= weekAgo && r.endedAt && r.status === "ok" && r.summary);
      if (!last) continue;
      results.push({ agent, runId: last.runId, endedAt: last.endedAt!, summary: last.summary, costUsd: last.costUsd, priced: last.priced, doc: this.documentOf(agent, last.runId) });
    }
    results.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    return { results, week };
  }

  /** The markdown file a run wrote, when the write went through; the last one wins. */
  private documentOf(agent: string, runId: string): TodayResult["doc"] {
    const events = this.run(agent, runId) ?? [];
    const ok = new Set(events.flatMap((e) => (e.event.type === "tool.result" && e.event.ok ? [e.event.callId] : [])));
    let doc: TodayResult["doc"] = null;
    for (const e of events) {
      if (e.event.type !== "tool.request" || e.event.request.tool !== "write_file" || !ok.has(e.event.callId)) continue;
      const { path, content } = e.event.request.args as { path?: unknown; content?: unknown };
      if (typeof path === "string" && /\.md$/i.test(path) && typeof content === "string") doc = { path, content: content.slice(0, 4000) };
    }
    return doc;
  }

  /** Cost and run counts per local day per agent, for the last `days` days. */
  costByDay(days = 14, now = new Date()): { day: string; agent: string; costUsd: number; runs: number }[] {
    const since = localDay(new Date(now.getTime() - days * 86_400_000));
    const buckets = new Map<string, { day: string; agent: string; costUsd: number; runs: number }>();
    for (const r of this.allRuns()) {
      const day = localDay(r.startedAt);
      if (day < since) continue;
      const key = `${day}|${r.agent}`;
      const b = buckets.get(key) ?? { day, agent: r.agent, costUsd: 0, runs: 0 };
      b.costUsd += r.costUsd;
      b.runs++;
      buckets.set(key, b);
    }
    return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day) || a.agent.localeCompare(b.agent));
  }
}
