import { describe, expect, it } from "vitest";
import { ModelBusyError } from "./gemini.js";
import { OpenAIProvider } from "./openai.js";

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("OpenAIProvider (mocked fetch)", () => {
  it("maps our dialect to chat completions and back, including tool calls and results", async () => {
    let captured: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | undefined;
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> };
      return reply({ choices: [{ message: { content: "ok", tool_calls: [{ id: "c1", type: "function", function: { name: "fs__read", arguments: '{"path":"/a"}' } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 4 } });
    }) as typeof fetch;
    const p = new OpenAIProvider("sk-test", "https://api.groq.com/openai/v1/", fakeFetch);
    const res = await p.complete({
      model: "llama-3.3-70b-versatile", system: "sys", maxTokens: 512, options: { temperature: 0.2 },
      tools: [{ name: "fs__read", description: "read", inputSchema: { type: "object", properties: { path: { type: "string" } } } }],
      messages: [
        { role: "user", content: [{ type: "text", text: "go" }] },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "fs__read", input: { path: "/x" } }] },
        { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "BLOCKED", isError: true }] },
      ],
    });
    expect(captured!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(captured!.headers["authorization"]).toBe("Bearer sk-test");
    expect(captured!.body["messages"]).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "go" },
      { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "fs__read", arguments: '{"path":"/x"}' } }] },
      { role: "tool", tool_call_id: "t1", content: "ERROR: BLOCKED" },
    ]);
    expect(captured!.body).toMatchObject({ model: "llama-3.3-70b-versatile", max_tokens: 512, temperature: 0.2 });
    expect((captured!.body["tools"] as unknown[])[0]).toEqual({ type: "function", function: { name: "fs__read", description: "read", parameters: { type: "object", properties: { path: { type: "string" } } } } });
    expect(res).toEqual({ content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "c1", name: "fs__read", input: { path: "/a" } }], stopReason: "tool_use", usage: { inputTokens: 10, outputTokens: 4 } });
  });

  it("retries a rate limit with Retry-After, then gives up as busy so the schedule tries again", async () => {
    let calls = 0;
    const fakeFetch = (async () => { calls++; return reply({ error: { message: "Rate limit reached" } }, 429, { "retry-after": "3" }); }) as typeof fetch;
    const p = new OpenAIProvider("sk", undefined, fakeFetch);
    const waits: number[] = [];
    p.sleep = async (ms) => { waits.push(ms); };
    p.maxAttempts = 3;
    await expect(p.complete({ model: "gpt-x", system: "", tools: [], messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] })).rejects.toBeInstanceOf(ModelBusyError);
    expect(calls).toBe(3);
    expect(waits).toEqual([3500, 3500]);
  });

  it("says plainly when the key is refused or the model doesn't exist, and doesn't retry those", async () => {
    let calls = 0;
    const fakeFetch = (async () => { calls++; return reply({ error: { message: "Incorrect API key provided" } }, 401); }) as typeof fetch;
    const p = new OpenAIProvider("sk", undefined, fakeFetch);
    await expect(p.complete({ model: "gpt-x", system: "", tools: [], messages: [] })).rejects.toThrow(/refused the key.*OPENAI_API_KEY/);
    expect(calls).toBe(1);
    const p2 = new OpenAIProvider("sk", undefined, (async () => reply({ error: { message: "The model `nope` does not exist" } }, 404)) as typeof fetch);
    await expect(p2.complete({ model: "nope", system: "", tools: [], messages: [] })).rejects.toThrow(/has no such model/);
  });

  it("needs a key for a hosted server, but not for a local one", () => {
    const saved = process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    try {
      expect(() => new OpenAIProvider(undefined, undefined, fetch)).toThrow(/OPENAI_API_KEY is not set/);
      expect(new OpenAIProvider(undefined, "http://localhost:1234/v1", fetch).base).toBe("http://localhost:1234/v1");
    } finally { if (saved !== undefined) process.env["OPENAI_API_KEY"] = saved; }
  });
});
