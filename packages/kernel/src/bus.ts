/**
 * MCP tool bus.
 *
 * The only road between an agent and the outside world. It connects to the
 * MCP servers named in the Garufile, exposes their tools under
 * "<server>.<tool>", and — for every call — asks the policy engine first,
 * writes the decision to the flight recorder, and only then talks to the
 * server. There is no bypass.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { randomUUID } from "node:crypto";
import type { McpServerSpec } from "./garufile.js";
import type { Decision, PolicyEngine, ToolCallRequest } from "./policy.js";
import type { Recorder } from "./recorder.js";

export interface BusTool {
  /** "<server>.<tool>" */
  qualified: string;
  server: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Approver {
  /** Return true to let the call through. Called only for `ask` decisions. */
  (req: ToolCallRequest, decision: Decision): Promise<{ approved: boolean; by: string }>;
}

export type CallOutcome =
  | { status: "ok"; result: unknown }
  | { status: "blocked"; decision: Decision }
  | { status: "denied"; decision: Decision; by: string }
  | { status: "error"; error: string };

export interface BusOptions {
  policy: PolicyEngine;
  recorder: Recorder;
  approver: Approver;
  /** Per-call timeout for the MCP server. */
  callTimeoutMs?: number;
}

interface Connected {
  spec: McpServerSpec;
  client: Client;
  transport: StdioClientTransport;
}

export class ToolBus {
  private readonly servers = new Map<string, Connected>();
  private tools: BusTool[] = [];

  constructor(private readonly opts: BusOptions) {}

  /** Spawn and handshake with every server. Fails loudly on the first that won't start. */
  async connect(specs: readonly McpServerSpec[]): Promise<void> {
    for (const spec of specs) {
      const transport = new StdioClientTransport({
        command: spec.command,
        args: spec.args,
        env: { ...getDefaultEnvironment(), ...spec.env },
        stderr: "pipe",
        ...(spec.cwd ? { cwd: spec.cwd } : {}),
      });
      const client = new Client({ name: "garu", version: "0.1.0" });
      try {
        await client.connect(transport);
      } catch (e) {
        throw new Error(
          `tool server "${spec.name}" failed to start (${spec.command} ${spec.args.join(" ")}): ${(e as Error).message}`,
        );
      }
      this.servers.set(spec.name, { spec, client, transport });
    }
    await this.refreshTools();
  }

  async refreshTools(): Promise<BusTool[]> {
    const out: BusTool[] = [];
    for (const [server, c] of this.servers) {
      const { tools } = await c.client.listTools();
      for (const t of tools) {
        out.push({
          qualified: `${server}.${t.name}`,
          server,
          name: t.name,
          description: t.description ?? "",
          inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: "object" },
        });
      }
    }
    this.tools = out;
    return out;
  }

  listTools(): readonly BusTool[] {
    return this.tools;
  }

  /** Split "<server>.<tool>" back into its parts. Tool names may contain dots; server names may not. */
  resolve(qualified: string): { server: string; tool: string } | undefined {
    const dot = qualified.indexOf(".");
    if (dot < 0) return undefined;
    const server = qualified.slice(0, dot);
    const tool = qualified.slice(dot + 1);
    if (!this.servers.has(server)) return undefined;
    if (!this.tools.some((t) => t.server === server && t.name === tool)) return undefined;
    return { server, tool };
  }

  /** The one path to the outside world. */
  async call(qualified: string, args: Record<string, unknown>): Promise<CallOutcome & { callId: string }> {
    const callId = randomUUID();
    const rec = this.opts.recorder;
    const target = this.resolve(qualified);
    if (!target) {
      const error = `unknown tool "${qualified}"`;
      rec.record({ type: "tool.result", callId, ok: false, durationMs: 0, error });
      return { status: "error", error, callId };
    }
    const req: ToolCallRequest = { server: target.server, tool: target.tool, args };
    rec.record({ type: "tool.request", callId, request: req });

    const decision = this.opts.policy.decide(req);
    rec.record({ type: "policy.decision", callId, decision });

    if (decision.action === "block") return { status: "blocked", decision, callId };

    if (decision.action === "ask") {
      rec.record({ type: "approval.requested", callId });
      const { approved, by } = await this.opts.approver(req, decision);
      rec.record({ type: "approval.resolved", callId, approved, by });
      if (!approved) return { status: "denied", decision, by, callId };
    }

    const started = Date.now();
    const c = this.servers.get(target.server)!;
    try {
      const result = await c.client.callTool(
        { name: target.tool, arguments: args },
        undefined,
        { timeout: this.opts.callTimeoutMs ?? 60_000 },
      );
      const durationMs = Date.now() - started;
      if (result.isError) {
        const error = extractText(result.content) || "tool reported an error";
        rec.record({ type: "tool.result", callId, ok: false, durationMs, error });
        return { status: "error", error, callId };
      }
      rec.record({ type: "tool.result", callId, ok: true, durationMs, result: result.content });
      return { status: "ok", result: result.content, callId };
    } catch (e) {
      const error = (e as Error).message;
      rec.record({ type: "tool.result", callId, ok: false, durationMs: Date.now() - started, error });
      return { status: "error", error, callId };
    }
  }

  async close(): Promise<void> {
    for (const c of this.servers.values()) {
      try {
        await c.client.close();
      } catch {
        /* already gone */
      }
    }
    this.servers.clear();
    this.tools = [];
  }
}

/** Pull plain text out of MCP content blocks. */
export function extractText(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content
    .map((b) => (b && typeof b === "object" && (b as { type?: string }).type === "text" ? String((b as { text?: unknown }).text ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}
