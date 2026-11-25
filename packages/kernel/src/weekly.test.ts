import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Inbox } from "./inbox.js";
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
  if (asks) { events.push({ type: "tool.request", callId: "b", request: { server: "fs", tool: "write_file", args: {} } }); events.push({ type: "policy.decision", callId: "b", decision: { action: "block", ruleIndex: 0, matched: "*", reason: "r" } }); }
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
    const inbox = new Inbox({ root: join(root, "inbox") });
    const ask = (id: string, agent: string, by: string, daysAgo: number) =>
      writeFileSync(join(root, "inbox", `${id}.json`), JSON.stringify({ id, agent, runId: "r", callId: id, tool: "gmail.create_draft", args: {}, reason: "r", createdAt: at(daysAgo + 1), expiresAt: at(daysAgo), decision: { approved: false, by, at: at(daysAgo) } }));
    ask("e1", "bea", "inbox: expired", 2);
    ask("e2", "bea", "inbox: expired", 10); // last week: out
    ask("d1", "bea", "Humberto (ui)", 1); // declined by a person: not expired
    ask("e3", "rook", "inbox: expired", 4); // an agent with no run this week still shows for its expired ask
    const w = weeklyStats(store, { memory, inbox, agents: ["tomay"], now });
    // A narrower window counts from its own start: nothing before `since` is in.
    const recent = weeklyStats(store, { memory, inbox, agents: ["tomay"], now, since: new Date(now.getTime() - 60_000) });
    expect(recent.from).toBe(w.to);
    expect(recent.runs).toBeLessThanOrEqual(w.runs);
    expect(w).toMatchObject({ from: "2026-11-09", to: "2026-11-15", runs: 4, actions: 4, asked: 2, expired: 2, notes: 2, priced: true });
    expect(w.costUsd).toBeCloseTo(0.013, 6);
    expect(w.agents).toEqual([
      { agent: "bea", runs: 3, ok: 1, failed: 1, offline: 1, waiting: 0, asked: 2, expired: 1, blocked: [{ tool: "fs.write_file", runs: 1 }], costUsd: expect.closeTo(0.012, 6), stopped: [{ at: at(3), status: "error", summary: null }] },
      { agent: "rook", runs: 0, ok: 0, failed: 0, offline: 0, waiting: 0, asked: 0, expired: 1, blocked: [], costUsd: 0, stopped: [] },
      { agent: "tick", runs: 1, ok: 1, failed: 0, offline: 0, waiting: 0, asked: 0, expired: 0, blocked: [], costUsd: 0.001, stopped: [] },
    ]);
  });

  it("is due on Sunday from six in the evening, once", () => {
    expect(weeklyDue(new Date(2026, 10, 15, 17, 59), new Set())).toBeNull();
    expect(weeklyDue(new Date(2026, 10, 15, 18, 0), new Set())).toBe("2026-11-15");
    expect(weeklyDue(new Date(2026, 10, 15, 23, 0), new Set(["2026-11-15"]))).toBeNull();
    expect(weeklyDue(new Date(2026, 10, 16, 18, 0), new Set())).toBeNull(); // Monday
  });
});
