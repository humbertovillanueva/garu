/**
 * Gemini provider — talks to the Generative Language REST API directly.
 * No SDK dependency: the surface Garu needs is small, and this keeps the
 * kernel light. Function calling maps 1:1 onto our ContentBlock dialect.
 */
import type { CompleteRequest, CompleteResponse, ContentBlock, ModelProvider } from "../provider.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiPart =
  | { text: string; thoughtSignature?: string }
  | { functionCall: { name: string; args?: Record<string, unknown>; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown>; id?: string } };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export class GeminiProvider implements ModelProvider {
  readonly id = "gemini";
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey = process.env["GEMINI_API_KEY"], fetchImpl: typeof fetch = fetch) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set (put it in .env or your shell)");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    // Gemini pairs functionResponse with the call by name (and id when present);
    // we need the tool_use id → name map to build responses.
    const idToName = new Map<string, string>();
    for (const m of req.messages) for (const b of m.content) if (b.type === "tool_use") idToName.set(b.id, b.name);

    const contents: GeminiContent[] = req.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: m.content.map((b): GeminiPart => {
        switch (b.type) {
          case "text":
            return { text: b.text };
          case "tool_use": {
            const sig = b.meta?.["thoughtSignature"];
            return {
              functionCall: { name: b.name, args: b.input, id: b.id },
              ...(typeof sig === "string" ? { thoughtSignature: sig } : {}),
            };
          }
          case "tool_result":
            return {
              functionResponse: {
                name: idToName.get(b.toolUseId) ?? "unknown",
                id: b.toolUseId,
                response: b.isError ? { error: b.content } : { result: b.content },
              },
            };
        }
      }),
    }));

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents,
      generationConfig: { maxOutputTokens: req.maxTokens ?? 4096 },
    };
    if (req.tools.length > 0) {
      body["tools"] = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: sanitizeSchema(t.inputSchema),
          })),
        },
      ];
    }

    const { res, json } = await this.postWithRetry(req.model, body);

    void res;
    const cand = json.candidates?.[0];
    const content: ContentBlock[] = [];
    let n = 0;
    for (const p of cand?.content?.parts ?? []) {
      if ("text" in p && p.text) content.push({ type: "text", text: p.text });
      else if ("functionCall" in p) {
        content.push({
          type: "tool_use",
          id: p.functionCall.id ?? `call_${Date.now()}_${n++}`,
          name: p.functionCall.name,
          input: p.functionCall.args ?? {},
          ...(p.thoughtSignature ? { meta: { thoughtSignature: p.thoughtSignature } } : {}),
        });
      }
    }
    const hasTools = content.some((b) => b.type === "tool_use");
    const finish = cand?.finishReason;
    const stopReason: CompleteResponse["stopReason"] = hasTools
      ? "tool_use"
      : finish === "STOP"
        ? "end_turn"
        : finish === "MAX_TOKENS"
          ? "max_tokens"
          : "other";
    const u = json.usageMetadata;
    return {
      content,
      stopReason,
      ...(u ? { usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: u.candidatesTokenCount ?? 0 } } : {}),
    };
  }

  /**
   * Free tiers rate-limit hard (a handful of requests per minute). 429 and 503
   * are retried with the server's "retry in Ns" hint when present, else backoff.
   */
  private async postWithRetry(model: string, body: unknown): Promise<{ res: Response; json: GeminiResponse }> {
    const maxAttempts = this.maxAttempts;
    let lastMsg = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await this.fetchImpl(`${BASE}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (res.ok && !json.error) return { res, json };
      lastMsg = json.error?.message ?? `HTTP ${res.status}`;
      const retryable = res.status === 429 || res.status === 503;
      if (!retryable || attempt === maxAttempts) break;
      const hinted = /retry in ([0-9.]+)s/i.exec(lastMsg);
      const waitMs = Math.min(hinted ? Math.ceil(parseFloat(hinted[1]!) * 1000) + 500 : 2 ** attempt * 1000, 65_000);
      this.onRetry?.({ model, attempt, status: res.status, waitMs, message: lastMsg });
      await this.sleep(waitMs);
    }
    throw new Error(`gemini ${model}: ${lastMsg}`);
  }

  /** Overridable for tests. */
  maxAttempts = 4;
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));
  onRetry: ((info: { model: string; attempt: number; status: number; waitMs: number; message: string }) => void) | undefined =
    (i) => process.stderr.write(`         gemini ${i.status}: waiting ${Math.round(i.waitMs / 1000)}s then retrying (${i.attempt}/${this.maxAttempts})\n`);
}

interface GeminiResponse {
  error?: { message?: string };
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/** Gemini's schema dialect rejects some JSON-Schema keywords MCP servers emit. Strip them recursively. */
export function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const DROP = new Set(["$schema", "additionalProperties", "default", "examples", "title", "$id", "$ref", "definitions", "$defs"]);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (DROP.has(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  const cleaned = walk(schema) as Record<string, unknown>;
  if (!cleaned["type"]) cleaned["type"] = "object";
  if (cleaned["type"] === "object" && !cleaned["properties"]) cleaned["properties"] = {};
  return cleaned;
}
