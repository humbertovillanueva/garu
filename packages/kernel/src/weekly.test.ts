import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Memory } from "./memory.js";
import { RunStore } from "./store.js";
import { weeklyDue, weeklyStats } from "./weekly.js";

const DAY = 86_400_000;
const now = new Date(2026, 10, 15, 18, 5); // Sunday 2026-11-15, 18:05 local
const at = (daysAgo: number, plus = 0) => new Date(now.getTime() - daysAgo * DAY + plus).toISOString();
function log(root: string, agent: string, runId: string, daysAgo: number, end: Record<string, unknown> | null, asks = 0): void {
  mkdirSync(join(root, agent), { recursive: true });
  const events: Record<string, unknown>[] = [{ type: "run.start", agent, model: "m", trigger: "cron:0 7 * * *" }];
  for (let i = 0; i < asks; i++) events.push({ type: "policy.decision", callId: `a${i}`, decision: { action: "ask", ruleIndex: 0, matched: "*", reason: "r" } });
  events.push({ type: "policy.decision", callId: "ok", decision: { action: "allow", ruleIndex: 0, matched: "*", reason: "r" } });
  if (end) events.push({ type: "run.end", ...end });
  writeFileSync(join(root, agent, `${runId}.jsonl`), events.map((event, i) => JSON.stringify({ seq: i + 1, ts: at(daysAgo, i * 1000), runId, agent, event })).join("\n") + "\n");
}

describe("weekly", () => {
  it("counts the last seven days per agent: ok, failed, offline, asks, cost, and the notes written", () => {
    const root = mkdtempSync(join(tmpdir(), "garu-weekly-"));
    const store = new RunStore(join(root, "runs"));
    log(join(root, "runs"), "bea", "r1", 1, { status: "ok", costUsd: 0.01, priced: true }, 2);
    log(join(root, "runs"), "bea", "r2", 3, { status: "error", costUsd: 0.002, priced: true });
    log(join(root, "runs"), "bea", "r3", 5, { status: "error", offline: true, costUsd: 0, priced: true });
    log(join(root, "runs"), "bea", "r4", 9, { status: "ok", costUsd: 0.5, priced: true }); // last week: out
    log(join(root, "runs"), "tick", "t1", 2, { status: "ok", costUsd: 0.001, priced: true });
    const memory = new Memory(join(root, "memory"));
    memory.add("bea", "fresh", "2026-11-12");
    memory.add("bea", "old", "2026-10-01");
    memory.add("tomay", "no runs but a note", "2026-11-14");
    const w = weeklyStats(store, { memory, agents: ["tomay"], now });
    expect(w).toMatchObject({ from: "2026-11-09", to: "2026-11-15", runs: 4, actions: 4, asked: 2, notes: 2, priced: true });
    expect(w.costUsd).toBeCloseTo(0.013, 6);
    expect(w.agents).toEqual([
      { agent: "bea", runs: 3, ok: 1, failed: 1, offline: 1, waiting: 0, asked: 2, costUsd: expect.closeTo(0.012, 6) },
      { agent: "tick", runs: 1, ok: 1, failed: 0, offline: 0, waiting: 0, asked: 0, costUsd: 0.001 },
    ]);
  });

  it("is due on Sunday from six in the evening, once", () => {
    expect(weeklyDue(new Date(2026, 10, 15, 17, 59), new Set())).toBeNull();
    expect(weeklyDue(new Date(2026, 10, 15, 18, 0), new Set())).toBe("2026-11-15");
    expect(weeklyDue(new Date(2026, 10, 15, 23, 0), new Set(["2026-11-15"]))).toBeNull();
    expect(weeklyDue(new Date(2026, 10, 16, 18, 0), new Set())).toBeNull(); // Monday
  });
});
