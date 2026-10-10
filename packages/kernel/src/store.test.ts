import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Recorder } from "./recorder.js";
import { RunStore, localDay, summarizeRun } from "./store.js";
import { readRun } from "./recorder.js";

function makeRun(root: string, agent: string, opts: { status?: "ok" | "error"; cost?: number; day?: string } = {}) {
  const r = new Recorder({ root, agent });
  r.record({ type: "run.start", agent, model: "gemini/x", trigger: "manual", sandbox: { image: "garu-sandbox", network: "none" } });
  r.record({ type: "model.turn", turn: 1, inputTokens: 100, outputTokens: 10, costUsd: 0.001, totalCostUsd: 0.001 });
  r.record({ type: "tool.request", callId: "c", request: { server: "fs", tool: "read", args: {} } });
  r.record({ type: "policy.decision", callId: "c", decision: { action: "allow", ruleIndex: 0, matched: "fs.*", reason: "r" } });
  r.record({ type: "policy.decision", callId: "d", decision: { action: "block", ruleIndex: 1, matched: "*", reason: "r" } });
  r.record({ type: "run.end", status: opts.status ?? "ok", costUsd: opts.cost ?? 0.001, priced: true, summary: "done" });
  return r;
}

describe("RunStore", () => {
  it("lists agents, summarizes runs newest first, and reads one run", () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    makeRun(root, "a");
    const second = makeRun(root, "a", { status: "error", cost: 0.02 });
    makeRun(root, "b");
    const store = new RunStore(root);
    expect(store.agents()).toEqual(["a", "b"]);

    const runs = store.runs("a");
    expect(runs).toHaveLength(2);
    // both runs start within the same ms in this test, so look the second one up rather than assume order
    const errored = runs.find((r) => r.runId === second.runId)!;
    expect(errored).toMatchObject({
      agent: "a", status: "error", trigger: "manual", model: "gemini/x", turns: 1,
      toolCalls: { allow: 1, ask: 0, block: 1 }, inputTokens: 100, outputTokens: 10, costUsd: 0.02, summary: "done",
      sandbox: { image: "garu-sandbox", network: "none" },
    });
    expect(errored.endedAt).not.toBeNull();

    expect(store.run("a", second.runId)!.length).toBe(6);
    expect(store.run("a", "nope")).toBeNull();
    expect(store.run("../etc", "x")).toBeNull();
  });

  it("a run without run.end is 'running'", () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    const r = new Recorder({ root, agent: "live" });
    r.record({ type: "run.start", agent: "live", model: "m", trigger: "cron:* * * * *" });
    r.record({ type: "model.turn", turn: 1 });
    const [s] = new RunStore(root).runs("live");
    expect(s).toMatchObject({ status: "running", endedAt: null, turns: 1, trigger: "cron:* * * * *", sandbox: null });
  });

  it("a run silent for 10+ minutes without run.end is 'interrupted' (unless waiting on approval)", () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    const r = new Recorder({ root, agent: "dead" });
    r.record({ type: "run.start", agent: "dead", model: "m", trigger: "manual" });
    r.record({ type: "model.turn", turn: 1 });
    const later = Date.now() + 11 * 60_000;
    expect(summarizeRun(r.path, readRun(r.path), later)!.status).toBe("interrupted");
    expect(summarizeRun(r.path, readRun(r.path))!.status).toBe("running");

    const w = new Recorder({ root, agent: "waiting" });
    w.record({ type: "run.start", agent: "waiting", model: "m", trigger: "manual" });
    w.record({ type: "approval.requested", callId: "c" });
    expect(summarizeRun(w.path, readRun(w.path), later)!.status).toBe("running");
    // …but an ask expires within the hour, so a run still "waiting" hours later was killed mid-wait.
    expect(summarizeRun(w.path, readRun(w.path), Date.now() + 3 * 60 * 60_000)!.status).toBe("interrupted");
  });

  it("skips corrupt logs instead of failing the listing", () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    makeRun(root, "a");
    writeFileSync(join(root, "a", "20260101-000000-deadbeef.jsonl"), "garbage\n");
    expect(new RunStore(root).runs("a")).toHaveLength(1);
  });

  it("agent summaries and cost by day", () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    makeRun(root, "a", { cost: 0.01 });
    makeRun(root, "a", { cost: 0.02 });
    makeRun(root, "b", { cost: 0.5 });
    mkdirSync(join(root, "empty"));
    const store = new RunStore(root);
    const sums = store.agentSummaries();
    expect(sums.map((s) => s.name)).toEqual(["a", "b", "empty"]);
    expect(sums[0]).toMatchObject({ runs: 2, runsToday: 2, model: "gemini/x" });
    expect(sums[0]!.costTodayUsd).toBeCloseTo(0.03, 6);
    expect(sums[2]).toMatchObject({ runs: 0, lastRun: null, model: null });

    const byDay = store.costByDay();
    const today = localDay(new Date());
    expect(byDay).toEqual([
      { day: today, agent: "a", costUsd: expect.closeTo(0.03, 6), runs: 2 },
      { day: today, agent: "b", costUsd: expect.closeTo(0.5, 6), runs: 1 },
    ]);
  });

  it("puts a run on the owner's calendar day, not UTC's", () => {
    const tz = process.env["TZ"];
    process.env["TZ"] = "America/Denver";
    try {
      // 01:30 UTC on the 11th is 7:30 PM on the 10th in Denver
      expect(localDay("2026-10-11T01:30:00.000Z")).toBe("2026-10-10");
      expect(localDay(new Date("2026-10-10T15:00:00.000Z"))).toBe("2026-10-10");
    } finally {
      if (tz === undefined) delete process.env["TZ"]; else process.env["TZ"] = tz;
    }
  });
});
