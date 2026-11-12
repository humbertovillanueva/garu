import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPrune, planPrune } from "./prune.js";

const DAY = 86_400_000;
const now = new Date("2026-11-12T20:00:00Z");
const at = (daysAgo: number, plus = 0) => new Date(now.getTime() - daysAgo * DAY + plus).toISOString();

function log(root: string, agent: string, runId: string, events: { ts: string; event: Record<string, unknown> }[]): string {
  mkdirSync(join(root, agent), { recursive: true });
  const path = join(root, agent, `${runId}.jsonl`);
  writeFileSync(path, events.map((e, i) => JSON.stringify({ seq: i + 1, ts: e.ts, runId, agent, event: e.event })).join("\n") + "\n");
  return path;
}
const start = (ts: string) => ({ ts, event: { type: "run.start", agent: "a", model: "m", trigger: "cron:0 7 * * *" } });
const end = (ts: string) => ({ ts, event: { type: "run.end", status: "ok" } });

describe("prune", () => {
  it("plans the runs older than the window, spares running and parked ones, takes settled inbox requests, and deletes on apply", () => {
    const root = mkdtempSync(join(tmpdir(), "garu-prune-"));
    const logs = join(root, "runs");
    const inbox = join(root, "inbox");
    mkdirSync(inbox);
    const oldOk = log(logs, "tick", "20260801-070000-a0000001", [start(at(103)), end(at(103, 5000))]);
    const oldDead = log(logs, "tick", "20260810-070000-a0000002", [start(at(94))]); // never ended: interrupted long ago
    const oldParked = log(logs, "bea", "20260805-080000-a0000003", [start(at(99)), { ts: at(99, 1000), event: { type: "run.parked", requests: ["x1"] } }]);
    const fresh = log(logs, "tick", "20261110-070000-a0000004", [start(at(2)), end(at(2, 5000))]);
    const edge = log(logs, "tick", "20260815-070000-a0000005", [start(at(90, 1000)), end(at(90, 6000))]); // just inside the window
    const settled = join(inbox, "a1.json"); writeFileSync(settled, JSON.stringify({ id: "a1", createdAt: at(120), expiresAt: at(119), decision: { approved: true } }));
    const expired = join(inbox, "a2.json"); writeFileSync(expired, JSON.stringify({ id: "a2", createdAt: at(110), expiresAt: at(109) }));
    const recent = join(inbox, "a3.json"); writeFileSync(recent, JSON.stringify({ id: "a3", createdAt: at(1), expiresAt: at(0), decision: { approved: false } }));
    writeFileSync(join(inbox, "junk.json"), "not json");

    const plan = planPrune({ logRoot: logs, inboxRoot: inbox, keepMs: 90 * DAY, now });
    expect(plan.runs.map((r) => r.runId)).toEqual(["20260801-070000-a0000001", "20260810-070000-a0000002"]);
    expect(plan.spared).toBe(1);
    expect(plan.requests.sort()).toEqual([settled, expired].sort());

    expect(applyPrune(plan)).toEqual({ runs: 2, requests: 2 });
    expect(existsSync(oldOk)).toBe(false);
    expect(existsSync(oldDead)).toBe(false);
    expect(existsSync(oldParked)).toBe(true);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(edge)).toBe(true);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(join(inbox, "junk.json"))).toBe(true);
    // Nothing left to do: a second plan is empty.
    expect(planPrune({ logRoot: logs, inboxRoot: inbox, keepMs: 90 * DAY, now })).toMatchObject({ runs: [], requests: [], spared: 1 });
  });
});
