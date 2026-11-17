import { describe, expect, it } from "vitest";
import { editGarufileText, editPolicyText } from "./edit.js";

const FILE = `# Bea sorts the inbox.
name: bea
description: Sorts the inbox.
prompt: Sort the inbox.
model: gemini/gemini-3.5-flash-lite   # the free one

triggers:
  - cron: "0 8 * * 1-5"   # weekday mornings

budget:
  maxCostUsd: 0.05   # a run stops before it crosses this
  maxRunsPerDay: 8

tools: []
policy:
  - tool: "*"
    action: block
`;

describe("editing a Garufile from the control room", () => {
  it("changes the schedule, the caps and the notebook, and keeps every comment", () => {
    const { text, garufile } = editGarufileText(FILE, { cron: "30 7 * * *", maxRunsPerDay: 3, maxCostUsd: 0.1, memory: true });
    expect(garufile.triggers[0]?.cron).toBe("30 7 * * *");
    expect(garufile.budget.maxRunsPerDay).toBe(3);
    expect(garufile.budget.maxCostUsd).toBe(0.1);
    expect(garufile.memory).toBe(true);
    expect(text).toContain("# Bea sorts the inbox.");
    expect(text).toContain("# the free one");
    expect(text).toContain("# weekday mornings");
    expect(text).toContain("# a run stops before it crosses this");
    expect(text).toContain("memory: true");
  });

  it("pauses and resumes", () => {
    const { text, garufile } = editGarufileText(FILE, { paused: true });
    expect(garufile.paused).toBe(true);
    expect(text).toContain("paused: true");
    const back = editGarufileText(text, { paused: false });
    expect(back.garufile.paused).toBe(false);
    expect(back.text).not.toContain("paused");
  });

  it("removes a cap or the schedule cleanly", () => {
    const { text, garufile } = editGarufileText(FILE, { cron: null, maxRunsPerDay: null, memory: false });
    expect(garufile.triggers).toEqual([{ manual: true }]);
    expect(garufile.budget.maxRunsPerDay ?? null).toBeNull();
    expect(text).not.toContain("maxRunsPerDay");
    expect(text).toContain("maxCostUsd: 0.05");
    const bare = editGarufileText(FILE, { maxRunsPerDay: null, maxCostUsd: null });
    expect(bare.text).not.toContain("budget:");
  });

  it("adds a schedule to an agent that had none, in place of a lone manual trigger", () => {
    const manual = FILE.replace('  - cron: "0 8 * * 1-5"   # weekday mornings', "  - manual: true");
    const { garufile } = editGarufileText(manual, { cron: "0 9 * * *" });
    expect(garufile.triggers).toEqual([{ cron: "0 9 * * *" }]);
  });

  it("refuses a bad cron and a cap below zero, and writes nothing", () => {
    expect(() => editGarufileText(FILE, { cron: "every monday" })).toThrow();
    expect(() => editGarufileText(FILE, { maxCostUsd: -1 })).toThrow();
  });
});

describe("editing the policy from the control room", () => {
  const WITH_RULES = FILE.replace(`policy:
  - tool: "*"
    action: block
`, `policy:
  # drafts ask, always
  - tool: "gmail.create_draft"
    when: { to: { matches: "no-reply" } }
    action: block
  - tool: "gmail.create_draft"
    action: ask
    reason: a draft in your name
  - tool: "*"
    action: block
`);

  it("changes a rule's action and reason, adds one, removes one, and keeps the comment and the when", () => {
    const { text, garufile } = editPolicyText(WITH_RULES, [
      { op: "set", index: 1, action: "allow", reason: null },
      { op: "add", index: 2, rule: { tool: "gmail.label_thread", action: "allow" } },
      { op: "remove", index: 3 },
    ]);
    expect(garufile.policy).toEqual([
      { tool: "gmail.create_draft", when: { to: { matches: "no-reply" } }, action: "block" },
      { tool: "gmail.create_draft", action: "allow" },
      { tool: "gmail.label_thread", action: "allow" },
    ]);
    expect(text).toContain("# drafts ask, always");
    expect(text).not.toContain("reason: a draft in your name");
  });

  it("refuses a bad action or a position that isn't there, and writes nothing", () => {
    expect(() => editPolicyText(WITH_RULES, [{ op: "set", index: 0, action: "maybe" as "allow" }])).toThrow();
    expect(() => editPolicyText(WITH_RULES, [{ op: "remove", index: 9 }])).toThrow(/no rule at position 9/);
  });
});
