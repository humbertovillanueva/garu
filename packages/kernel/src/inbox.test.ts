import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Inbox, formatRequest } from "./inbox.js";

const req = { server: "gmail", tool: "send", args: { to: "a@b.c" } };
const decision = { action: "ask" as const, ruleIndex: 0, matched: "gmail.send", reason: "sending mail" };
const ctx = { agent: "mailer", runId: "run1", callId: "call1" };

describe("Inbox", () => {
  it("creates a request, lists it as pending, and resumes on approve", async () => {
    const seen: string[] = [];
    const inbox = new Inbox({ root: mkdtempSync(join(tmpdir(), "inbox-")), pollMs: 5, onRequest: (r) => void seen.push(r.id) });
    const approve = inbox.approver();
    const waiting = approve(req, decision, ctx);
    await new Promise((r) => setTimeout(r, 10));

    const pending = inbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ agent: "mailer", tool: "gmail.send", args: { to: "a@b.c" }, reason: "sending mail", runId: "run1" });
    expect(seen).toEqual([pending[0]!.id]);

    inbox.decide(pending[0]!.id, true, "humberto");
    await expect(waiting).resolves.toEqual({ approved: true, by: "humberto" });
    expect(inbox.pending()).toHaveLength(0);
    expect(inbox.get(pending[0]!.id)?.decision).toMatchObject({ approved: true, by: "humberto" });
  });

  it("deny resumes with approved=false", async () => {
    const inbox = new Inbox({ root: mkdtempSync(join(tmpdir(), "inbox-")), pollMs: 5 });
    const waiting = inbox.approver()(req, decision, ctx);
    await new Promise((r) => setTimeout(r, 10));
    inbox.decide(inbox.pending()[0]!.id, false, "humberto");
    await expect(waiting).resolves.toEqual({ approved: false, by: "humberto" });
  });

  it("a deny can carry a note, trimmed and capped, that the run receives", async () => {
    const inbox = new Inbox({ root: mkdtempSync(join(tmpdir(), "inbox-")), pollMs: 5 });
    const waiting = inbox.approver()(req, decision, ctx);
    await new Promise((r) => setTimeout(r, 10));
    inbox.decide(inbox.pending()[0]!.id, false, "humberto", "  wrong recipient — use b@c.d  ");
    await expect(waiting).resolves.toEqual({ approved: false, by: "humberto", note: "wrong recipient — use b@c.d" });
    const long = inbox.approver()(req, decision, { ...ctx, callId: "call2" });
    await new Promise((r) => setTimeout(r, 10));
    inbox.decide(inbox.pending()[0]!.id, false, "humberto", "x".repeat(900));
    expect((await long).note).toHaveLength(500);
  });

  it("expires as a deny — silence is never yes", async () => {
    let t = Date.parse("2026-10-07T00:00:00Z");
    const inbox = new Inbox({ root: mkdtempSync(join(tmpdir(), "inbox-")), pollMs: 5, timeoutMs: 1000, now: () => new Date(t) });
    const waiting = inbox.approver()(req, decision, ctx);
    await new Promise((r) => setTimeout(r, 10));
    expect(inbox.pending()).toHaveLength(1);
    t += 1001; // clock jumps past expiry
    await expect(waiting).resolves.toEqual({ approved: false, by: "inbox: expired" });
    expect(inbox.pending()).toHaveLength(0);
    expect(inbox.all()[0]?.decision).toMatchObject({ approved: false, by: "inbox: expired" });
  });

  it("refuses double decisions and unknown ids", async () => {
    const inbox = new Inbox({ root: mkdtempSync(join(tmpdir(), "inbox-")), pollMs: 5 });
    const r = await inbox.create(req, decision, ctx);
    inbox.decide(r.id, true, "a");
    expect(() => inbox.decide(r.id, false, "b")).toThrow(/already approved by a/);
    expect(() => inbox.decide("zzzzzz", true, "x")).toThrow(/no approval request/);
    expect(() => inbox.get("../etc")).toThrow(/bad approval id/);
  });

  it("formats a one-liner", async () => {
    const inbox = new Inbox({ root: mkdtempSync(join(tmpdir(), "inbox-")) });
    const r = await inbox.create(req, decision, ctx);
    expect(formatRequest(r)).toMatch(/^[a-z0-9]{6}  mailer  gmail\.send  \{"to":"a@b\.c"\}  — sending mail$/);
  });
});
