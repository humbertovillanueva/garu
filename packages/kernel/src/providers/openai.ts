/**
 * OpenAI-compatible provider — Chat Completions over plain fetch, no SDK. One adapter covers OpenAI
 * itself and everything that speaks its API: Groq, OpenRouter, Mistral, LM Studio, a vLLM box.
 * OPENAI_API_KEY is the key; OPENAI_BASE_URL points it elsewhere (default https://api.openai.com/v1).
 * Tool calling maps onto the ContentBlock dialect the way Ollama's does; a busy or rate-limited server
 * rides the same rails as Gemini's (ModelBusyError after the retries), so the schedule tries again.
 */
import { MODEL_REQUEST_TIMEOUT_MS as REQUEST_TIMEOUT_MS, commonOptions, type CompleteRequest, type CompleteResponse, type ContentBlock, type ModelProvider } from "../provider.js";
import { ModelBusyError } from "./gemini.js";

const DEFAULT_BASE = "https://api.openai.com/v1";
/** A request that took this much longer than its timeout means the machine slept through it. */
const SLEPT_MS = 30_000;
const SLEEP_NET_TRIES = 4;

interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
interface ChatResponse {
  error?: { message?: string; code?: string | number; type?: string };
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai";
  readonly base: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey = process.env["OPENAI_API_KEY"], base = process.env["OPENAI_BASE_URL"] ?? DEFAULT_BASE, fetchImpl: typeof fetch = fetch) {
    // A local server (LM Studio, vLLM) takes any key; a hosted one needs the real thing.
    const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(base);
    if (!apiKey && !local) throw new Error("OPENAI_API_KEY is not set (put it in .env or your shell; OPENAI_BASE_URL points at Groq, OpenRouter, LM Studio or any OpenAI-compatible server)");
    this.apiKey = apiKey ?? "local";
    this.base = base.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const messages: ChatMessage[] = [{ role: "system", content: req.system }];
    for (const m of req.messages) {
      if (m.role === "assistant") {
        const text = m.content.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
        const calls = m.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
        messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}) });
      } else {
        for (const b of m.content) {
          if (b.type === "text") messages.push({ role: "user", content: b.text });
          else if (b.type === "tool_result") messages.push({ role: "tool", tool_call_id: b.toolUseId, content: b.isError ? `ERROR: ${b.content}` : b.content });
        }
      }
    }
    const knobs = commonOptions(req.options);
    const body: Record<string, unknown> = {
      model: req.model,
      messages,
      max_tokens: knobs.maxTokens ?? req.maxTokens ?? 4096,
      ...(knobs.temperature !== undefined ? { temperature: knobs.temperature } : {}),
      ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
    };

    const json = await this.postWithRetry(req.model, body, req.onRetry);
    const choice = json.choices?.[0];
    if (!choice?.message) throw new Error(`openai ${req.model}: the model sent no answer (an empty reply from ${this.base})`);
    const content: ContentBlock[] = [];
    if (choice.message.content) content.push({ type: "text", text: choice.message.content });
    let n = 0;
    for (const c of choice.message.tool_calls ?? []) content.push({ type: "tool_use", id: c.id || `call_${Date.now()}_${n++}`, name: c.function.name, input: safeJson(c.function.arguments) });
    const hasTools = content.some((b) => b.type === "tool_use");
    const stopReason: CompleteResponse["stopReason"] = hasTools ? "tool_use" : choice.finish_reason === "length" ? "max_tokens" : choice.finish_reason === "stop" || choice.finish_reason === undefined ? "end_turn" : "other";
    const u = json.usage;
    return { content, stopReason, ...(u ? { usage: { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 } } : {}) };
  }

  /** 429 and 5xx are retried with Retry-After when the server sends it, else backoff; still busy at the end is a ModelBusyError. */
  private async postWithRetry(model: string, body: unknown, onRetry?: CompleteRequest["onRetry"]): Promise<ChatResponse> {
    let lastMsg = "";
    let lastBusy: "high demand" | "rate limited" | null = null;
    let netTries = 0;
    let patient = false;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let res: Response;
      const sentAt = this.now();
      try {
        res = await this.fetchImpl(`${this.base}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (e) {
        if (this.now() - sentAt > REQUEST_TIMEOUT_MS + SLEPT_MS) patient = true;
        netTries++;
        if (netTries > (patient ? SLEEP_NET_TRIES : 1)) throw new Error(`openai ${model}: can't reach ${this.base} (${(e as Error).message})`, { cause: e });
        await this.sleep(patient ? 15_000 : 2000);
        attempt--;
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as ChatResponse;
      if (res.ok && !json.error) return json;
      lastMsg = json.error?.message ?? `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new Error(`openai ${model}: ${this.base} refused the key (${lastMsg}). Check OPENAI_API_KEY in .env.`);
      if (res.status === 404) throw new Error(`openai ${model}: ${this.base} has no such model (${lastMsg}).`);
      const retryable = res.status === 429 || res.status >= 500;
      lastBusy = retryable ? (res.status === 429 ? "rate limited" : "high demand") : null;
      if (!retryable || attempt === this.maxAttempts) break;
      const after = Number(res.headers.get("retry-after"));
      const waitMs = Math.min(Number.isFinite(after) && after > 0 ? after * 1000 + 500 : (res.status === 429 ? 2 ** attempt * 1000 : 5000 * 2 ** (attempt - 1)), 65_000);
      onRetry?.({ attempt, maxAttempts: this.maxAttempts, waitMs, reason: lastBusy! });
      await this.sleep(waitMs);
    }
    if (lastBusy) throw new ModelBusyError(model, lastMsg, lastBusy, "openai");
    throw new Error(`openai ${model}: ${lastMsg}`);
  }

  /** Overridable for tests. */
  maxAttempts = 6;
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));
  now: () => number = Date.now;
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
