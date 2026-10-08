import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ToolBus, expandSpec } from "./bus.js";
import { parseGarufile } from "./garufile.js";
import { FileOAuthProvider, NeedsSignInError, authFileFor } from "./oauth.js";
import { PolicyEngine } from "./policy.js";
import { Recorder } from "./recorder.js";

/** A tiny remote MCP server: one tool that reports the Authorization header it was called with. */
function startRemote(requireBearer?: string): Promise<{ url: string; close: () => Promise<void> }> {
  let lastAuth: string | undefined;
  // Stateless mode: a fresh server + transport per request, as the SDK recommends.
  const build = () => {
    const mcp = new McpServer({ name: "remote-echo", version: "0.0.1" });
    mcp.registerTool("whoami", { description: "echo the caller's auth header", inputSchema: {} }, async () => ({
      content: [{ type: "text", text: `auth=${lastAuth ?? "none"}` }],
    }));
    mcp.registerTool("add", { description: "add", inputSchema: { a: z.number(), b: z.number() } }, async ({ a, b }) => ({
      content: [{ type: "text", text: String(a + b) }],
    }));
    return mcp;
  };
  const http: Server = createServer(async (req, res) => {
    lastAuth = req.headers["authorization"];
    const base = `http://${req.headers.host}`;
    const json = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    // Just enough OAuth discovery for the SDK to reach the "open a browser" step.
    if (req.url?.startsWith("/.well-known/oauth-protected-resource")) return json(200, { resource: `${base}/mcp`, authorization_servers: [base] });
    if (req.url?.startsWith("/.well-known/oauth-authorization-server") || req.url?.startsWith("/.well-known/openid-configuration")) {
      return json(200, { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] });
    }
    if (req.url === "/register" && req.method === "POST") return json(201, { client_id: "test-client", redirect_uris: ["http://127.0.0.1:1/callback"], token_endpoint_auth_method: "none" });
    if (requireBearer && lastAuth !== `Bearer ${requireBearer}`) {
      res.writeHead(401, { "www-authenticate": `Bearer realm="test", error="invalid_token", resource_metadata="${base}/.well-known/oauth-protected-resource"`, "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_token", error_description: "sign in" }));
      return;
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => void transport.close());
    await build().connect(transport);
    await transport.handleRequest(req, res);
  });
  return new Promise((resolve) => {
    http.listen(0, "127.0.0.1", () => {
      const port = (http.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}/mcp`, close: () => new Promise((r) => http.close(() => r())) });
    });
  });
}

const policy = new PolicyEngine([{ tool: "*", action: "allow" }]);
const rec = () => new Recorder({ root: mkdtempSync(join(tmpdir(), "garu-remote-")), agent: "t" });

describe("remote MCP servers over Streamable HTTP", () => {
  let open: Awaited<ReturnType<typeof startRemote>>;
  let locked: Awaited<ReturnType<typeof startRemote>>;
  beforeAll(async () => {
    open = await startRemote();
    locked = await startRemote("s3cret");
  });
  afterAll(async () => {
    await open.close();
    await locked.close();
  });

  it("parses a url spec and rejects a mixed or insecure one", () => {
    const g = parseGarufile(`name: r\nmodel: fake/x\nprompt: p\ntools:\n  - name: gh\n    url: https://api.example.com/mcp\n    headers: { Authorization: "Bearer \${TOKEN}" }\n`);
    expect(g.tools[0]).toMatchObject({ name: "gh", url: "https://api.example.com/mcp", auth: "none" });
    expect(() => parseGarufile(`name: r\nmodel: fake/x\nprompt: p\ntools:\n  - name: gh\n    url: http://api.example.com/mcp\n`)).toThrow(/https/);
    expect(() => parseGarufile(`name: r\nmodel: fake/x\nprompt: p\ntools:\n  - name: gh\n    url: https://a.b/mcp\n    command: node\n`)).toThrow();
  });

  it("connects, lists tools under <server>.<tool>, and calls them", async () => {
    const bus = new ToolBus({ policy, recorder: rec(), approver: async () => ({ approved: true, by: "t" }) });
    await bus.connect([{ name: "remote", url: open.url, headers: {}, auth: "none" }]);
    const names = bus.listTools().map((t) => t.qualified).sort();
    expect(names).toEqual(["remote.add", "remote.whoami"]);
    const out = await bus.call("remote.add", { a: 2, b: 3 });
    expect(out.status).toBe("ok");
    expect(JSON.stringify(out)).toContain('"5"');
    await bus.close();
  });

  it("sends static headers, with ${VAR} filled from the environment", async () => {
    const spec = expandSpec({ name: "remote", url: locked.url, headers: { Authorization: "Bearer ${REMOTE_TEST_TOKEN}" }, auth: "none" }, { REMOTE_TEST_TOKEN: "s3cret" });
    const bus = new ToolBus({ policy, recorder: rec(), approver: async () => ({ approved: true, by: "t" }) });
    await bus.connect([spec]);
    const out = await bus.call("remote.whoami", {});
    expect(JSON.stringify(out)).toContain("auth=Bearer s3cret");
    await bus.close();
    expect(() => expandSpec({ name: "remote", url: locked.url, headers: { Authorization: "Bearer ${MISSING_TOKEN}" }, auth: "none" }, {})).toThrow(/MISSING_TOKEN.*not set/);
  });

  it("a 401 without a sign-in becomes one clear instruction", async () => {
    const bus = new ToolBus({ policy, recorder: rec(), approver: async () => ({ approved: true, by: "t" }), authRoot: mkdtempSync(join(tmpdir(), "garu-auth-")) });
    await expect(bus.connect([{ name: "locked", url: locked.url, headers: {}, auth: "oauth" }])).rejects.toThrow(/garu auth <Garufile> locked/);
  });
});

describe("FileOAuthProvider", () => {
  it("keeps client info, tokens and the PKCE verifier in one file per server url", () => {
    const root = mkdtempSync(join(tmpdir(), "garu-auth-"));
    const p = new FileOAuthProvider({ root, server: "linear", url: "https://mcp.example.com/mcp" });
    expect(p.signedIn()).toBe(false);
    expect(p.tokens()).toBeUndefined();
    p.saveClientInformation({ client_id: "abc" });
    p.saveCodeVerifier("verifier-1");
    p.saveTokens({ access_token: "at", token_type: "bearer", refresh_token: "rt" });
    const again = new FileOAuthProvider({ root, server: "linear", url: "https://mcp.example.com/mcp" });
    expect(again.clientInformation()).toEqual({ client_id: "abc" });
    expect(again.codeVerifier()).toBe("verifier-1");
    expect(again.tokens()?.refresh_token).toBe("rt");
    expect(again.signedIn()).toBe(true);
    expect(authFileFor(root, "https://mcp.example.com/mcp")).toBe(authFileFor(root, "https://mcp.example.com/mcp"));
    expect(authFileFor(root, "https://other.example.com/mcp")).not.toBe(authFileFor(root, "https://mcp.example.com/mcp"));
    again.forget();
    expect(new FileOAuthProvider({ root, server: "linear", url: "https://mcp.example.com/mcp" }).signedIn()).toBe(false);
  });

  it("refuses to open a browser during an unattended run", async () => {
    const p = new FileOAuthProvider({ root: mkdtempSync(join(tmpdir(), "garu-auth-")), server: "linear", url: "https://mcp.example.com/mcp" });
    await expect(p.redirectToAuthorization(new URL("https://auth.example.com/authorize"))).rejects.toBeInstanceOf(NeedsSignInError);
    const seen: string[] = [];
    const interactive = new FileOAuthProvider({ root: mkdtempSync(join(tmpdir(), "garu-auth-")), server: "linear", url: "https://mcp.example.com/mcp", redirectUrl: "http://127.0.0.1:1234/callback", onAuthorize: (u) => void seen.push(u.href) });
    await interactive.redirectToAuthorization(new URL("https://auth.example.com/authorize?x=1"));
    expect(seen).toEqual(["https://auth.example.com/authorize?x=1"]);
    expect(interactive.clientMetadata.redirect_uris).toEqual(["http://127.0.0.1:1234/callback"]);
    expect(p.redirectUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  });
});

describe("missingEnv", () => {
  it("lists every unset ${VAR} across local and remote servers, once, sorted", async () => {
    const { missingEnv } = await import("./bus.js");
    const tools = [
      { name: "web", command: "node", args: ["x.js", "${A}"], env: { W: "${B}", X: "${B}" } },
      { name: "gh", url: "https://h/${C}", headers: { Authorization: "Bearer ${A}" }, auth: "none" as const },
    ];
    expect(missingEnv(tools, { B: "set" })).toEqual(["A", "C"]);
    expect(missingEnv(tools, { A: "1", B: "2", C: "3" })).toEqual([]);
    expect(missingEnv(tools, { A: "", B: "2", C: "3" })).toEqual(["A"]);
  });
});
