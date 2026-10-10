import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatStore, describeSelf } from "./chat.js";

describe("ChatStore", () => {
  it("appends and reads messages per agent", () => {
    const s = new ChatStore(mkdtempSync(join(tmpdir(), "chat-")));
    s.append("tomay", { role: "user", text: "hi", kind: "chat" });
    s.append("tomay", { role: "agent", text: "hello", kind: "chat", runId: "r1" });
    s.append("other", { role: "user", text: "x", kind: "chat" });
    const m = s.messages("tomay");
    expect(m.map((x) => [x.role, x.text])).toEqual([["user", "hi"], ["agent", "hello"]]);
    expect(m[1]!.runId).toBe("r1");
    expect(m[0]!.id).toHaveLength(8);
    expect(s.messages("nobody")).toEqual([]);
    expect(() => s.messages("../etc")).toThrow(/bad agent name/);
  });

  it("builds a transcript with history and the new message", () => {
    const s = new ChatStore(mkdtempSync(join(tmpdir(), "chat-")));
    s.append("tomay", { role: "user", text: "what's the weather", kind: "chat" });
    s.append("tomay", { role: "agent", text: "84 and sunny", kind: "chat" });
    s.append("tomay", { role: "agent", text: "Wrote today's brief.", kind: "run", runId: "r9" });
    const t = s.transcript("tomay", "Humberto", "Tomay", "and tomorrow?");
    expect(t).toContain("Humberto: what's the weather");
    expect(t).toContain("Tomay: 84 and sunny");
    expect(t).toContain("run) Wrote today's brief.");
    expect(t).toContain("Humberto's new message:\nand tomorrow?");
    expect(t).toMatch(/Reply to Humberto directly/);
    expect(t).toMatch(/greeting or small talk, just reply briefly/);
  });

  it("with no history, just the message and instructions", () => {
    const s = new ChatStore(mkdtempSync(join(tmpdir(), "chat-")));
    const t = s.transcript("tomay", "H", "T", "hey");
    expect(t.startsWith("H's new message:\nhey")).toBe(true);
  });

  it("puts Garu's own facts about the agent ahead of the conversation", () => {
    const s = new ChatStore(mkdtempSync(join(tmpdir(), "chat-")));
    const t = s.transcript("tomay", "H", "Tomay", "why no brief?", 20, {
      cron: "0 7 * * 1-5", schedulesOn: true, nextRun: new Date("2026-10-12T13:00:00Z"), timeZone: "America/Denver", now: new Date("2026-10-09T22:30:00-06:00"),
      runs: [{ startedAt: new Date("2026-10-08T17:28:00Z"), trigger: "manual", status: "ok" }, { startedAt: new Date("2026-10-08T13:00:00Z"), trigger: "cron:0 7 * * 1-5", status: "ok" }],
    });
    expect(t.indexOf("Facts about you")).toBe(0);
    expect(t).toContain('cron "0 7 * * 1-5"');
    expect(t).toContain("No scheduled run has happened today");
    expect(t.indexOf("Facts about you")).toBeLessThan(t.indexOf("H's new message"));
  });
});

describe("describeSelf", () => {
  const tz = "America/Denver";
  it("says the scheduler is off when it is", () => {
    const d = describeSelf({ cron: "0 7 * * 1-5", schedulesOn: false, nextRun: null, runs: [], timeZone: tz });
    expect(d).toContain("scheduler is OFF");
    expect(d).toContain("Runs: none recorded yet.");
  });
  it("labels catch-up runs and today's scheduled run", () => {
    const now = new Date("2026-10-09T15:30:00Z"); // 09:30 Denver
    const d = describeSelf({ cron: "0 7 * * 1-5", schedulesOn: true, nextRun: new Date("2026-10-12T13:00:00Z"), timeZone: tz, now,
      runs: [{ startedAt: new Date("2026-10-09T15:05:00Z"), trigger: "catch-up:0 7 * * 1-5", status: "ok" }] });
    expect(d).toContain("catch-up (missed while Garu was off or asleep)");
    expect(d).not.toContain("No scheduled run has happened today");
    expect(d).toContain("Next scheduled run: Mon, Oct 12, 07:00");
  });
  it("on-demand agents get a one-liner", () => {
    expect(describeSelf({ cron: null, schedulesOn: true, nextRun: null, runs: [], timeZone: tz })).toContain("Schedule: none; you run only when asked.");
  });
});
