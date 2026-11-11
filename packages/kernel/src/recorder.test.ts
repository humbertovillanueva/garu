import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Recorder, formatEvent, newRunId, readRun, localTime } from "./recorder.js";

describe("Recorder", () => {
  it("writes sequential envelopes and reads them back", () => {
    const root = mkdtempSync(join(tmpdir(), "garu-"));
    const seen: number[] = [];
    const r = new Recorder({ root, agent: "hello", sink: (e) => seen.push(e.seq) });
    r.record({ type: "run.start", agent: "hello", model: "anthropic/x", trigger: "manual" });
    r.record({ type: "tool.request", callId: "c1", request: { server: "fs", tool: "read", args: { path: "/a" } } });
    r.record({ type: "run.end", status: "ok" });

    const back = readRun(r.path);
    expect(back.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(back[1]?.event.type).toBe("tool.request");
    expect(back.every((e) => e.runId === r.runId)).toBe(true);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("leaves a file even with zero events", () => {
    const root = mkdtempSync(join(tmpdir(), "garu-"));
    const r = new Recorder({ root, agent: "quiet" });
    expect(readRun(r.path)).toEqual([]);
  });

  it("fails loudly on corrupt lines", () => {
    const root = mkdtempSync(join(tmpdir(), "garu-"));
    const p = join(root, "bad.jsonl");
    writeFileSync(p, '{"seq":1}\nnot json\n');
    expect(() => readRun(p)).toThrow(/:2: corrupt/);
  });

  it("run ids sort by time", () => {
    const a = newRunId(new Date("2026-01-01T00:00:00Z"));
    const b = newRunId(new Date("2026-01-01T00:00:01Z"));
    expect(a < b).toBe(true);
    expect(a).toMatch(/^20260101-000000-[0-9a-f]{8}$/);
  });

  it("stamps terminal lines in local time, with the date on request", () => {
    const d = new Date("2026-01-01T12:34:56.000Z");
    const p = (n: number) => String(n).padStart(2, "0");
    expect(localTime(d)).toBe(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    expect(localTime(d.toISOString(), { seconds: false })).toBe(`${p(d.getHours())}:${p(d.getMinutes())}`);
    expect(localTime(d, { date: true, seconds: false })).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`);
  });

  it("formats every event type without throwing", () => {
    const base = { seq: 1, ts: "2026-01-01T12:34:56.000Z", runId: "r", agent: "a" } as const;
    const lines = [
      formatEvent({ ...base, event: { type: "run.start", agent: "a", model: "m", trigger: "manual" } }),
      formatEvent({ ...base, event: { type: "policy.decision", callId: "c", decision: { action: "block", ruleIndex: 0, matched: "*", reason: "no" } } }),
      formatEvent({ ...base, event: { type: "tool.result", callId: "c", ok: false, durationMs: 5, error: "boom" } }),
    ];
    const d = new Date(base.ts);
    const p = (n: number) => String(n).padStart(2, "0");
    expect(lines[0]).toContain(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    expect(lines[0]).not.toContain("Z");
    expect(lines[1]).toContain("BLOCK");
    expect(lines[2]).toContain("ERROR");
  });
});

describe("a resumed run's log", () => {
  it("continues the sequence where the file ends, and the parked and resumed lines format", () => {
    const root = mkdtempSync(join(tmpdir(), "rec-"));
    const first = new Recorder({ root, agent: "a" });
    first.record({ type: "run.start", agent: "a", model: "m", trigger: "manual" });
    first.record({ type: "run.parked", requests: ["x1", "x2"] });
    const back = new Recorder({ root, agent: "a", runId: first.runId, resume: true });
    expect(back.path).toBe(first.path);
    back.record({ type: "run.resumed", parkedAt: "2026-01-01T12:00:00.000Z" });
    expect(readRun(first.path).map((e) => e.seq)).toEqual([1, 2, 3]);
    const base = { seq: 1, ts: "2026-01-01T12:34:56.000Z", runId: "r", agent: "a" } as const;
    expect(formatEvent({ ...base, event: { type: "run.parked", requests: ["x1", "x2"] } })).toContain("parked: waiting on 2 answers");
    expect(formatEvent({ ...base, event: { type: "run.resumed", parkedAt: "2026-01-01T12:00:00.000Z" } })).toContain("resumed");
  });
});
