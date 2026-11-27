import { describe, expect, it } from "vitest";
import type { PolicyRule } from "@garu/kernel";
import { policyLines } from "./words.js";

const r = (tool: string, action: PolicyRule["action"], when?: PolicyRule["when"]): PolicyRule => ({ tool, action, ...(when ? { when } : {}) }) as PolicyRule;

describe("the policy in words, for the terminal", () => {
  it("one line per kind, the conditions in the sentence, and how the file ends", () => {
    expect(policyLines([r("gmail.list_*", "allow"), r("gmail.create_draft", "allow", { to: { eq: "lena@example.com" } }), r("gmail.create_draft", "ask"), r("gmail.send", "block"), r("*", "block")])).toEqual([
      'On its own: gmail.list_*, gmail.create_draft when to is "lena@example.com"',
      "Asks you first: gmail.create_draft",
      "Never: gmail.send",
      "Anything else: blocked",
    ]);
    expect(policyLines([])).toEqual(["Anything else: asks you"]);
  });
});
