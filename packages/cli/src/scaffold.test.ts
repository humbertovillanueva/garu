import { describe, expect, it } from "vitest";
import { parseGarufile, PolicyEngine } from "@garu/kernel";
import { buildPrompt, hostsRegex, renderGarufile, suggestModel, type ScaffoldAnswers } from "./scaffold.js";

const base: ScaffoldAnswers = {
  name: "notes-keeper",
  task: "Tidy my notes folder every morning. Merge duplicates and flag anything older than a month.",
  model: "gemini/gemini-3.5-flash-lite",
  schedule: "weekday-morning",
  web: null,
  fs: { path: "./agents/notes-keeper/workspace", write: "ask" },
  webhook: null,
  maxCostUsd: 0.05,
};

describe("garu new scaffold", () => {
  it("renders a Garufile the kernel accepts, closed by default", () => {
    const g = parseGarufile(renderGarufile(base), "agents/notes-keeper/Garufile.yaml");
    expect(g.name).toBe("notes-keeper");
    expect(g.description).toBe("Tidy my notes folder every morning.");
    expect(g.triggers[0]?.cron).toBe("0 7 * * 1-5");
    expect(g.budget.maxCostUsd).toBe(0.05);
    expect(g.tools.map((t) => t.name)).toEqual(["fs"]);
    const p = new PolicyEngine(g.policy);
    expect(p.decide({ server: "fs", tool: "read_file", args: { path: "x" } }).action).toBe("allow");
    expect(p.decide({ server: "fs", tool: "write_file", args: { path: "x", content: "" } }).action).toBe("ask");
    expect(p.decide({ server: "fs", tool: "move_file", args: {} }).action).toBe("block");
    expect(p.decide({ server: "anything", tool: "else", args: {} }).action).toBe("block");
    expect(p.unreachableRules()).toEqual([]);
  });

  it("allows only the named hosts and always asks before posting", () => {
    const g = parseGarufile(
      renderGarufile({ ...base, name: "watch", schedule: "hourly", fs: null, web: { hosts: ["api.github.com", "hn.algolia.com"] }, webhook: { envVar: "WATCH_WEBHOOK_URL" } }),
    );
    const p = new PolicyEngine(g.policy);
    expect(p.decide({ server: "web", tool: "fetch_json", args: { url: "https://api.github.com/repos/x/y" } }).action).toBe("allow");
    expect(p.decide({ server: "web", tool: "fetch_json", args: { url: "https://api.github.com.evil.io/" } }).action).toBe("block");
    expect(p.decide({ server: "web", tool: "fetch_text", args: { url: "https://example.com/" } }).action).toBe("block");
    expect(p.decide({ server: "web", tool: "post_message", args: { text: "hi" } }).action).toBe("ask");
    expect(g.tools[0]?.env["WEBHOOK_URL"]).toBe("${WATCH_WEBHOOK_URL}");
    expect(g.triggers[0]?.cron).toBe("0 * * * *");
  });

  it("asks for every fetch when no hosts were given, and has no budget for local models", () => {
    const g = parseGarufile(renderGarufile({ ...base, model: "ollama/qwen3:8b", schedule: "manual", web: { hosts: [] }, fs: null, maxCostUsd: null }));
    expect(g.budget.maxCostUsd).toBeUndefined();
    expect(g.triggers[0]?.manual).toBe(true);
    expect(new PolicyEngine(g.policy).decide({ server: "web", tool: "fetch_text", args: { url: "https://a.b/" } }).action).toBe("ask");
  });

  it("writes allowed inside the folder when asked for", () => {
    const g = parseGarufile(renderGarufile({ ...base, fs: { path: "./ws", write: "allow" }, schedule: { cron: "*/30 * * * *" } }));
    expect(new PolicyEngine(g.policy).decide({ server: "fs", tool: "write_file", args: { path: "a", content: "" } }).action).toBe("allow");
    expect(g.triggers[0]?.cron).toBe("*/30 * * * *");
  });

  it("escapes hosts and survives odd text in the task", () => {
    expect(hostsRegex(["api.github.com"])).toBe("^https://(api\\.github\\.com)(/|$)");
    const g = parseGarufile(renderGarufile({ ...base, task: 'Say "hello: world" — with colons: and #hashes. Then stop.' }));
    expect(g.description).toBe('Say "hello: world" — with colons: and #hashes.');
    expect(g.prompt).toContain("#hashes");
  });

  it("writes a prompt that names the agent and its tools", () => {
    const text = buildPrompt({ ...base, web: { hosts: ["dev.to"] } });
    expect(text.startsWith("You are Notes Keeper.")).toBe(true);
    expect(text).toContain("read from dev.to");
    expect(text).toContain("writes are reviewed first");
  });

  it("suggests a model from the keys that are set", () => {
    expect(suggestModel({ GEMINI_API_KEY: "x" })[0]?.model).toBe("gemini/gemini-3.5-flash-lite");
    expect(suggestModel({})[0]?.model).toBe("ollama/qwen3:8b");
  });
});
