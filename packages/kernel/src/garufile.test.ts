import { describe, expect, it } from "vitest";
import { parseGarufile, GarufileError } from "./garufile.js";

const minimal = `
name: hello
model: anthropic/claude-sonnet-4-5
prompt: say hi
`;

describe("parseGarufile", () => {
  it("fills defaults", () => {
    const g = parseGarufile(minimal);
    expect(g.name).toBe("hello");
    expect(g.tools).toEqual([]);
    expect(g.triggers).toEqual([{ manual: true }]);
    expect(g.policy).toEqual([{ tool: "*", action: "ask" }]);
    expect(g.maxTurns).toBe(25);
  });

  it("rejects bad names with a path in the message", () => {
    expect(() => parseGarufile(minimal.replace("hello", "Hello World"))).toThrow(/name:/);
  });

  it("rejects models without a provider", () => {
    expect(() => parseGarufile(minimal.replace("anthropic/claude-sonnet-4-5", "gpt-5"))).toThrow(/provider\/model/);
  });

  it("rejects unknown keys (strict)", () => {
    expect(() => parseGarufile(minimal + "\nbanana: 1\n")).toThrow(GarufileError);
  });

  it("rejects duplicate server names", () => {
    const y = minimal + `
tools:
  - name: fs
    command: npx
  - name: fs
    command: npx
`;
    expect(() => parseGarufile(y)).toThrow(/duplicate tool server name "fs"/);
  });

  it("rejects an empty trigger", () => {
    expect(() => parseGarufile(minimal + "\ntriggers:\n  - {}\n")).toThrow(/trigger needs one of/);
  });

  it("parses the full example", () => {
    const y = `
name: inbox-triage
description: triage mail
model: anthropic/claude-sonnet-4-5
tools:
  - name: gmail
    command: npx
    args: ["-y", "@example/mcp-gmail"]
triggers:
  - cron: "*/15 * * * *"
policy:
  - tool: "gmail.list_*"
    action: allow
  - tool: "gmail.send"
    action: ask
    when:
      recipients.length: { gt: 5 }
    reason: mass mail
  - tool: "*"
    action: ask
prompt: triage
`;
    const g = parseGarufile(y);
    expect(g.tools[0]?.args).toEqual(["-y", "@example/mcp-gmail"]);
    expect(g.policy[1]?.when?.["recipients.length"]).toEqual({ gt: 5 });
  });

  it("reports invalid YAML plainly", () => {
    expect(() => parseGarufile("name: [unclosed")).toThrow(/invalid YAML/);
  });
});
