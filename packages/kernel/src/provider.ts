/**
 * Model provider interface.
 *
 * Garu is vendor-neutral by design: the agent loop only speaks this small
 * dialect, and each provider adapter translates to its own API.
 */
export interface ModelTool {
  /** Provider-safe name (letters, digits, _ and -). The loop maps this back to "<server>.<tool>". */
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
      /** Opaque provider data that must be echoed back (e.g. Gemini thoughtSignature). Never inspected by the loop. */
      meta?: Record<string, unknown>;
    }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface ModelMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export interface CompleteRequest {
  model: string; // provider-specific id, without the "provider/" prefix
  system: string;
  messages: ModelMessage[];
  tools: ModelTool[];
  maxTokens?: number;
  /** Provider-specific knobs from the Garufile's modelOptions. Each provider takes what it understands. */
  options?: Record<string, unknown>;
}

export interface CompleteResponse {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ModelProvider {
  readonly id: string; // "anthropic", "openai", ...
  complete(req: CompleteRequest): Promise<CompleteResponse>;
}

/** Split "anthropic/claude-sonnet-4-5" → { provider: "anthropic", model: "claude-sonnet-4-5" }. */
export function splitModelId(id: string): { provider: string; model: string } {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) throw new Error(`model id must be "provider/model": ${id}`);
  return { provider: id.slice(0, slash), model: id.slice(slash + 1) };
}

/** "<server>.<tool>" → "<server>__<tool>" and back. Server names never contain "__". */
export const TOOL_SEP = "__";
export function toModelToolName(qualified: string): string {
  const dot = qualified.indexOf(".");
  if (dot < 0) throw new Error(`not a qualified tool name: ${qualified}`);
  return qualified.slice(0, dot) + TOOL_SEP + qualified.slice(dot + 1).replace(/[^a-zA-Z0-9_-]/g, "_");
}
export function fromModelToolName(name: string, known: readonly string[]): string | undefined {
  // Exact reverse mapping may be lossy (tool names with odd chars), so match against the known list.
  return known.find((q) => toModelToolName(q) === name);
}
