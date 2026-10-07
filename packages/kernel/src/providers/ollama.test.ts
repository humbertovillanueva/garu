import { describe, expect, it } from "vitest";
import { OllamaProvider } from "./ollama.js";

const okResponse = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });

describe("OllamaProvider", () => {
  it("normalises the host", () => {
    expect(new OllamaProvider("localhost:11434").host).toBe("http://localhost:11434");
    expect(new OllamaProvider("http://box:11434/").host).toBe("http://box:11434");
  });

  it("maps our dialect to /api/chat and back, including tool results", async () => {
    let url = "";
    let captured: Record<string, unknown> = {};
    const fakeFetch = (async (u: string | URL | Request, init?: RequestInit) => {
      url = String(u);
      captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return okResponse({
        message: { role: "assistant", content: "", tool_calls: [{ function: { name: "fs__read", arguments: { path: "/a" } } }] },
        done_reason: "stop",
        prompt_eval_count: 50,
        eval_count: 7,
      });
    }) as typeof fetch;

    const p = new OllamaProvider("http://127.0.0.1:11434", fakeFetch);
    const res = await p.complete({
      model: "llama3.2",
      system: "sys",
      tools: [{ name: "fs__read", description: "read", inputSchema: { type: "object", properties: { path: { type: "string" } } } }],
      messages: [
        { role: "user", content: [{ type: "text", text: "go" }] },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "fs__read", input: { path: "/x" } }] },
        { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "DENIED", isError: true }] },
      ],
    });

    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(captured["model"]).toBe("llama3.2");
    expect(captured["stream"]).toBe(false);
    const msgs = captured["messages"] as Record<string, unknown>[];
    expect(msgs[0]).toEqual({ role: "system", content: "sys" });
    expect(msgs[1]).toEqual({ role: "user", content: "go" });
    expect(msgs[2]).toMatchObject({ role: "assistant", tool_calls: [{ id: "t1", function: { name: "fs__read", arguments: { path: "/x" } } }] });
    expect(msgs[3]).toEqual({ role: "tool", content: "ERROR: DENIED", tool_name: "fs__read" });
    expect((captured["tools"] as unknown[]).length).toBe(1);

    expect(res.stopReason).toBe("tool_use");
    expect(res.content[0]).toMatchObject({ type: "tool_use", name: "fs__read", input: { path: "/a" } });
    expect(res.usage).toEqual({ inputTokens: 50, outputTokens: 7 });
  });

  it("parses stringified tool arguments", async () => {
    const fakeFetch = (async () =>
      okResponse({ message: { role: "assistant", content: "", tool_calls: [{ function: { name: "add", arguments: '{"a":1,"b":2}' } }] } })) as typeof fetch;
    const res = await new OllamaProvider("x", fakeFetch).complete({ model: "m", system: "", messages: [], tools: [] });
    expect(res.content[0]).toMatchObject({ type: "tool_use", input: { a: 1, b: 2 } });
  });

  it("explains when Ollama isn't running", async () => {
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
    await expect(new OllamaProvider("http://127.0.0.1:11434", down).complete({ model: "m", system: "", messages: [], tools: [] }))
      .rejects.toThrow(/Is Ollama running\?/);
  });

  it("explains when the model isn't pulled or can't use tools", async () => {
    const notFound = (async () => new Response(JSON.stringify({ error: 'model "llama9" not found, try pulling it first' }), { status: 404 })) as typeof fetch;
    await expect(new OllamaProvider("x", notFound).complete({ model: "llama9", system: "", messages: [], tools: [] }))
      .rejects.toThrow(/ollama pull llama9/);
    const noTools = (async () => new Response(JSON.stringify({ error: "registry.ollama.ai/library/gemma:2b does not support tools" }), { status: 400 })) as typeof fetch;
    await expect(new OllamaProvider("x", noTools).complete({ model: "gemma:2b", system: "", messages: [], tools: [] }))
      .rejects.toThrow(/can't call tools/);
  });
});
