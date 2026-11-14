import { describe, expect, it } from "vitest";
import { explainRun } from "./why";
import type { Envelope } from "./types";

const ev = (event: Record<string, unknown> & { type: string }, seq = 0): Envelope => ({ seq, ts: "2026-11-13T15:00:00.000Z", runId: "r", agent: "bea", event });
const req = (id: string, server: string, tool: string) => ev({ type: "tool.request", callId: id, request: { server, tool, args: {} } });
const dec = (id: string, action: "allow" | "ask" | "block", matched: string, reason = "r") => ev({ type: "policy.decision", callId: id, decision: { action, ruleIndex: 0, matched, reason } });

describe("explainRun", () => {
  it("counts what went through, what asked and how it went, what was blocked, what was hidden, and what stopped it", () => {
    const why = explainRun([
      ev({ type: "run.start", agent: "bea", model: "m", trigger: "cron" }),
      ev({ type: "tools.offered", offered: ["gmail.search_threads"], hidden: ["gmail.delete", "gmail.send"] }),
      req("a", "gmail", "search_threads"), dec("a", "allow", "gmail.search_threads"),
      req("b", "gmail", "label_thread"), dec("b", "allow", "gmail.label_thread"),
      req("c", "gmail", "label_thread"), dec("c", "allow", "gmail.label_thread"),
      req("d", "gmail", "create_draft"), dec("d", "ask", "gmail.create_draft", "a draft in your name"),
      ev({ type: "approval.resolved", callId: "d", approved: true, by: "Humberto (ui)" }),
      req("e", "gmail", "create_draft"), dec("e", "ask", "gmail.create_draft", "a draft in your name"),
      ev({ type: "approval.resolved", callId: "e", approved: false, by: "Humberto (phone)", note: "already called" }),
      req("f", "gmail", "create_draft"), dec("f", "ask", "gmail.create_draft", "a draft in your name"),
      ev({ type: "approval.resolved", callId: "f", approved: false, by: "inbox: expired" }),
      req("g", "gmail", "create_draft"), dec("g", "ask", "gmail.create_draft", "a draft in your name"),
      ev({ type: "approval.resolved", callId: "g", approved: true, by: "grant 1a2b3c" }),
      req("h", "fs", "write_file"), dec("h", "block", "*", "not part of sorting your inbox"),
      ev({ type: "run.end", status: "error", summary: "model busy (high demand): x", offline: true, busy: { model: "m", reason: "high demand" } }),
    ]);
    expect(why.calls).toBe(8);
    expect(why.allowed).toEqual([{ tool: "gmail.search_threads", n: 1, rule: "gmail.search_threads" }, { tool: "gmail.label_thread", n: 2, rule: "gmail.label_thread" }]);
    expect(why.asked).toEqual([{ tool: "gmail.create_draft", n: 4, approved: 1, declined: 1, expired: 1, grant: 1, notes: ["already called"] }]);
    expect(why.blocked).toEqual([{ tool: "fs.write_file", n: 1, reason: "not part of sorting your inbox" }]);
    expect(why.hidden).toEqual(["gmail.delete", "gmail.send"]);
    expect(why.stopped).toBe("busy");
  });

  it("a run that ran to the end has nothing that stopped it", () => {
    expect(explainRun([ev({ type: "run.start", agent: "a", model: "m", trigger: "manual" }), ev({ type: "run.end", status: "ok" })])).toMatchObject({ calls: 0, stopped: null });
  });
});
