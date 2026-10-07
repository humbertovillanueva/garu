import Anthropic from "@anthropic-ai/sdk";
import type { CompleteRequest, CompleteResponse, ContentBlock, ModelProvider } from "../provider.js";

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  private readonly client: Anthropic;

  constructor(apiKey = process.env["ANTHROPIC_API_KEY"]) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set (put it in .env or your shell)");
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const res = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content.map((b) => {
          switch (b.type) {
            case "text":
              return { type: "text" as const, text: b.text };
            case "tool_use":
              return { type: "tool_use" as const, id: b.id, name: b.name, input: b.input };
            case "tool_result":
              return {
                type: "tool_result" as const,
                tool_use_id: b.toolUseId,
                content: b.content,
                ...(b.isError ? { is_error: true } : {}),
              };
          }
        }),
      })),
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
    });

    const content: ContentBlock[] = [];
    for (const b of res.content) {
      if (b.type === "text") content.push({ type: "text", text: b.text });
      else if (b.type === "tool_use")
        content.push({ type: "tool_use", id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
    }
    const stopReason =
      res.stop_reason === "end_turn" || res.stop_reason === "tool_use" || res.stop_reason === "max_tokens"
        ? res.stop_reason
        : "other";
    return {
      content,
      stopReason,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }
}
