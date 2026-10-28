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
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { isRemoteServer, type McpServerSpec, type Sandbox, type StdioServerSpec } from "./garufile.js";
import { FileOAuthProvider, NeedsSignInError, localAccessToken, signInFor } from "./oauth.js";
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
  /** The server says the tool only reads (MCP readOnlyHint): safe to try again when a call is cut off. */
  readOnly: boolean;
}

export interface ApprovalContext {
  agent: string;
  runId: string;
  callId: string;
}

export interface Approver {
  /** Return true to let the call through. Called only for `ask` decisions. */
  (req: ToolCallRequest, decision: Decision, ctx: ApprovalContext): Promise<{ approved: boolean; by: string; note?: string }>;
}

export type CallOutcome =
  | { status: "ok"; result: unknown }
  | { status: "blocked"; decision: Decision }
  | { status: "denied"; decision: Decision; by: string; note?: string }
  | { status: "error"; error: string };

export interface BusOptions {
  policy: PolicyEngine;
  recorder: Recorder;
  approver: Approver;
  /** Per-call timeout for the MCP server. */
  callTimeoutMs?: number;
  /** How long to wait before the one retry of a tool server that didn't start. */
  startupRetryMs?: number;
  /** When set, every tool server runs inside its own Docker container. */
  sandbox?: Sandbox;
  /** Agent name, used to label containers. */
  agent?: string;
  /** Where OAuth sign-ins for remote servers are kept (default .garu/auth). */
  authRoot?: string;
}

interface Connected {
  spec: McpServerSpec;
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  /** The server as the Garufile shows it, for messages. */
  shownWhere: string;
  containerName?: string;
}

export class ToolBus {
  private readonly servers = new Map<string, Connected>();
  private tools: BusTool[] = [];
  private authRoot = "";
  /** Calls that went out to a server so far, and how many of them went to a tool its server does not mark read-only. */
  private sentCalls = 0;
  private sentWrites = 0;

  constructor(private readonly opts: BusOptions) {}

  /** Spawn and handshake with every server. Fails loudly on the first that won't start. */
  async connect(rawSpecs: readonly McpServerSpec[]): Promise<void> {
    const specs = rawSpecs.map((s) => expandSpec(s, process.env));
    const authRoot = this.opts.authRoot ?? resolve(process.cwd(), ".garu", "auth");
    this.authRoot = authRoot;
    for (const [i, spec] of specs.entries()) {
      // Messages show the Garufile as written: a ${VAR} in an arg or URL is a secret, and it would land in the recorder.
      const shown = rawSpecs[i]!;
      const shownWhere = isRemoteServer(shown) ? shown.url : `${shown.command} ${shown.args.join(" ")}`;
      if (isRemoteServer(spec)) {
        // Don't wait for a 401: some servers (Google's) list their tools without a sign-in and refuse
        // only the calls, so the run would start and then fail on every tool.
        if (spec.auth === "oauth" && !signInFor(spec, authRoot).signedIn()) throw new NeedsSignInError(spec.name, shownWhere);
        const client = new Client({ name: "garu", version: "0.1.0" });
        const transport = remoteTransport(spec, authRoot);
        try {
          // The SDK's own Transport type trips exactOptionalPropertyTypes on sessionId; the object is fine.
          await client.connect(transport as unknown as Parameters<Client["connect"]>[0]);
        } catch (e) {
          // The transport's own sign-in error names the expanded URL; say it as the Garufile does.
          if (e instanceof NeedsSignInError) throw new NeedsSignInError(spec.name, shownWhere);
          const msg = (e as Error).message;
          const unauthorized = e instanceof UnauthorizedError || /\b401\b|unauthori[sz]ed/i.test(msg);
          if (unauthorized && spec.auth === "oauth") throw new NeedsSignInError(spec.name, shownWhere);
          if (unauthorized) throw new Error(`tool server "${spec.name}" at ${shownWhere} rejected the credentials (401). Check the headers in its Garufile entry and the ${"$"}{VAR} values in .env, or set auth: oauth and run garu auth.`);
          throw new Error(`tool server "${spec.name}" at ${shownWhere} did not answer: ${msg || (e as Error).name || "connection failed"}`);
        }
        this.servers.set(spec.name, { spec, client, transport, shownWhere });
        continue;
      }
      this.servers.set(spec.name, await this.startLocal(spec, shownWhere, authRoot));
    }
    await this.refreshTools();
  }

  /** Start a local server, plain or in the sandbox. A signed-in one gets a current access token. */
  private async startLocal(spec: StdioServerSpec, shownWhere: string, authRoot: string): Promise<Connected> {
    // A server that signs in gets a current access token, and only that: never the client secret
    // or the refresh token. It goes in through the environment (in a container, passed by name),
    // so it isn't on any command line.
    const signedIn = spec.auth === "oauth" ? { GARU_OAUTH_ACCESS_TOKEN: await localAccessToken(spec, authRoot) } : {};
    const sb = this.opts.sandbox;
    const wrapped = sb ? dockerArgs(spec, sb, this.opts.agent ?? "agent", process.cwd(), Object.keys(signedIn)) : undefined;
    const makeTransport = () => new StdioClientTransport({
      command: wrapped?.command ?? spec.command,
      args: wrapped?.args ?? spec.args,
      // the server's env goes into the process; in a container, docker passes each name on from there (never a value on a command line)
      env: { ...getDefaultEnvironment(), ...spec.env, ...signedIn },
      stderr: "pipe",
      ...(spec.cwd && !wrapped ? { cwd: spec.cwd } : {}),
    });
    // A server that times out starting (npx fetching a package on a cold cache, Docker pulling an
    // image, a busy machine) usually starts fine a moment later. One more try before giving up.
    const MAX = 2;
    let client: Client | undefined;
    let transport = makeTransport();
    for (let attempt = 1; attempt <= MAX; attempt++) {
      const c = new Client({ name: "garu", version: "0.1.0" });
      const connecting = c.connect(transport);
      // The server's stderr is piped. Unread, a chatty one (Python servers log there) fills the pipe
      // and blocks; read it as it comes, and keep the last lines for the "failed to start" message.
      const stderrTail = drainStderr(transport);
      try {
        await connecting;
        client = c;
        break;
      } catch (e) {
        const raw = (e as Error).message + stderrTail.text();
        // Timeouts and a process that died during the handshake are worth one more go; a command that
        // doesn't exist (ENOENT) or Docker refusing are not.
        const transient = /timed out|-32001|ETIMEDOUT|EAGAIN|ECONNRESET|connection closed/i.test(raw) && !/ENOENT/.test(raw);
        if (transient && attempt < MAX) {
          const waitMs = this.opts.startupRetryMs ?? 3000;
          this.opts.recorder.record({ type: "tools.retry", server: spec.name, attempt, maxAttempts: MAX, waitMs, reason: raw.slice(0, 120) });
          await transport.close().catch(() => {});
          await new Promise((r) => setTimeout(r, waitMs));
          transport = makeTransport();
          continue;
        }
        const hint = wrapped ? explainDockerError(raw, sb!.image) : raw;
        throw new Error(
          `tool server "${spec.name}" failed to start${wrapped ? " in sandbox" : ""} (${shownWhere}): ${hint}`,
        );
      }
    }
    return { spec, client: client!, transport, shownWhere, ...(wrapped ? { containerName: wrapped.containerName } : {}) };
  }

  /** A local server that signs in: its access token is Garu's to renew. */
  private signsIn(c: Connected): c is Connected & { spec: StdioServerSpec } {
    return !isRemoteServer(c.spec) && c.spec.auth === "oauth";
  }

  /** Renewals in flight, one per server: the calls of one step go out together, and each would otherwise restart the server. */
  private readonly renewing = new Map<string, Promise<Connected>>();

  /**
   * Renew the sign-in token and restart the server with it. The tools are the same; the token isn't.
   * Callers that arrive while one renewal is under way wait for that one instead of starting their own.
   */
  private renew(server: string, reason: string): Promise<Connected> {
    const pending = this.renewing.get(server);
    if (pending) return pending;
    const p = this.renewNow(server, reason).finally(() => this.renewing.delete(server));
    this.renewing.set(server, p);
    return p;
  }

  private async renewNow(server: string, reason: string): Promise<Connected> {
    const old = this.servers.get(server)!;
    if (!this.signsIn(old)) return old;
    this.opts.recorder.record({ type: "tools.renew", server, reason });
    try {
      await old.client.close();
    } catch {
      /* already gone */
    }
    if (old.containerName) await dockerRmForce(old.containerName);
    const fresh = await this.startLocal(old.spec, old.shownWhere, this.authRoot);
    this.servers.set(server, fresh);
    return fresh;
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
          readOnly: t.annotations?.readOnlyHint === true,
        });
      }
    }
    this.tools = out;
    return out;
  }

  listTools(): readonly BusTool[] {
    return this.tools;
  }

  /**
   * What has gone out to the servers so far: how many calls, and whether every one of them went to a
   * tool its server marks read-only (MCP readOnlyHint). A tool without the mark counts as one that may
   * have changed something, whatever its name suggests. A call the policy blocked, a person declined or
   * that named no tool never went out, so it is not counted; a call that went out and then failed still
   * counts, since a write cut off by a timeout may well have landed.
   */
  sentSoFar(): { calls: number; allReadOnly: boolean } {
    return { calls: this.sentCalls, allReadOnly: this.sentWrites === 0 };
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
      const { approved, by, note } = await this.opts.approver(req, decision, { agent: rec.agent, runId: rec.runId, callId });
      rec.record({ type: "approval.resolved", callId, approved, by, ...(note ? { note } : {}) });
      if (!approved) return { status: "denied", decision, by, callId, ...(note ? { note } : {}) };
    }

    const started = Date.now();
    const timeoutMs = this.opts.callTimeoutMs ?? 60_000;
    const readOnly = this.tools.find((t) => t.qualified === qualified)?.readOnly === true;
    // A call that was cut off: a timeout, or an abort because the machine slept through it. The
    // message says how long it really took, so a model doesn't invent a reason for the gap.
    const cutOff = (text: string) => /aborted|timed out|timeout|no answer/i.test(text);
    const cutOffReason = (text: string) => {
      const s = Math.round((Date.now() - started) / 1000);
      return s > (2 * timeoutMs) / 1000
        ? `${text} (the call was cut off after ${s} s, far past its ${Math.round(timeoutMs / 1000)} s limit: the computer probably slept)`
        : `${text} (the call was cut off after ${s} s)`;
    };
    try {
      // A run can outlive its hour-long access token (the computer slept, or it was just long). The
      // token is renewed and the server restarted before a call when it is about to run out, and once
      // more when Google refuses it anyway, so a stale token never reads as a lost sign-in. A renewal
      // that fails (the issuer unreachable, the sign-in revoked) is this call's error, recorded like any
      // other, not the end of the run.
      let c = this.servers.get(target.server)!;
      if (this.signsIn(c) && signInFor(c.spec, this.authRoot).expiresSoon()) c = await this.renew(target.server, "the access token was about to run out");
      const callOnce = (conn: Connected) => conn.client.callTool({ name: target.tool, arguments: args }, undefined, { timeout: timeoutMs });
      let result: Awaited<ReturnType<typeof callOnce>>;
      this.sentCalls++;
      if (!readOnly) this.sentWrites++;
      try {
        result = await callOnce(c);
      } catch (e) {
        // The SDK's own timeout arrives as an exception. A call that only reads is safe to try once more.
        if (!(readOnly && cutOff((e as Error).message))) throw e;
        rec.record({ type: "tool.retry", callId, reason: cutOffReason((e as Error).message) });
        result = await callOnce(c);
      }
      if (result.isError && this.signsIn(c) && /refused the (access token|sign-in)/i.test(extractText(result.content))) {
        c = await this.renew(target.server, "Google refused the access token");
        result = await callOnce(c);
      }
      if (result.isError && readOnly && cutOff(extractText(result.content))) {
        rec.record({ type: "tool.retry", callId, reason: cutOffReason(extractText(result.content)) });
        result = await callOnce(c);
      }
      const durationMs = Date.now() - started;
      if (result.isError) {
        const text = extractText(result.content) || "tool reported an error";
        const error = cutOff(text) ? cutOffReason(text) : text;
        rec.record({ type: "tool.result", callId, ok: false, durationMs, error });
        return { status: "error", error, callId };
      }
      rec.record({ type: "tool.result", callId, ok: true, durationMs, result: result.content });
      return { status: "ok", result: result.content, callId };
    } catch (e) {
      const text = (e as Error).message;
      const error = cutOff(text) ? cutOffReason(text) : text;
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

/** Keeps a child's stderr flowing and remembers its last 4 KB, formatted for an error message. */
function drainStderr(transport: StdioClientTransport): { text: () => string } {
  let tail = "";
  transport.stderr?.on("data", (chunk: Buffer) => { tail = (tail + chunk.toString("utf8")).slice(-4096); });
  return { text: () => (tail.trim() ? `\n  it said: ${tail.trim().split("\n").slice(-6).join("\n  ")}` : "") };
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
  if (isRemoteServer(spec)) {
    return {
      ...spec,
      url: expand(spec.url, "the url"),
      headers: Object.fromEntries(Object.entries(spec.headers).map(([k, v]) => [k, expand(v, `header ${k}`)])),
      ...(spec.oauth
        ? {
            oauth: {
              ...spec.oauth,
              clientId: expand(spec.oauth.clientId, "oauth.clientId"),
              ...(spec.oauth.clientSecret !== undefined ? { clientSecret: expand(spec.oauth.clientSecret, "oauth.clientSecret") } : {}),
            },
          }
        : {}),
    };
  }
  return {
    ...spec,
    args: spec.args.map((a) => expand(a, "an argument")),
    env: Object.fromEntries(Object.entries(spec.env).map(([k, v]) => [k, expand(v, `env ${k}`)])),
    ...(spec.oauth
      ? {
          oauth: {
            ...spec.oauth,
            clientId: expand(spec.oauth.clientId, "oauth.clientId"),
            ...(spec.oauth.clientSecret !== undefined ? { clientSecret: expand(spec.oauth.clientSecret, "oauth.clientSecret") } : {}),
          },
        }
      : {}),
  };
}

/** Every ${VAR} an agent's tool servers need that is not set. Empty means it can run. */
export function missingEnv(tools: readonly McpServerSpec[], env: NodeJS.ProcessEnv): string[] {
  const out = new Set<string>();
  const scan = (s: string) => {
    for (const m of s.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/g)) {
      const v = env[m[1]!];
      if (v === undefined || v === "") out.add(m[1]!);
    }
  };
  for (const t of tools) {
    if (isRemoteServer(t)) {
      scan(t.url);
      Object.values(t.headers).forEach(scan);
      if (t.oauth) { scan(t.oauth.clientId); if (t.oauth.clientSecret !== undefined) scan(t.oauth.clientSecret); }
    }
    else {
      t.args.forEach(scan);
      Object.values(t.env).forEach(scan);
      if (t.oauth) { scan(t.oauth.clientId); if (t.oauth.clientSecret !== undefined) scan(t.oauth.clientSecret); }
    }
  }
  return [...out].sort();
}

/**
 * Build the Streamable HTTP transport for a remote server. During a run the
 * provider has no way to open a browser, so a server that demands sign-in
 * fails with NeedsSignInError and the fix is one command: garu auth.
 */
export function remoteTransport(
  spec: Extract<McpServerSpec, { url: string }>,
  authRoot: string,
  oauth?: { redirectUrl: string; onAuthorize: (url: URL) => void | Promise<void> },
): StreamableHTTPClientTransport {
  const headers = Object.keys(spec.headers).length ? { headers: spec.headers } : {};
  const authProvider =
    spec.auth === "oauth"
      ? new FileOAuthProvider({
          root: authRoot,
          server: spec.name,
          url: spec.url,
          ...(spec.oauth ? { client: spec.oauth } : {}),
          ...(oauth ? { redirectUrl: oauth.redirectUrl, onAuthorize: oauth.onAuthorize } : {}),
        })
      : undefined;
  return new StreamableHTTPClientTransport(new URL(spec.url), {
    ...(Object.keys(headers).length ? { requestInit: headers } : {}),
    ...(authProvider ? { authProvider } : {}),
  });
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
