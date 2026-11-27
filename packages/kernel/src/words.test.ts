import { describe, expect, it } from "vitest";
import type { PolicyRule } from "./garufile.js";
import { policyWords, whenInWords } from "./words.js";

const r = (tool: string, action: PolicyRule["action"], when?: PolicyRule["when"]): PolicyRule => ({ tool, action, ...(when ? { when } : {}) }) as PolicyRule;

describe("a policy in plain words", () => {
  it("sorts the rules into what it does on its own, what it asks about, what it never does, and how the file ends", () => {
    const w = policyWords([
      r("gmail.list_*", "allow"),
      r("gmail.get_thread", "allow"),
      r("gmail.create_draft", "allow", { to: { eq: ["lena@example.com"] } }),
      r("gmail.create_draft", "ask"),
      r("gmail.send", "block"),
      r("*", "block"),
      r("fs.read_file", "allow"), // under the catch-all: never wins, so not a word about it
    ]);
    expect(w).toEqual({
      allows: [{ tool: "gmail.list_*" }, { tool: "gmail.get_thread" }, { tool: "gmail.create_draft", when: 'to is ["lena@example.com"]' }],
      asks: [{ tool: "gmail.create_draft" }],
      blocks: [{ tool: "gmail.send" }],
      otherwise: "block",
    });
  });

  it("without a catch-all the file ends in ask, Garu's default", () => {
    expect(policyWords([r("fs.read_file", "allow")]).otherwise).toBe("ask");
    expect(policyWords([]).otherwise).toBe("ask");
  });

  it("says a condition the way a person would", () => {
    expect(whenInWords({ url: { matches: "^https://api\\.github\\.com/", ignoreCase: true }, size: { lte: 5 } })).toBe("url matches ^https://api\\.github\\.com/ (any case) and size ≤ 5");
    expect(whenInWords({ to: { exists: false } })).toBe("to is not given");
    expect(whenInWords(undefined)).toBeUndefined();
    expect(whenInWords({ to: { matches: "x".repeat(100) } })).toBe(`to matches ${"x".repeat(45)}…`);
  });
});
