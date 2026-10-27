import { describe, expect, it } from "vitest";
import { parseGarufile } from "./garufile.js";
import { Scheduler, assertValidCron, lastDue, type CronFactory, type SchedulerEvent } from "./scheduler.js";
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
    return { stop: () => void stopped.push(pattern), nextRun: () => new Date("2026-01-01T00:00:00Z"), lastDue: (now, since) => lastDue(pattern, now, since) };
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

// Cron patterns are in the machine's local time, so these tests build local Dates (year, month-1, day, hour, minute).
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m); // October 2026; the 9th is a Friday
const sixHours = 6 * 3600_000;

describe("lastDue", () => {
  it("finds the most recent due time inside the window, or null", () => {
    const now = local(9, 9, 30);
    expect(lastDue("0 7 * * 1-5", now, new Date(now.getTime() - sixHours))?.getTime()).toBe(local(9, 7).getTime());
    expect(lastDue("0 * * * *", now, new Date(now.getTime() - sixHours))?.getTime()).toBe(local(9, 9).getTime());
    // Saturday 09:30: the weekday 07:00 fire was Friday, outside a 6h window.
    expect(lastDue("0 7 * * 1-5", local(10, 9, 30), local(10, 3, 30))).toBeNull();
  });
});

describe("Scheduler catch-up", () => {
  const brief = { source: "b.yaml", garufile: parseGarufile(`
name: brief
model: fake/x
prompt: p
triggers:
  - cron: "0 7 * * 1-5"
`) };
  const now = () => local(9, 9, 30); // 2.5h after the 07:00 fire

  it("fires a trigger that was due in the window with no run since, labelled catch-up", async () => {
    const m = manualCron();
    const events: SchedulerEvent[] = [];
    const triggers: string[] = [];
    const s = new Scheduler({
      runner: async (a, trigger) => { triggers.push(trigger); return ok(a.garufile.name); },
      onEvent: (e) => events.push(e),
      cronFactory: m.factory,
      catchUp: { lastRunAt: () => local(8, 7, 0), now, everyMs: 0 },
    });
    s.start([brief]);
    await new Promise((r) => setTimeout(r, 5)); // the queued catch-up starts on the next tick
    await s.stop();
    const cu = events.find((e) => e.type === "catch-up") as { missedAt: Date } | undefined;
    expect(cu?.missedAt.getTime()).toBe(local(9, 7).getTime());
    expect(triggers).toEqual(["catch-up:0 7 * * 1-5"]);
  });

  it("does nothing when a run already started at or after the due time", async () => {
    const m = manualCron();
    const triggers: string[] = [];
    const s = new Scheduler({
      runner: async (a, trigger) => { triggers.push(trigger); return ok(a.garufile.name); },
      cronFactory: m.factory,
      catchUp: { lastRunAt: () => new Date(local(9, 7).getTime() + 2000), now, everyMs: 0 },
    });
    s.start([brief]);
    expect(s.checkMissed()).toBe(0);
    await s.stop();
    expect(triggers).toEqual([]);
  });

  it("does nothing when the miss is older than the window", async () => {
    const m = manualCron();
    const triggers: string[] = [];
    const s = new Scheduler({
      runner: async (a, trigger) => { triggers.push(trigger); return ok(a.garufile.name); },
      cronFactory: m.factory,
      catchUp: { lastRunAt: () => null, now, windowMs: 60 * 60_000, everyMs: 0 },
    });
    s.start([brief]);
    await s.stop();
    expect(triggers).toEqual([]);
  });

  it("queues catch-ups one after another and never doubles an agent already in flight", async () => {
    const m = manualCron();
    const tick = { ...brief, source: "t.yaml", garufile: parseGarufile(`
name: tick
model: fake/x
prompt: p
triggers:
  - cron: "0 * * * *"
`) };
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = new Scheduler({
      runner: async (a, trigger) => { order.push(`start ${a.garufile.name} ${trigger}`); if (a.garufile.name === "brief") await gate; order.push(`end ${a.garufile.name}`); return ok(a.garufile.name); },
      cronFactory: m.factory,
      catchUp: { lastRunAt: () => null, now, everyMs: 0 },
    });
    s.start([brief, tick]);
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["start brief catch-up:0 7 * * 1-5"]); // tick waits its turn
    expect(s.checkMissed()).toBe(0); // brief is in flight, tick is already queued: nothing doubles
    release();
    await new Promise((r) => setTimeout(r, 10)); // brief ends, tick gets its turn
    await s.stop();
    expect(order.filter((o) => o.startsWith("start tick")).length).toBe(1);
    expect(order.indexOf("end brief")).toBeLessThan(order.indexOf("start tick catch-up:0 * * * *"));
  });

  it("a queued catch-up is dropped when the agent's own cron ran while it waited", async () => {
    const m = manualCron();
    const tick = { ...brief, source: "t.yaml", garufile: parseGarufile(`
name: tick
model: fake/x
prompt: p
triggers:
  - cron: "0 * * * *"
`) };
    const order: string[] = [];
    let tickRanAt: Date | null = null;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = new Scheduler({
      runner: async (a, trigger) => { order.push(`start ${a.garufile.name} ${trigger}`); if (a.garufile.name === "brief") await gate; else tickRanAt = now(); return ok(a.garufile.name); },
      cronFactory: m.factory,
      catchUp: { lastRunAt: (name) => (name === "tick" ? tickRanAt : null), now, everyMs: 0 },
    });
    s.start([brief, tick]);
    await new Promise((r) => setTimeout(r, 5)); // brief's catch-up is running; tick's waits behind it
    m.tick("0 * * * *"); // tick's own cron fires meanwhile and runs
    await new Promise((r) => setTimeout(r, 5));
    release();
    await new Promise((r) => setTimeout(r, 10));
    await s.stop();
    expect(order.filter((o) => o.startsWith("start tick"))).toEqual(["start tick cron:0 * * * *"]);
  });

  it("an agent whose model can't be reached is not run, and is tried again later", async () => {
    const m = manualCron();
    const events: SchedulerEvent[] = [];
    const triggers: string[] = [];
    let t = local(9, 9, 30);
    let up = false;
    const s = new Scheduler({
      runner: async (a, trigger) => { triggers.push(trigger); return ok(a.garufile.name); },
      onEvent: (e) => events.push(e),
      cronFactory: m.factory,
      online: async () => up,
      catchUp: { lastRunAt: () => null, now: () => t, everyMs: 0 },
    });
    s.start([brief]);
    await new Promise((r) => setTimeout(r, 5));
    expect(events.some((e) => e.type === "offline")).toBe(true);
    expect(triggers).toEqual([]);
    expect(s.checkMissed()).toBe(0); // not again right away
    up = true;
    t = new Date(t.getTime() + 11 * 60_000);
    expect(s.checkMissed()).toBe(1);
    await new Promise((r) => setTimeout(r, 5));
    await s.stop();
    expect(triggers).toEqual(["catch-up:0 7 * * 1-5"]);
  });

  it("a run that ends offline (the model never answered) pauses the agent like a failed lookup does", async () => {
    const m = manualCron();
    const events: SchedulerEvent[] = [];
    let t = local(9, 9, 30);
    let runs = 0;
    const s = new Scheduler({
      runner: async (a) => { runs++; return { ...ok(a.garufile.name), status: "error", output: "no network: fetch failed", turns: 0, offline: true }; },
      onEvent: (e) => events.push(e),
      cronFactory: m.factory,
      online: async () => true,
      catchUp: { lastRunAt: () => null, now: () => t, everyMs: 0 },
    });
    s.start([brief]);
    await new Promise((r) => setTimeout(r, 5));
    expect(runs).toBe(1);
    expect(events.map((e) => e.type).slice(-3)).toEqual(["fire", "run.done", "offline"]);
    // The store never counts an offline run, so without the pause this would queue the same catch-up every minute.
    expect(s.checkMissed()).toBe(0);
    t = new Date(t.getTime() + 11 * 60_000);
    expect(s.checkMissed()).toBe(1);
    await new Promise((r) => setTimeout(r, 5));
    await s.stop();
    expect(runs).toBe(2);
  });

  it("a run started elsewhere (the control room, chat) blocks a cron fire like one of its own", async () => {
    const m = manualCron();
    const events: SchedulerEvent[] = [];
    let ran = 0;
    const s = new Scheduler({ runner: async (a) => { ran++; return ok(a.garufile.name); }, onEvent: (e) => events.push(e), cronFactory: m.factory, isBusy: (name) => name === "a" });
    s.start([agentA]);
    m.tick("*/5 * * * *");
    await new Promise((r) => setTimeout(r, 5));
    await s.stop();
    expect(ran).toBe(0);
    expect(events.some((e) => e.type === "skip.overlap")).toBe(true);
  });
});
