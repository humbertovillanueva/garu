import { describe, expect, it } from "vitest";
import { PolicyEngine, getPath, predicateHolds, qualifiedName } from "./policy.js";
import type { PolicyRule } from "./garufile.js";

const rules: PolicyRule[] = [
  { tool: "gmail.list_*", action: "allow" },
  { tool: "gmail.send", action: "block", when: { "recipients.length": { gt: 5 } }, reason: "mass mail" },
  { tool: "gmail.send", action: "ask" },
  { tool: "gmail.delete*", action: "block" },
  { tool: "fs.read_file", action: "allow", when: { path: { matches: "^/home/me/" } } },
  { tool: "*", action: "ask" },
];
const engine = new PolicyEngine(rules);

describe("qualifiedName / getPath", () => {
  it("joins server and tool", () => {
    expect(qualifiedName({ server: "gmail", tool: "send" })).toBe("gmail.send");
  });
  it("walks dotted paths including array length", () => {
    expect(getPath({ recipients: ["a", "b"] }, "recipients.length")).toBe(2);
    expect(getPath({ to: [{ email: "x" }] }, "to.0.email")).toBe("x");
    expect(getPath({}, "nope.deeper")).toBeUndefined();
  });
});

describe("predicateHolds", () => {
  it("handles each operator", () => {
    expect(predicateHolds(3, { gt: 2 })).toBe(true);
    expect(predicateHolds(3, { gt: 3 })).toBe(false);
    expect(predicateHolds("abc", { matches: "^a" })).toBe(true);
    expect(predicateHolds(5, { matches: "^a" })).toBe(false);
    expect(predicateHolds("NoReply@x.com", { matches: "noreply" })).toBe(false);
    expect(predicateHolds("NoReply@x.com", { matches: "noreply", ignoreCase: true })).toBe(true);
    expect(predicateHolds("x", { in: ["x", "y"] })).toBe(true);
    expect(predicateHolds(undefined, { exists: false })).toBe(true);
    expect(predicateHolds({ a: 1 }, { eq: { a: 1 } })).toBe(true);
    expect(predicateHolds({ a: 1 }, { neq: { a: 1 } })).toBe(false);
  });
});

describe("PolicyEngine.decide", () => {
  it("allows reads", () => {
    const d = engine.decide({ server: "gmail", tool: "list_messages", args: {} });
    expect(d.action).toBe("allow");
    expect(d.ruleIndex).toBe(0);
  });

  it("first match wins: mass mail is blocked before the generic ask", () => {
    const d = engine.decide({ server: "gmail", tool: "send", args: { recipients: new Array(6).fill("a") } });
    expect(d.action).toBe("block");
    expect(d.reason).toBe("mass mail");
  });

  it("small send falls through to ask", () => {
    const d = engine.decide({ server: "gmail", tool: "send", args: { recipients: ["a"] } });
    expect(d.action).toBe("ask");
    expect(d.ruleIndex).toBe(2);
  });

  it("globs with a trailing wildcard", () => {
    expect(engine.decide({ server: "gmail", tool: "delete_thread", args: {} }).action).toBe("block");
  });

  it("argument predicates gate allow", () => {
    expect(engine.decide({ server: "fs", tool: "read_file", args: { path: "/home/me/a" } }).action).toBe("allow");
    expect(engine.decide({ server: "fs", tool: "read_file", args: { path: "/etc/passwd" } }).action).toBe("ask");
  });

  it("a rule on a list sees every entry: a reply's recipients, not just the first", () => {
    const e = new PolicyEngine([
      { tool: "gmail.create_draft", action: "block", when: { to: { matches: "(^|[.\\-_+@<])(no-?reply|notifications?)([.\\-_+@>]|$)", ignoreCase: true } }, reason: "no one reads it" },
      { tool: "gmail.create_draft", action: "ask" },
    ]);
    const draft = (to: unknown) => e.decide({ server: "gmail", tool: "create_draft", args: { to } }).action;
    expect(draft(["Bank <alerts@notification.bank.com>"])).toBe("block");
    expect(draft(["NoReply@bank.com"])).toBe("block");
    expect(draft(["Ana <ana@x.com>", "noreply@bank.com"])).toBe("block");
    expect(draft("noreply@bank.com")).toBe("block");
    expect(draft(["Ana <ana@x.com>"])).toBe("ask");
    expect(draft([])).toBe("ask");
  });

  it("a path can't slip past a prefix rule with ..", () => {
    const read = (path: string) => engine.decide({ server: "fs", tool: "read_file", args: { path } }).action;
    expect(read("/home/me/./notes.md")).toBe("allow");
    expect(read("/home/me/a/../b")).toBe("allow");
    expect(read("/home/me/../root/.ssh/id")).toBe("ask");
  });

  it("flags a rule no request can reach: after a catch-all, or behind an unconditional rule for its tool", () => {
    expect(new PolicyEngine([{ tool: "gmail.create_draft", action: "allow" }, { tool: "gmail.create_draft", action: "ask" }, { tool: "gmail.*", action: "block" }]).unreachableRules()).toEqual([1]);
    expect(new PolicyEngine([{ tool: "gmail.create_draft", action: "block", when: { to: { matches: "x" } } }, { tool: "gmail.create_draft", action: "ask" }]).unreachableRules()).toEqual([]);
    expect(new PolicyEngine([{ tool: "*", action: "ask" }, { tool: "fs.read", action: "allow" }]).unreachableRules()).toEqual([1]);
    expect(engine.unreachableRules()).toEqual([]);
  });

  it("never silently allows when nothing matches", () => {
    const empty = new PolicyEngine([]);
    const d = empty.decide({ server: "x", tool: "y", args: {} });
    expect(d.action).toBe("ask");
    expect(d.ruleIndex).toBe(-1);
  });

  it("globs: '*' spans the dot, so 'gmail*' and '*.send' both match 'gmail.send'", () => {
    const e = new PolicyEngine([{ tool: "gmail*", action: "allow" }]);
    expect(e.decide({ server: "gmail", tool: "send", args: {} }).action).toBe("allow");
    const f = new PolicyEngine([{ tool: "*.send", action: "block" }]);
    expect(f.decide({ server: "gmail", tool: "send", args: {} }).action).toBe("block");
    expect(f.decide({ server: "gmail", tool: "list", args: {} }).action).toBe("ask");
  });
});

describe("PolicyEngine.staticDecision", () => {
  it("resolves tools whose fate never depends on arguments", () => {
    expect(engine.staticDecision({ server: "gmail", tool: "list_messages" })).toBe("allow");
    expect(engine.staticDecision({ server: "gmail", tool: "delete_thread" })).toBe("block");
    expect(engine.staticDecision({ server: "other", tool: "x" })).toBe("ask"); // catch-all
  });
  it("is undefined when the first matching rule has a `when`", () => {
    expect(engine.staticDecision({ server: "gmail", tool: "send" })).toBeUndefined();
    expect(engine.staticDecision({ server: "fs", tool: "read_file" })).toBeUndefined();
  });
  it("defaults to ask with no rules", () => {
    expect(new PolicyEngine([]).staticDecision({ server: "a", tool: "b" })).toBe("ask");
  });
});

describe("PolicyEngine.unreachableRules", () => {
  it("flags rules after a bare catch-all", () => {
    const e = new PolicyEngine([
      { tool: "*", action: "ask" },
      { tool: "gmail.send", action: "block" },
    ]);
    expect(e.unreachableRules()).toEqual([1]);
    expect(engine.unreachableRules()).toEqual([]);
  });
});
