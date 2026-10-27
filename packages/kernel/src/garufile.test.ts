import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { knownLanguage, parseGarufile, GarufileError } from "./garufile.js";

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

  it("rejects a rule pattern that isn't a valid regular expression, at parse time", () => {
    expect(() => parseGarufile(`
name: x
model: fake/x
prompt: p
policy:
  - tool: "a.b"
    action: block
    when: { url: { matches: "(unclosed" } }
`)).toThrow(/not a valid pattern/);
  });

  it("takes a language code, not a language name", () => {
    expect(parseGarufile("name: a\nmodel: fake/any\nprompt: p\nlanguage: es\n").language).toBe("es");
    expect(parseGarufile("name: a\nmodel: fake/any\nprompt: p\nlanguage: pt-BR\n").language).toBe("pt-BR");
    expect(parseGarufile("name: a\nmodel: fake/any\nprompt: p\n").language).toBeUndefined();
    expect(() => parseGarufile("name: a\nmodel: fake/any\nprompt: p\nlanguage: Spanish\n")).toThrow(/language/);
  });

  it("the shipped Spanish editions parse and say so", () => {
    for (const name of ["tomay", "bea"]) {
      const g = parseGarufile(readFileSync(join(import.meta.dirname, "..", "..", "..", "agents", name, "Garufile.es.yaml"), "utf8"));
      expect(g.name).toBe(name);
      expect(g.language).toBe("es");
    }
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

  it("parses budget and rejects negative caps", () => {
    const g = parseGarufile(minimal + "\nbudget:\n  maxCostUsd: 0.25\n");
    expect(g.budget).toEqual({ maxCostUsd: 0.25 });
    expect(parseGarufile(minimal).budget).toEqual({});
    expect(() => parseGarufile(minimal + "\nbudget:\n  maxCostUsd: -1\n")).toThrow(/budget.maxCostUsd/);
  });

  it("reports invalid YAML plainly", () => {
    expect(() => parseGarufile("name: [unclosed")).toThrow(/invalid YAML/);
  });

  it("names a language code it knows, and says nothing for one it doesn't", () => {
    // The schema only checks the shape; "xx" passes it, and Intl would quietly hand the agent English dates.
    expect(parseGarufile(minimal + "\nlanguage: xx\n").language).toBe("xx");
    expect(knownLanguage("es")).toBe("Spanish");
    expect(knownLanguage("pt-BR")).toBe("Brazilian Portuguese");
    expect(knownLanguage("xx")).toBeNull();
    expect(knownLanguage("zz-ZZ")).toBeNull();
    expect(knownLanguage("")).toBeNull();
  });
});
