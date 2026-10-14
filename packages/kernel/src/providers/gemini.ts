/**
 * Gemini provider — talks to the Generative Language REST API directly.
 * No SDK dependency: the surface Garu needs is small, and this keeps the
 * kernel light. Function calling maps 1:1 onto our ContentBlock dialect.
 */
import type { CompleteRequest, CompleteResponse, ContentBlock, ModelProvider } from "../provider.js";

const REQUEST_TIMEOUT_MS = 120_000;
const BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiPart =
  | { text: string; thoughtSignature?: string }
  | { functionCall: { name: string; args?: Record<string, unknown>; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown>; id?: string } };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** "retry in 20s", "Please retry in 9h27m42.19s" → seconds, or null when the message has no hint. */
export function retryHintSeconds(message: string): number | null {
  const m = /retry in (?:(\d+)h)?(?:(\d+)m)?([0-9.]+)s/i.exec(message);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + parseFloat(m[3]!) : null;
}
/** A retry hint longer than this is a daily quota, not a rate limit. */
const QUOTA_WAIT_S = 300;

/** The model's daily quota is used up. Says so plainly, and carries when it resets so the app can say it in the reader's words. */
export class ModelQuotaError extends Error {
  readonly retryAt: string;
  readonly limit: number | undefined;
  constructor(readonly model: string, apiMessage: string, waitS: number) {
    const limit = /limit:\s*(\d+)/i.exec(apiMessage)?.[1];
    const h = Math.floor(waitS / 3600);
    const min = Math.round((waitS % 3600) / 60);
    super(`gemini ${model}: the daily quota for this model is used up${limit ? ` (${limit} requests a day${/free_tier/i.test(apiMessage) ? " on the free tier" : ""})` : ""}; it resets in about ${h ? `${h} h ` : ""}${min} min. Add billing to the key, or switch the model.`);
    this.name = "ModelQuotaError";
    this.retryAt = new Date(Date.now() + waitS * 1000).toISOString();
    this.limit = limit ? Number(limit) : undefined;
  }
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

    const { res, json } = await this.postWithRetry(req.model, body, req.onRetry);

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
  private async postWithRetry(model: string, body: unknown, onRetry?: CompleteRequest["onRetry"]): Promise<{ res: Response; json: GeminiResponse }> {
    const maxAttempts = this.maxAttempts;
    let lastMsg = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${BASE}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" },
          body: JSON.stringify(body),
          // A request cut off by the machine going to sleep would otherwise hang until the next wake, hours later.
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (e) {
        // The network, not Google. One quick retry covers a blip; a dead network fails fast and says so.
        if (attempt >= Math.min(2, maxAttempts)) throw new Error(`gemini ${model}: can't reach the network (${(e as Error).message})`, { cause: e });
        await this.sleep(2000);
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (res.ok && !json.error) return { res, json };
      lastMsg = json.error?.message ?? `HTTP ${res.status}`;
      const retryable = res.status === 429 || res.status === 503;
      if (!retryable) break;
      // "Please retry in 9h27m42s" is a daily quota, not a rate limit: waiting won't help and every retry counts, so stop and say so.
      const hintedS = retryHintSeconds(lastMsg);
      if (res.status === 429 && hintedS !== null && hintedS > QUOTA_WAIT_S) throw new ModelQuotaError(model, lastMsg, hintedS);
      if (attempt === maxAttempts) break;
      // 429 says how long to wait. 503 ("high demand") doesn't, and those spikes last longer than a few seconds: back off harder.
      const base = res.status === 503 ? 5000 * 2 ** (attempt - 1) : 2 ** attempt * 1000;
      const waitMs = Math.min(hintedS !== null ? Math.ceil(hintedS * 1000) + 500 : base, 65_000);
      const info = { model, attempt, maxAttempts, status: res.status, waitMs, message: lastMsg };
      this.onRetry?.(info);
      onRetry?.({ attempt, maxAttempts, waitMs, reason: res.status === 503 ? "high demand" : "rate limited" });
      await this.sleep(waitMs);
    }
    throw new Error(`gemini ${model}: ${lastMsg}`);
  }

  /** Overridable for tests. */
  maxAttempts = 6;
  /** Also overridable: tests set `sleep` to skip the waits. */
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));
  onRetry: ((info: { model: string; attempt: number; maxAttempts: number; status: number; waitMs: number; message: string }) => void) | undefined =
    (i) => process.stderr.write(`         gemini ${i.status}: waiting ${Math.round(i.waitMs / 1000)}s then retrying (${i.attempt}/${this.maxAttempts})\n`);
}

interface GeminiResponse {
  error?: { message?: string };
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Gemini accepts only a subset of JSON Schema. MCP servers emit whatever their
 * schema library produces (exclusiveMinimum, format: "uri", $schema, …), so we
 * keep a whitelist of keywords Gemini understands and drop the rest, recursively.
 */
const GEMINI_KEYS = new Set(["type", "description", "enum", "properties", "required", "items", "anyOf", "nullable", "minimum", "maximum", "minItems", "maxItems"]);
export function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const walk = (v: unknown, isSchema: boolean): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, isSchema));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (isSchema && !GEMINI_KEYS.has(k)) continue;
        // `properties` maps names → schemas; its keys are not keywords.
        if (k === "properties" && val && typeof val === "object") {
          out[k] = Object.fromEntries(Object.entries(val as Record<string, unknown>).map(([name, sub]) => [name, walk(sub, true)]));
        } else if (k === "items" || k === "anyOf") {
          out[k] = walk(val, true);
        } else {
          out[k] = isSchema && typeof val === "object" ? walk(val, false) : val;
        }
      }
      // Gemini wants a type on every schema; arrays of types ("string" | "null") become nullable.
      if (Array.isArray(out["type"])) {
        const ts = (out["type"] as string[]).filter((t) => t !== "null");
        if (ts.length !== (out["type"] as string[]).length) out["nullable"] = true;
        out["type"] = ts[0] ?? "string";
      }
      return out;
    }
    return v;
  };
  const cleaned = walk(schema, true) as Record<string, unknown>;
  if (!cleaned["type"]) cleaned["type"] = "object";
  if (cleaned["type"] === "object" && !cleaned["properties"]) cleaned["properties"] = {};
  return cleaned;
}
