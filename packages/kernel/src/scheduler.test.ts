import { describe, expect, it } from "vitest";
import { parseGarufile } from "./garufile.js";
import { Scheduler, assertValidCron, type CronFactory, type SchedulerEvent } from "./scheduler.js";
import type { RunResult } from "./agent.js";

const ok = (name: string): RunResult => ({
  runId: "r", logPath: "/dev/null", status: "ok", output: name, turns: 1, costUsd: 0, inputTokens: 0, outputTokens: 0,
});

/** A cron factory that lets the test pull the trigger by hand. */
function manualCron() {
  const cbs = new Map<string, () => void>();
  const stopped: string[] = [];
  const factory: CronFactory = (pattern, cb) => {
    cbs.set(pattern, cb);
    return { stop: () => void stopped.push(pattern), nextRun: () => new Date("2026-01-01T00:00:00Z") };
  };
  return { factory, tick: (pattern: string) => cbs.get(pattern)!(), stopped, patterns: () => [...cbs.keys()] };
}

const agentA = { source: "a.yaml", garufile: parseGarufile(`
name: a
model: fake/x
prompt: p
triggers:
  - cron: "*/5 * * * *"
  - cron: "0 9 * * 1-5"
`) };
const manualOnly = { source: "m.yaml", garufile: parseGarufile(`
name: m
model: fake/x
prompt: p
`) };

describe("assertValidCron", () => {
  it("accepts 5-field patterns and rejects junk", () => {
    expect(() => assertValidCron("*/15 * * * *")).not.toThrow();
    expect(() => assertValidCron("every tuesday")).toThrow(/invalid cron "every tuesday"/);
  });
});

describe("Scheduler", () => {
  it("schedules only cron triggers and reports them", () => {
    const m = manualCron();
    const events: SchedulerEvent[] = [];
    const s = new Scheduler({ runner: async (a) => ok(a.garufile.name), onEvent: (e) => events.push(e), cronFactory: m.factory });
    expect(s.start([agentA, manualOnly])).toBe(2);
    expect(m.patterns()).toEqual(["*/5 * * * *", "0 9 * * 1-5"]);
    expect(events.filter((e) => e.type === "scheduled").map((e) => (e as { agent: string }).agent)).toEqual(["a", "a"]);
  });

  it("fires the runner with a cron trigger label and reports the result", async () => {
    const m = manualCron();
    const events: SchedulerEvent[] = [];
    const triggers: string[] = [];
    const s = new Scheduler({
      runner: async (a, trigger) => { triggers.push(trigger); return ok(a.garufile.name); },
      onEvent: (e) => events.push(e),
      cronFactory: m.factory,
    });
    s.start([agentA]);
    await s.fire(agentA, "*/5 * * * *");
    expect(triggers).toEqual(["cron:*/5 * * * *"]);
    expect(events.map((e) => e.type)).toEqual(["scheduled", "scheduled", "fire", "run.done"]);
  });

  it("never overlaps runs of the same agent", async () => {
    const m = manualCron();
    const events: SchedulerEvent[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = new Scheduler({
      runner: async (a) => { await gate; return ok(a.garufile.name); },
      onEvent: (e) => events.push(e),
      cronFactory: m.factory,
    });
    s.start([agentA]);
    const first = s.fire(agentA, "*/5 * * * *");
    await Promise.resolve();
    expect(s.running).toBe(1);
    await s.fire(agentA, "0 9 * * 1-5"); // second trigger while first is in flight → skipped
    expect(events.some((e) => e.type === "skip.overlap")).toBe(true);
    release();
    await first;
    expect(s.running).toBe(0);
    expect(events.filter((e) => e.type === "run.done")).toHaveLength(1);
  });

  it("a throwing runner is reported, not fatal", async () => {
    const m = manualCron();
    const events: SchedulerEvent[] = [];
    const s = new Scheduler({ runner: async () => { throw new Error("boom"); }, onEvent: (e) => events.push(e), cronFactory: m.factory });
    s.start([agentA]);
    await s.fire(agentA, "*/5 * * * *");
    expect(events.at(-1)).toEqual({ type: "run.failed", agent: "a", error: "boom" });
    expect(s.running).toBe(0);
  });

  it("stop() halts cron handles, refuses new fires, and waits for in-flight runs", async () => {
    const m = manualCron();
    const events: SchedulerEvent[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = new Scheduler({ runner: async (a) => { await gate; return ok(a.garufile.name); }, onEvent: (e) => events.push(e), cronFactory: m.factory });
    s.start([agentA]);
    const running = s.fire(agentA, "*/5 * * * *");
    await Promise.resolve();
    const stopping = s.stop();
    expect(m.stopped).toEqual(["*/5 * * * *", "0 9 * * 1-5"]);
    await s.fire(agentA, "*/5 * * * *"); // ignored while stopping
    release();
    await Promise.all([running, stopping]);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "fire")).toHaveLength(1);
    expect(types.at(-2)).toBe("run.done");
    expect(types.at(-1)).toBe("stopped");
    const stoppingEv = events.find((e) => e.type === "stopping") as { inFlight: number };
    expect(stoppingEv.inFlight).toBe(1);
  });

  it("rejects an invalid cron at start, before anything is scheduled", () => {
    const bad = { source: "b.yaml", garufile: parseGarufile(`
name: b
model: fake/x
prompt: p
triggers:
  - cron: "nope"
`) };
    const s = new Scheduler({ runner: async () => ok("b") });
    expect(() => s.start([bad])).toThrow(/invalid cron "nope"/);
  });
});
