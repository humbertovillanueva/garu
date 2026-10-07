/**
 * Ollama provider — local models, zero per-token cost.
 *
 * Talks to Ollama's /api/chat (non-streaming) with tool calling. Point it at
 * another machine with OLLAMA_HOST. Errors are written for the two things
 * that really go wrong: Ollama isn't running, or the model isn't pulled.
 */
import type { CompleteRequest, CompleteResponse, ContentBlock, ModelProvider } from "../provider.js";

interface OllamaToolCall {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> | string };
}
interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}
interface OllamaChatResponse {
  error?: string;
  message?: { role: string; content: string; tool_calls?: OllamaToolCall[] };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  readonly host: string;
  private readonly fetchImpl: typeof fetch;

  constructor(host = process.env["OLLAMA_HOST"] ?? "http://127.0.0.1:11434", fetchImpl: typeof fetch = fetch) {
    this.host = host.replace(/\/+$/, "");
    if (!/^https?:\/\//.test(this.host)) this.host = `http://${this.host}`;
    this.fetchImpl = fetchImpl;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const idToName = new Map<string, string>();
    for (const m of req.messages) for (const b of m.content) if (b.type === "tool_use") idToName.set(b.id, b.name);

    const messages: OllamaMessage[] = [{ role: "system", content: req.system }];
    for (const m of req.messages) {
      if (m.role === "assistant") {
        const text = m.content.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
        const calls = m.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
        messages.push({
          role: "assistant",
          content: text,
          ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, function: { name: c.name, arguments: c.input } })) } : {}),
        });
      } else {
        // user turn: plain text becomes a user message; each tool_result becomes a tool message
        for (const b of m.content) {
          if (b.type === "text") messages.push({ role: "user", content: b.text });
          else if (b.type === "tool_result") {
            const name = idToName.get(b.toolUseId);
            messages.push({
              role: "tool",
              content: b.isError ? `ERROR: ${b.content}` : b.content,
              ...(name ? { tool_name: name } : {}),
            });
          }
        }
      }
    }

    const body = {
      model: req.model,
      stream: false,
      messages,
      ...(req.tools.length
        ? {
            tools: req.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.inputSchema },
            })),
          }
        : {}),
      ...(typeof req.options?.["think"] === "boolean" ? { think: req.options["think"] } : {}),
      options: {
        num_predict: req.maxTokens ?? 4096,
        // everything else in modelOptions goes to Ollama's generation options (temperature, num_ctx, top_p…)
        ...Object.fromEntries(Object.entries(req.options ?? {}).filter(([k]) => k !== "think")),
      },
    };

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(
        `ollama: can't reach ${this.host} (${(e as Error).message}). Is Ollama running? Start the app or run \`ollama serve\`; set OLLAMA_HOST if it lives elsewhere.`,
      );
    }
    const json = (await res.json().catch(() => ({}))) as OllamaChatResponse;
    if (!res.ok || json.error) {
      const msg = json.error ?? `HTTP ${res.status}`;
      if (/not found/i.test(msg)) {
        throw new Error(`ollama: model "${req.model}" is not pulled. Run: ollama pull ${req.model}`);
      }
      if (/does not support tools/i.test(msg)) {
        throw new Error(`ollama: model "${req.model}" can't call tools. Pick one that can (e.g. llama3.1, llama3.2, qwen3, mistral-nemo).`);
      }
      throw new Error(`ollama ${req.model}: ${msg}`);
    }

    const content: ContentBlock[] = [];
    const msg = json.message;
    if (msg?.content) content.push({ type: "text", text: msg.content });
    let n = 0;
    for (const c of msg?.tool_calls ?? []) {
      const args = typeof c.function.arguments === "string" ? safeJson(c.function.arguments) : c.function.arguments;
      content.push({ type: "tool_use", id: c.id ?? `ollama_${Date.now()}_${n++}`, name: c.function.name, input: args });
    }
    const hasTools = content.some((b) => b.type === "tool_use");
    const stopReason: CompleteResponse["stopReason"] = hasTools ? "tool_use" : json.done_reason === "length" ? "max_tokens" : "end_turn";
    return {
      content,
      stopReason,
      usage: { inputTokens: json.prompt_eval_count ?? 0, outputTokens: json.eval_count ?? 0 },
    };
  }
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
