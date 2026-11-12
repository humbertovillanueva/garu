import { afterEach, describe, expect, it, vi } from "vitest";
import { holdAwake, watchSleep } from "./awake.js";

describe("holdAwake", () => {
  it("asks macOS not to idle into sleep for as long as the run lasts, and does nothing elsewhere", () => {
    const calls: { cmd: string; args: readonly string[] }[] = [];
    let killed = 0;
    const spawn = ((cmd: string, args: readonly string[]) => {
      calls.push({ cmd, args });
      return { kill: () => (killed++, true), on: () => undefined };
    }) as unknown as typeof import("node:child_process").spawn;
    const release = holdAwake({ platform: "darwin", spawn });
    expect(calls).toEqual([{ cmd: "caffeinate", args: ["-i", "-s", "-w", String(process.pid)] }]);
    release();
    expect(killed).toBe(1);
    const none = holdAwake({ platform: "linux", spawn });
    none();
    expect(calls).toHaveLength(1);
  });
});

describe("watchSleep", () => {
  afterEach(() => vi.useRealTimers());

  it("reports a tick that came long after it was due as the machine having slept, and ignores hiccups", () => {
    vi.useFakeTimers();
    let clock = Date.parse("2026-11-10T08:00:00.000Z");
    const slept: { since: string; ms: number }[] = [];
    const stop = watchSleep((s) => slept.push({ since: s.since.toISOString(), ms: s.ms }), { tickMs: 5_000, thresholdMs: 30_000, now: () => clock });
    // Ticks on time: nothing to report.
    for (let i = 0; i < 3; i++) { clock += 5_000; vi.advanceTimersByTime(5_000); }
    expect(slept).toEqual([]);
    // A 10 s hiccup (a busy machine) is not a nap.
    clock += 15_000; vi.advanceTimersByTime(5_000);
    expect(slept).toEqual([]);
    // The lid closes for 34 minutes: the next tick arrives 34 min late.
    const lastAwake = clock;
    clock += 5_000 + 34 * 60_000; vi.advanceTimersByTime(5_000);
    expect(slept).toEqual([{ since: new Date(lastAwake).toISOString(), ms: 34 * 60_000 }]);
    // Back on time afterwards, and silent once stopped.
    clock += 5_000; vi.advanceTimersByTime(5_000);
    stop();
    clock += 5_000 + 60 * 60_000; vi.advanceTimersByTime(5_000);
    expect(slept).toHaveLength(1);
  });
});
