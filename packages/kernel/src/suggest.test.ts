import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addPolicyRule, describeRule, narrowestRule, suggestRules } from "./suggest.js";
import { parseGarufile } from "./garufile.js";
import type { ApprovalRequest } from "./inbox.js";

const at = "2026-10-07T12:00:00Z";
const mk = (agent: string, tool: string, args: Record<string, unknown>, approved = true, by = "humberto"): ApprovalRequest => ({
  id: Math.random().toString(36).slice(2, 8), agent, runId: "r", callId: "c", tool, args, reason: "x",
  createdAt: at, expiresAt: at, decision: { approved, by, at },
});

describe("suggestRules", () => {
  const now = () => new Date("2026-10-07T13:00:00Z");
  it("suggests after 3 approvals with no declines, scoped to the exact path", () => {
    const d = [1, 2, 3].map(() => mk("heartbeat", "fs.write_file", { path: "/w/heartbeat.log", content: "x" }));
    const [s] = suggestRules(d, { now });
    expect(s).toMatchObject({ agent: "heartbeat", tool: "fs.write_file", approvals: 3 });
    expect(s!.rule).toEqual({ tool: "fs.write_file", action: "allow", when: { path: { eq: "/w/heartbeat.log" } } });
    expect(s!.summary).toBe("allow fs.write_file when path is exactly /w/heartbeat.log");
  });
  it("one decline, a grant decision, or too few approvals → nothing", () => {
    expect(suggestRules([mk("a", "t.x", {}), mk("a", "t.x", {}), mk("a", "t.x", {}, false)], { now })).toEqual([]);
    expect(suggestRules([mk("a", "t.x", {}), mk("a", "t.x", {})], { now })).toEqual([]);
    expect(suggestRules([mk("a", "t.x", {}), mk("a", "t.x", {}), mk("a", "t.x", {}, true, "grant abc (h)")], { now })).toEqual([]);
  });
  it("respects dismissed and the time window", () => {
    const d = [1, 2, 3].map(() => mk("a", "t.x", {}));
    expect(suggestRules(d, { now, dismissed: new Set(["a|t.x"]) })).toEqual([]);
    expect(suggestRules(d, { now: () => new Date("2026-11-07T13:00:00Z") })).toEqual([]);
  });
});

describe("narrowestRule", () => {
  it("common directory → prefix regex; mixed → tool-wide", () => {
    const r = narrowestRule("fs.write_file", [{ path: "/w/a.md" }, { path: "/w/b.md" }, { path: "/w/sub/c.md" }]);
    expect(r.when).toEqual({ path: { matches: "^/w/" } });
    expect(describeRule(r)).toBe("allow fs.write_file when path starts with /w/");
    expect(narrowestRule("web.fetch_json", [{ url: "https://a" }, { url: "https://b" }])).toEqual({ tool: "web.fetch_json", action: "allow" });
  });
});

describe("addPolicyRule", () => {
  it("inserts before the first matching rule and keeps comments", () => {
    const p = join(mkdtempSync(join(tmpdir(), "gf-")), "Garufile.yaml");
    writeFileSync(p, `# My agent
name: hb
model: fake/x
prompt: p

policy:
  - tool: "fs.list_*"     # reading is fine
    action: allow
  - tool: "fs.write_file"
    action: ask
    reason: appending
  - tool: "*"
    action: block
`);
    const { inserted } = addPolicyRule(p, { tool: "fs.write_file", action: "allow", when: { path: { eq: "/w/heartbeat.log" } } }, "learned from 3 approvals on 2026-10-07");
    expect(inserted).toBe(1);
    const text = readFileSync(p, "utf8");
    expect(text).toContain("# My agent");
    expect(text).toContain("# reading is fine");
    expect(text).toContain("# learned from 3 approvals");
    const g = parseGarufile(text);
    expect(g.policy[1]).toEqual({ tool: "fs.write_file", action: "allow", when: { path: { eq: "/w/heartbeat.log" } } });
    expect(g.policy[2]).toMatchObject({ tool: "fs.write_file", action: "ask" });
  });
  it("appends when nothing could match, and refuses to corrupt the file", () => {
    const p = join(mkdtempSync(join(tmpdir(), "gf-")), "Garufile.yaml");
    writeFileSync(p, "name: a\nmodel: fake/x\nprompt: p\npolicy:\n  - tool: \"gmail.*\"\n    action: ask\n");
    expect(addPolicyRule(p, { tool: "fs.read_file", action: "allow" }).inserted).toBe(1);
    expect(parseGarufile(readFileSync(p, "utf8")).policy).toHaveLength(2);
  });
});
