import { describe, expect, it } from "vitest";
import type { PolicyRule } from "./garufile.js";
import { globCovers, lintPolicy } from "./lint.js";

const r = (tool: string, action: PolicyRule["action"] = "allow", when?: PolicyRule["when"]): PolicyRule => ({ tool, action, ...(when ? { when } : {}) }) as PolicyRule;

describe("globCovers", () => {
  it("a star covers everything, a trailing star its prefix, a literal only itself", () => {
    expect(globCovers("*", "gmail.send")).toBe(true);
    expect(globCovers("gmail.*", "gmail.send")).toBe(true);
    expect(globCovers("gmail.*", "gmail.*")).toBe(true);
    expect(globCovers("gmail.*", "calendar.list")).toBe(false);
    expect(globCovers("gmail.send", "gmail.send")).toBe(true);
    expect(globCovers("gmail.send", "gmail.*")).toBe(false);
    expect(globCovers("*.send", "gmail.send")).toBe(false); // a star in the middle is not reasoned about
  });
});

describe("lintPolicy", () => {
  it("flags a rule under a catch-all, and one a broader rule above it already decides", () => {
    const rules = [r("gmail.create_draft", "ask"), r("gmail.*", "allow"), r("gmail.send", "block"), r("*", "block"), r("fs.read_file", "allow")];
    expect(lintPolicy(rules, ["gmail", "fs"])).toEqual([{ index: 2, by: 1 }, { index: 4, by: 3 }]);
  });

  it("a rule with conditions does not shadow; one under it still wins for other arguments", () => {
    const rules = [r("gmail.create_draft", "allow", { to: { eq: ["lena@example.com"] } }), r("gmail.create_draft", "ask")];
    expect(lintPolicy(rules, ["gmail"])).toEqual([]);
  });

  it("names a server the Garufile doesn't have, but only when it knows the servers; garu.* is built in", () => {
    const rules = [r("slack.post", "ask"), r("garu.remember", "ask"), r("*.x", "block")];
    expect(lintPolicy(rules, ["gmail"])).toEqual([{ index: 0, server: "slack" }]);
    expect(lintPolicy(rules)).toEqual([]);
  });
});
