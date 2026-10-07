/**
 * Read-side store over the flight recorder on disk.
 *
 * The control room, `garu log` and anything else that wants to look at what
 * agents did reads through here. Nothing is cached beyond a call: the log
 * files are the source of truth, and they are cheap to read.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readRun, type Envelope } from "./recorder.js";

export interface RunSummary {
  agent: string;
  runId: string;
  startedAt: string;
  endedAt: string | null;
  status: "running" | "ok" | "error" | "blocked" | "max_turns" | "budget_exceeded";
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
  path: string;
}

export interface AgentSummary {
  name: string;
  runs: number;
  lastRun: RunSummary | null;
  costTodayUsd: number;
  runsToday: number;
  model: string | null;
}

export function summarizeRun(path: string, events: Envelope[]): RunSummary | null {
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
        s.summary = e.summary ?? null;
        break;
    }
  }
  return s;
}

export class RunStore {
  constructor(readonly root: string) {}

  agents(): string[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root)
      .filter((d) => statSync(join(this.root, d)).isDirectory())
      .sort();
  }

  /** Runs for one agent, newest first. Corrupt logs are skipped, not fatal. */
  runs(agent: string): RunSummary[] {
    const dir = join(this.root, agent);
    if (!existsSync(dir)) return [];
    const out: RunSummary[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const path = join(dir, f);
      try {
        const s = summarizeRun(path, readRun(path));
        if (s) out.push(s);
      } catch {
        /* skip corrupt or half-written log */
      }
    }
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
    const today = now.toISOString().slice(0, 10);
    return this.agents().map((name) => {
      const runs = this.runs(name);
      const todays = runs.filter((r) => r.startedAt.slice(0, 10) === today);
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

  /** Cost and run counts per UTC day per agent, for the last `days` days. */
  costByDay(days = 14, now = new Date()): { day: string; agent: string; costUsd: number; runs: number }[] {
    const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
    const buckets = new Map<string, { day: string; agent: string; costUsd: number; runs: number }>();
    for (const r of this.allRuns()) {
      const day = r.startedAt.slice(0, 10);
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
