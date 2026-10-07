import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GrantStore, parseDuration, scopeFor, withGrants } from "./grants.js";

const req = { server: "fs", tool: "write_file", args: { path: "/w/heartbeat.log", content: "x" } };
const decision = { action: "ask" as const, ruleIndex: 0, matched: "fs.write_file", reason: "r" };
const ctx = { agent: "heartbeat", runId: "r", callId: "c" };

describe("GrantStore", () => {
  it("creates, finds, uses, expires and revokes grants", () => {
    let t = Date.parse("2026-10-07T12:00:00Z");
    const s = new GrantStore(join(mkdtempSync(join(tmpdir(), "gr-")), "grants.jsonl"), () => new Date(t));
    const g = s.create({ agent: "heartbeat", tool: "fs.write_file", scope: scopeFor(req.args), durationMs: parseDuration("24h"), createdBy: "humberto" });
    expect(g.scope).toEqual({ key: "path", value: "/w/heartbeat.log" });
    expect(s.find("heartbeat", req)?.id).toBe(g.id);
    expect(s.find("heartbeat", { ...req, args: { path: "/w/other.log" } })).toBeUndefined(); // scoped
    expect(s.find("other", req)).toBeUndefined(); // per agent
    s.use(g.id);
    expect(s.active()[0]!.uses).toBe(1);
    t += 25 * 3_600_000;
    expect(s.find("heartbeat", req)).toBeUndefined(); // expired
    t -= 25 * 3_600_000;
    s.revoke(g.id);
    expect(s.find("heartbeat", req)).toBeUndefined();
    expect(() => s.revoke("zzz")).toThrow(/no grant/);
  });

  it("persists across reloads, last write wins", () => {
    const path = join(mkdtempSync(join(tmpdir(), "gr-")), "grants.jsonl");
    const a = new GrantStore(path);
    const g = a.create({ agent: "x", tool: "t.u", durationMs: 1000, createdBy: "me" });
    a.use(g.id); a.use(g.id);
    const b = new GrantStore(path);
    expect(b.all()).toHaveLength(1);
    expect(b.all()[0]!.uses).toBe(2);
    b.compact();
    expect(new GrantStore(path).all()[0]!.uses).toBe(2);
  });

  it("withGrants answers from a grant, else defers to the human", async () => {
    const s = new GrantStore(join(mkdtempSync(join(tmpdir(), "gr-")), "g.jsonl"));
    let humanCalls = 0;
    const approver = withGrants(async () => { humanCalls++; return { approved: false, by: "human" }; }, s);
    expect(await approver(req, decision, ctx)).toEqual({ approved: false, by: "human" });
    s.create({ agent: "heartbeat", tool: "fs.write_file", durationMs: 60_000, createdBy: "humberto" }); // unscoped
    const r = await approver(req, decision, ctx);
    expect(r.approved).toBe(true);
    expect(r.by).toMatch(/^grant [a-f0-9]{6} \(humberto, until /);
    expect(humanCalls).toBe(1);
  });

  it("parseDuration and scopeFor", () => {
    expect(parseDuration("30m")).toBe(1_800_000);
    expect(parseDuration("24h")).toBe(86_400_000);
    expect(parseDuration("7d")).toBe(7 * 86_400_000);
    expect(() => parseDuration("soon")).toThrow(/duration/);
    expect(scopeFor({ to: ["a@b.c"], subject: "x" })).toEqual({ key: "to", value: ["a@b.c"] });
    expect(scopeFor({ nested: { a: 1 } })).toBeUndefined();
  });
});
