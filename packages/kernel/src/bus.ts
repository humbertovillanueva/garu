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
import { execFile } from "node:child_process";
import type { McpServerSpec, Sandbox } from "./garufile.js";
import { dockerArgs, explainDockerError } from "./sandbox.js";
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

export interface ApprovalContext {
  agent: string;
  runId: string;
  callId: string;
}

export interface Approver {
  /** Return true to let the call through. Called only for `ask` decisions. */
  (req: ToolCallRequest, decision: Decision, ctx: ApprovalContext): Promise<{ approved: boolean; by: string }>;
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
  /** When set, every tool server runs inside its own Docker container. */
  sandbox?: Sandbox;
  /** Agent name, used to label containers. */
  agent?: string;
}

interface Connected {
  spec: McpServerSpec;
  client: Client;
  transport: StdioClientTransport;
  containerName?: string;
}

export class ToolBus {
  private readonly servers = new Map<string, Connected>();
  private tools: BusTool[] = [];

  constructor(private readonly opts: BusOptions) {}

  /** Spawn and handshake with every server. Fails loudly on the first that won't start. */
  async connect(rawSpecs: readonly McpServerSpec[]): Promise<void> {
    const specs = rawSpecs.map((s) => expandSpec(s, process.env));
    for (const spec of specs) {
      const sb = this.opts.sandbox;
      const wrapped = sb ? dockerArgs(spec, sb, this.opts.agent ?? "agent") : undefined;
      const transport = new StdioClientTransport({
        command: wrapped?.command ?? spec.command,
        args: wrapped?.args ?? spec.args,
        // inside a container, env goes in via -e; on the host, into the process
        env: wrapped ? getDefaultEnvironment() : { ...getDefaultEnvironment(), ...spec.env },
        stderr: "pipe",
        ...(spec.cwd && !wrapped ? { cwd: spec.cwd } : {}),
      });
      const client = new Client({ name: "garu", version: "0.1.0" });
      try {
        await client.connect(transport);
      } catch (e) {
        const raw = (e as Error).message;
        const hint = wrapped ? explainDockerError(raw, sb!.image) : raw;
        throw new Error(
          `tool server "${spec.name}" failed to start${wrapped ? " in sandbox" : ""} (${spec.command} ${spec.args.join(" ")}): ${hint}`,
        );
      }
      this.servers.set(spec.name, { spec, client, transport, ...(wrapped ? { containerName: wrapped.containerName } : {}) });
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
      const { approved, by } = await this.opts.approver(req, decision, { agent: rec.agent, runId: rec.runId, callId });
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
      // --rm handles the normal case; this covers a server that ignores stdin closing.
      if (c.containerName) await dockerRmForce(c.containerName);
    }
    this.servers.clear();
    this.tools = [];
  }
}

/**
 * Replace ${VAR} in a tool server's env values and args with values from the
 * environment, so secrets stay in .env and out of the Garufile. A missing
 * variable is an error, not an empty string.
 */
export function expandSpec(spec: McpServerSpec, env: NodeJS.ProcessEnv): McpServerSpec {
  const expand = (s: string, where: string) =>
    s.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name: string) => {
      const v = env[name];
      if (v === undefined || v === "") throw new Error(`tool server "${spec.name}": ${where} needs $\{${name}\} but it is not set (add it to .env)`);
      return v;
    });
  return {
    ...spec,
    args: spec.args.map((a) => expand(a, "an argument")),
    env: Object.fromEntries(Object.entries(spec.env).map(([k, v]) => [k, expand(v, `env ${k}`)])),
  };
}

function dockerRmForce(name: string): Promise<void> {
  return new Promise((done) => {
    execFile("docker", ["rm", "-f", name], { timeout: 10_000 }, () => done());
  });
}

/** Pull plain text out of MCP content blocks. */
export function extractText(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content
    .map((b) => (b && typeof b === "object" && (b as { type?: string }).type === "text" ? String((b as { text?: unknown }).text ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}
