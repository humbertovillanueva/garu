import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "./i18n.js";
import { inWords, statusLines } from "./status.js";

const now = new Date(2026, 10, 16, 11, 0); // Monday 11:00 local
const at = (h: number, m = 0, d = 0) => new Date(2026, 10, 16 + d, h, m);

describe("garu status", () => {
  afterEach(() => setLocale("en"));
  it("says when the next run is, in words", () => {
    expect(inWords(at(11, 0, 0), now)).toBe("now");
    expect(inWords(at(11, 25), now)).toBe("in 25 min");
    expect(inWords(at(13, 20), now)).toBe("in 2 h 20 min");
    expect(inWords(at(14, 0), now)).toBe("in 3 h");
    expect(inWords(at(7, 0, 1), now)).toMatch(/^tomorrow 7:00/);
    expect(inWords(at(8, 0, 3), now)).toMatch(/^Thu 8:00/);
  });

  it("one line per agent, then what's waiting", () => {
    const lines = statusLines({ up: true, now, agents: [
      { name: "bea", cron: "0 8 * * 1-5", nextRun: at(8, 0, 1), last: { startedAt: at(8, 14).toISOString(), endedAt: at(8, 15).toISOString(), status: "ok", asked: 0, blocked: [], summary: "20 new" }, pending: 1, parked: 1, runsToday: 1, cap: 8, costTodayUsd: 0.004, needs: [] },
      { name: "tick", cron: "0 */6 * * *", nextRun: at(12, 0), last: { startedAt: at(6, 41).toISOString(), endedAt: at(6, 41).toISOString(), status: "error", offline: true, asked: 0, blocked: [], summary: null }, pending: 0, parked: 0, runsToday: 2, cap: null, costTodayUsd: 0, needs: [] },
      { name: "nook", cron: null, nextRun: null, last: null, pending: 0, parked: 0, runsToday: 0, cap: null, costTodayUsd: 0, needs: ["OLLAMA_HOST"] },
    ] });
    expect(lines[0]).toBe("bea   waiting for you · last 08:14: ok · 1 of 8 runs today, $0.0040");
    expect(lines[1]).toMatch(/^tick  next in 1 h · last 06:41: no network · 2 runs today, \$0/);
    expect(lines[2]).toBe("nook  needs setup: OLLAMA_HOST · no runs yet");
    expect(lines.at(-1)).toBe("1 ask is waiting for you: garu inbox");
  });

  it("with the schedules off it says so instead of a next run", () => {
    const lines = statusLines({ up: false, now, agents: [{ name: "bea", cron: "0 8 * * 1-5", nextRun: null, last: null, pending: 0, parked: 0, runsToday: 0, cap: null, costTodayUsd: 0, needs: [] }] });
    expect(lines[0]).toBe("bea   scheduled, but schedules are off · no runs yet");
    expect(lines.at(-1)).toMatch(/^schedules are off/);
  });

  it("in Spanish", () => {
    setLocale("es");
    expect(inWords(at(11, 25), now)).toBe("en 25 min");
  });
});
