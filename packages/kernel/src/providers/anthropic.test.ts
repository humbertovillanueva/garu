import { describe, expect, it } from "vitest";
import { anthropicParams } from "./anthropic.js";

describe("AnthropicProvider request", () => {
  it("maps the Garufile's modelOptions under the Messages API's names, and leaves the rest out", () => {
    const base = { model: "claude-sonnet-4-6", system: "sys", messages: [], tools: [] };
    const p = anthropicParams({ ...base, options: { temperature: 0.3, maxOutputTokens: 2000, budget_tokens: 1024, num_ctx: 8192, think: true } });
    expect(p).toMatchObject({ model: "claude-sonnet-4-6", max_tokens: 2000, temperature: 0.3, thinking: { type: "enabled", budget_tokens: 1024 }, system: "sys" });
    expect(JSON.stringify(p)).not.toMatch(/num_ctx|think"/);
    // Nothing set: the defaults, and no knob mentioned at all.
    const plain = anthropicParams(base);
    expect(plain.max_tokens).toBe(4096);
    expect(plain).not.toHaveProperty("temperature");
    expect(plain).not.toHaveProperty("thinking");
  });

  it("carries tool results back with is_error only when set", () => {
    const p = anthropicParams({
      model: "m", system: "", tools: [{ name: "fs__read", description: "read", inputSchema: { type: "object" } }],
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "fs__read", input: { path: "/x" } }] },
        { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "BLOCKED", isError: true }, { type: "text", text: "go on" }] },
      ],
    });
    expect(p.messages[1]?.content).toEqual([{ type: "tool_result", tool_use_id: "t1", content: "BLOCKED", is_error: true }, { type: "text", text: "go on" }]);
    expect(p.tools?.[0]).toMatchObject({ name: "fs__read", input_schema: { type: "object" } });
  });
});
