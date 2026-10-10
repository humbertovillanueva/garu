import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ToolBus, missingEnv } from "./bus.js";
import { StdioServerSpec, parseGarufile, type McpServerSpec } from "./garufile.js";
import { NeedsSignInError, authFileFor, localAccessToken, signInFor } from "./oauth.js";
import { PolicyEngine } from "./policy.js";
import { Recorder } from "./recorder.js";
import { dockerArgs } from "./sandbox.js";

const here = dirname(fileURLToPath(import.meta.url));
const tokenServer = join(here, "testing", "token-server.mjs");
const root = () => mkdtempSync(join(tmpdir(), "garu-auth-"));

/** A tiny authorization server: discovery plus a token endpoint that refreshes, or refuses to. */
function startIssuer(): Promise<{ url: string; refuse: (yes: boolean) => void; refreshes: () => number; close: () => Promise<void> }> {
  let refuse = false;
  let refreshes = 0;
  const http: Server = createServer((req, res) => {
    const base = `http://${req.headers.host}`;
    const json = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.url?.startsWith("/.well-known/oauth-authorization-server") || req.url?.startsWith("/.well-known/openid-configuration")) {
      return json(200, { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["client_secret_post"] });
    }
    if (req.url === "/token" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const form = new URLSearchParams(body);
        if (form.get("grant_type") !== "refresh_token") return json(400, { error: "unsupported_grant_type" });
        if (refuse) return json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        refreshes++;
        json(200, { access_token: `fresh-${refreshes}`, expires_in: 3599, token_type: "Bearer", scope: "https://www.googleapis.com/auth/gmail.readonly" });
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    http.listen(0, "127.0.0.1", () => {
      const port = (http.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, refuse: (y) => (refuse = y), refreshes: () => refreshes, close: () => new Promise((r) => http.close(() => r())) });
    });
  });
}

const local = (issuer: string, scopes: string[]): Extract<McpServerSpec, { command: string }> => ({
  name: "gmail",
  command: "node",
  args: [tokenServer],
  env: {},
  auth: "oauth",
  oauth: { clientId: "id-1", clientSecret: "secret-1", scopes, authorizationParams: {}, issuer },
});
const readonly = ["https://www.googleapis.com/auth/gmail.readonly"];
const drafting = ["https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.readonly"];

describe("Garufile: a local server that signs in", () => {
  const base = `name: t\nmodel: fake/x\nprompt: p\ntools:\n  - name: gmail\n    command: node\n    args: ["x.js", "gmail"]\n`;

  it("parses auth: oauth with an issuer, and needs the issuer", () => {
    const g = parseGarufile(`${base}    auth: oauth\n    oauth:\n      issuer: https://accounts.google.com\n      clientId: \${GOOGLE_CLIENT_ID}\n      scopes: [https://www.googleapis.com/auth/gmail.readonly]\n`);
    expect(g.tools[0]).toMatchObject({ auth: "oauth", oauth: { issuer: "https://accounts.google.com" } });
    expect(() => parseGarufile(`${base}    auth: oauth\n    oauth:\n      clientId: x\n`)).toThrow(/issuer/);
    expect(() => parseGarufile(`${base}    auth: oauth\n`)).toThrow(/issuer/);
    expect(() => parseGarufile(`${base}    oauth:\n      issuer: https://accounts.google.com\n      clientId: x\n`)).toThrow(/auth: oauth/);
    expect(() => parseGarufile(`${base}    auth: oauth\n    oauth:\n      issuer: http://accounts.google.com\n      clientId: x\n`)).toThrow(/https/);
  });

  it("leaves a plain local server exactly as before", () => {
    expect(StdioServerSpec.parse({ name: "fs", command: "npx" })).toEqual({ name: "fs", command: "npx", args: [], env: {} });
  });

  it("counts the oauth client's ${VAR}s as needed", () => {
    const spec = { ...local("https://accounts.google.com", readonly), oauth: { clientId: "${GOOGLE_CLIENT_ID}", clientSecret: "${GOOGLE_CLIENT_SECRET}", authorizationParams: {}, issuer: "https://accounts.google.com" } };
    expect(missingEnv([spec], {})).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  });
});

describe("signInFor", () => {
  it("files a local sign-in by issuer and permissions, so read-only and drafting don't share", () => {
    const r = root();
    const a = signInFor(local("https://accounts.google.com", readonly), r);
    a.saveTokens({ access_token: "ro", token_type: "Bearer" });
    expect(signInFor(local("https://accounts.google.com", [...readonly]), r).tokens()?.access_token).toBe("ro");
    expect(signInFor(local("https://accounts.google.com", drafting), r).signedIn()).toBe(false);
    expect(signInFor(local("https://accounts.google.com", [...drafting].reverse()), r).signedIn()).toBe(false);
  });

  it("keeps remote sign-ins where they were (by URL)", () => {
    const r = root();
    const url = "https://calendarmcp.googleapis.com/mcp/v1";
    signInFor({ name: "calendar", url, headers: {}, auth: "oauth" }, r).saveTokens({ access_token: "x", token_type: "Bearer" });
    expect(authFileFor(r, url)).toBe(authFileFor(r, `${url}`));
    expect(signInFor({ name: "other-name", url, headers: {}, auth: "oauth" }, r).signedIn()).toBe(true);
  });
});

describe("localAccessToken", () => {
  let issuer: Awaited<ReturnType<typeof startIssuer>>;
  beforeAll(async () => { issuer = await startIssuer(); });
  afterAll(async () => { await issuer.close(); });

  it("without a sign-in, says to sign in", async () => {
    await expect(localAccessToken(local(issuer.url, readonly), root())).rejects.toBeInstanceOf(NeedsSignInError);
  });

  it("hands out a current token without asking anyone", async () => {
    const r = root();
    signInFor(local(issuer.url, readonly), r).saveTokens({ access_token: "current", token_type: "Bearer", expires_in: 3599, refresh_token: "rt" });
    const before = issuer.refreshes();
    expect(await localAccessToken(local(issuer.url, readonly), r)).toBe("current");
    expect(issuer.refreshes()).toBe(before);
  });

  it("renews a token that's about to run out, and keeps the refresh token", async () => {
    const r = root();
    signInFor(local(issuer.url, readonly), r).saveTokens({ access_token: "old", token_type: "Bearer", expires_in: 60, refresh_token: "rt-keep" });
    const token = await localAccessToken(local(issuer.url, readonly), r);
    expect(token).toMatch(/^fresh-/);
    const saved = signInFor(local(issuer.url, readonly), r);
    expect(saved.tokens()?.refresh_token).toBe("rt-keep");
    expect(saved.expiresSoon()).toBe(false);
  });

  it("a refused renewal (expired or revoked) clears the sign-in and says to sign in again", async () => {
    const r = root();
    signInFor(local(issuer.url, readonly), r).saveTokens({ access_token: "old", token_type: "Bearer", expires_in: 60, refresh_token: "revoked" });
    issuer.refuse(true);
    try {
      await expect(localAccessToken(local(issuer.url, readonly), r)).rejects.toBeInstanceOf(NeedsSignInError);
      expect(signInFor(local(issuer.url, readonly), r).signedIn()).toBe(false);
    } finally {
      issuer.refuse(false);
    }
  });
});

describe("ToolBus with a local server that signs in", () => {
  const policy = new PolicyEngine([{ tool: "*", action: "allow" }]);
  const rec = () => new Recorder({ root: mkdtempSync(join(tmpdir(), "garu-local-")), agent: "t" });

  it("starts it with the access token in its environment, and nothing else of the sign-in", async () => {
    const r = root();
    const spec = local("https://accounts.google.com", readonly);
    signInFor(spec, r).saveTokens({ access_token: "tok-123", token_type: "Bearer", expires_in: 3599, refresh_token: "never-handed-out" });
    const bus = new ToolBus({ policy, recorder: rec(), approver: async () => ({ approved: true, by: "t" }), authRoot: r });
    await bus.connect([spec]);
    const out = await bus.call("gmail.whoami", {});
    expect(JSON.stringify(out)).toContain("token=tok-123");
    expect(JSON.stringify(out)).not.toContain("never-handed-out");
    await bus.close();
  }, 30_000);

  it("won't start it without a sign-in", async () => {
    const bus = new ToolBus({ policy, recorder: rec(), approver: async () => ({ approved: true, by: "t" }), authRoot: root() });
    await expect(bus.connect([local("https://accounts.google.com", readonly)])).rejects.toBeInstanceOf(NeedsSignInError);
  });

  it("in a sandbox, passes the token by name so it never shows on docker's command line", () => {
    const sb = { image: "node:22-alpine", network: "none", memory: "512m", cpus: 1, mounts: [] } as unknown as Parameters<typeof dockerArgs>[1];
    const { args } = dockerArgs({ name: "gmail", command: "node", args: ["x.js"], env: {} }, sb, "bea", "/repo", ["GARU_OAUTH_ACCESS_TOKEN"]);
    const i = args.indexOf("GARU_OAUTH_ACCESS_TOKEN");
    expect(args[i - 1]).toBe("-e");
    expect(args.some((a) => a.startsWith("GARU_OAUTH_ACCESS_TOKEN="))).toBe(false);
  });
});
