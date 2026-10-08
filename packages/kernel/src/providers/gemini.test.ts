import { describe, expect, it } from "vitest";
import { GeminiProvider, sanitizeSchema } from "./gemini.js";

describe("sanitizeSchema", () => {
  it("keeps only keywords Gemini accepts and fills type/properties", () => {
    const out = sanitizeSchema({
      $schema: "x",
      type: "object",
      additionalProperties: false,
      required: ["a"],
      properties: {
        a: { type: "string", default: "q", title: "A", format: "uri", description: "the url" },
        b: { type: "array", items: { type: "number", examples: [1], exclusiveMinimum: 0 } },
        c: { type: ["string", "null"], minLength: 1 },
      },
    });
    expect(out).toEqual({
      type: "object",
      required: ["a"],
      properties: {
        a: { type: "string", description: "the url" },
        b: { type: "array", items: { type: "number" } },
        c: { type: "string", nullable: true },
      },
    });
    expect(sanitizeSchema({})).toEqual({ type: "object", properties: {} });
  });
  it("does not treat property names as keywords", () => {
    const out = sanitizeSchema({ type: "object", properties: { format: { type: "string" }, items: { type: "integer" } } });
    expect(out).toEqual({ type: "object", properties: { format: { type: "string" }, items: { type: "integer" } } });
  });
});

describe("GeminiProvider (mocked fetch)", () => {
  it("maps our dialect to Gemini and back, including tool results", async () => {
    let captured: unknown;
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "ok" }, { functionCall: { name: "fs__read", args: { path: "/a" }, id: "c1" }, thoughtSignature: "SIG" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const p = new GeminiProvider("test-key", fakeFetch);
    const res = await p.complete({
      model: "gemini-x",
      system: "sys",
      tools: [{ name: "fs__read", description: "read", inputSchema: { type: "object", properties: { path: { type: "string" } } } }],
      messages: [
        { role: "user", content: [{ type: "text", text: "go" }] },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "fs__read", input: { path: "/x" }, meta: { thoughtSignature: "PREV" } }] },
        { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "BLOCKED", isError: true }] },
      ],
    });

    const body = captured as { contents: { role: string; parts: Record<string, unknown>[] }[]; systemInstruction: unknown; tools: unknown[] };
    expect(body.systemInstruction).toEqual({ parts: [{ text: "sys" }] });
    expect(body.contents[1]?.role).toBe("model");
    expect(body.contents[1]?.parts[0]).toEqual({ functionCall: { name: "fs__read", args: { path: "/x" }, id: "t1" }, thoughtSignature: "PREV" });
    expect(body.contents[2]?.parts[0]).toEqual({
      functionResponse: { name: "fs__read", id: "t1", response: { error: "BLOCKED" } },
    });
    expect(body.tools).toHaveLength(1);

    expect(res.stopReason).toBe("tool_use");
    expect(res.content).toEqual([
      { type: "text", text: "ok" },
      { type: "tool_use", id: "c1", name: "fs__read", input: { path: "/a" }, meta: { thoughtSignature: "SIG" } },
    ]);
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
  });

  it("surfaces API errors with the model name", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ error: { message: "invalid argument" } }), { status: 400 })) as typeof fetch;
    const p = new GeminiProvider("k", fakeFetch);
    await expect(p.complete({ model: "m", system: "", messages: [], tools: [] })).rejects.toThrow(/gemini m: invalid argument/);
  });

  it("retries 429 using the server's retry hint, then succeeds", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      if (calls < 3) return new Response(JSON.stringify({ error: { message: "quota. Please retry in 0.01s." } }), { status: 429 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "finally" }] }, finishReason: "STOP" }] }), { status: 200 });
    }) as typeof fetch;
    const p = new GeminiProvider("k", fakeFetch);
    const waits: number[] = [];
    p.sleep = async (ms) => { waits.push(ms); };
    p.onRetry = undefined;
    const res = await p.complete({ model: "m", system: "", messages: [], tools: [] });
    expect(res.content).toEqual([{ type: "text", text: "finally" }]);
    expect(calls).toBe(3);
    expect(waits).toEqual([510, 510]);
  });

  it("backs off harder on 503 (high demand) and tells the caller about each retry", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      if (calls < 3) return new Response(JSON.stringify({ error: { message: "This model is currently experiencing high demand. Spikes in demand are usually temporary." } }), { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }), { status: 200 });
    }) as typeof fetch;
    const p = new GeminiProvider("k", fakeFetch);
    const waits: number[] = []; const seen: { attempt: number; maxAttempts: number; reason: string }[] = [];
    p.sleep = async (ms) => { waits.push(ms); }; p.onRetry = undefined;
    const res = await p.complete({ model: "m", system: "", messages: [], tools: [], onRetry: (r) => seen.push({ attempt: r.attempt, maxAttempts: r.maxAttempts, reason: r.reason }) });
    expect(res.content).toEqual([{ type: "text", text: "ok" }]);
    expect(waits).toEqual([5000, 10000]);
    expect(seen).toEqual([
      { attempt: 1, maxAttempts: 6, reason: "This model is currently experiencing high demand" },
      { attempt: 2, maxAttempts: 6, reason: "This model is currently experiencing high demand" },
    ]);
  });

  it("gives up after maxAttempts and does not retry non-retryable errors", async () => {
    let calls = 0;
    const always429 = (async () => { calls++; return new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }); }) as typeof fetch;
    const p = new GeminiProvider("k", always429);
    p.sleep = async () => {}; p.onRetry = undefined; p.maxAttempts = 3;
    await expect(p.complete({ model: "m", system: "", messages: [], tools: [] })).rejects.toThrow(/quota/);
    expect(calls).toBe(3);

    let calls400 = 0;
    const bad = (async () => { calls400++; return new Response(JSON.stringify({ error: { message: "bad schema" } }), { status: 400 }); }) as typeof fetch;
    const q = new GeminiProvider("k", bad);
    q.sleep = async () => {}; q.onRetry = undefined;
    await expect(q.complete({ model: "m", system: "", messages: [], tools: [] })).rejects.toThrow(/bad schema/);
    expect(calls400).toBe(1);
  });

  it("requires a key", () => {
    const saved = process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    try {
      expect(() => new GeminiProvider()).toThrow(/GEMINI_API_KEY/);
    } finally {
      if (saved !== undefined) process.env["GEMINI_API_KEY"] = saved;
    }
  });
});
