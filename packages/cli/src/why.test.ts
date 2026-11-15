import { afterEach, describe, expect, it } from "vitest";
import type { Envelope } from "@garu/kernel";
import { setLocale } from "./i18n.js";
import { whyLines } from "./why.js";

const ev = (event: Record<string, unknown> & { type: string }, seq = 0): Envelope => ({ seq, ts: "2026-11-15T15:00:00.000Z", runId: "r", agent: "bea", event: event as Envelope["event"] });
const req = (id: string, server: string, tool: string) => ev({ type: "tool.request", callId: id, request: { server, tool, args: {} } });
const dec = (id: string, action: "allow" | "ask" | "block", matched: string, reason = "") => ev({ type: "policy.decision", callId: id, decision: { action, ruleIndex: 0, matched, reason } });
const log = [
  ev({ type: "run.start", agent: "bea", model: "m", trigger: "cron" }),
  ev({ type: "tools.offered", offered: ["gmail.search_threads"], hidden: ["gmail.send"] }),
  req("a", "gmail", "search_threads"), dec("a", "allow", "gmail.*"),
  req("b", "gmail", "create_draft"), dec("b", "ask", "gmail.create_draft", "a draft in your name"),
  ev({ type: "approval.resolved", callId: "b", approved: false, by: "Humberto (phone)", note: "already called" }),
  req("c", "gmail", "create_draft"), dec("c", "block", "gmail.create_draft"),
  ev({ type: "run.end", status: "error", summary: "model busy: x", offline: true, busy: { model: "m", reason: "high demand" } }),
];

describe("garu why", () => {
  afterEach(() => setLocale("en"));
  it("says it in English", () => {
    expect(whyLines(log)).toEqual([
      "1 call went through on its own: gmail.search_threads (rule gmail.*)",
      "gmail.create_draft asked you once: declined by you (“already called”)",
      "1 call was blocked by the policy: gmail.create_draft",
      "1 tool was never offered, since no rule could allow it: gmail.send",
      "It stopped because the model was busy; nothing was changed, and the schedule tries again.",
    ]);
  });
  it("and in Spanish", () => {
    setLocale("es");
    expect(whyLines(log)[1]).toBe("gmail.create_draft te preguntó una vez: rechazado por ti (“already called”)");
    expect(whyLines(log).at(-1)).toBe("Se detuvo porque el modelo estaba ocupado; nada cambió, y el horario lo intenta de nuevo.");
  });
  it("a run with nothing to tell says so", () => {
    expect(whyLines([ev({ type: "run.start", agent: "bea", model: "m", trigger: "manual" }), ev({ type: "run.end", status: "ok" })])).toEqual(["It made no tool calls and ran to the end."]);
  });
});
