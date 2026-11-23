import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServerSpec } from "./garufile.js";
import { signInFor } from "./oauth.js";
import { SignInBusyError, startSignIn } from "./signin.js";

/** An issuer that discovers, hands out a code exchange, and counts the exchanges. */
function startIssuer(): Promise<{ url: string; exchanges: () => number; close: () => Promise<void> }> {
  let exchanges = 0;
  const http: Server = createServer((req, res) => {
    const base = `http://${req.headers.host}`;
    const json = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.url?.startsWith("/.well-known/")) {
      return json(200, { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["client_secret_post"] });
    }
    if (req.url === "/token" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const form = new URLSearchParams(body);
        if (form.get("grant_type") !== "authorization_code" || form.get("code") !== "ok-code") return json(400, { error: "invalid_grant" });
        exchanges++;
        json(200, { access_token: `at-${exchanges}`, refresh_token: "rt", expires_in: 3599, token_type: "Bearer" });
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    http.listen(0, "127.0.0.1", () => {
      const port = (http.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, exchanges: () => exchanges, close: () => new Promise((r) => http.close(() => r())) });
    });
  });
}

const freePort = () => new Promise<number>((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

const spec = (issuer: string): McpServerSpec => ({
  name: "gmail", command: "node", args: ["-e", "0"], env: {}, auth: "oauth",
  oauth: { clientId: "id-1", clientSecret: "secret-1", scopes: ["https://www.googleapis.com/auth/gmail.readonly"], authorizationParams: { prompt: "consent" }, issuer },
});

let issuer: Awaited<ReturnType<typeof startIssuer>>;
beforeAll(async () => { issuer = await startIssuer(); });
afterAll(async () => { await issuer.close(); });

describe("the sign-in flow", () => {
  it("hands out the authorization URL, and the browser's return saves the tokens", async () => {
    const root = mkdtempSync(join(tmpdir(), "garu-signin-"));
    const port = await freePort();
    const s = spec(issuer.url);
    // An old sign-in is replaced, not refreshed.
    signInFor(s, root).saveTokens({ access_token: "old", refresh_token: "old-r", token_type: "bearer" });
    const flow = await startSignIn(s, root, { port });
    expect(flow.url.origin).toBe(issuer.url);
    expect(flow.url.searchParams.get("redirect_uri")).toBe(`http://127.0.0.1:${port}/callback`);
    expect(flow.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(flow.url.searchParams.get("prompt")).toBe("consent");
    // The same port is taken while it waits.
    await expect(startSignIn(s, root, { port })).rejects.toBeInstanceOf(SignInBusyError);
    const back = await fetch(`http://127.0.0.1:${port}/callback?code=ok-code`);
    expect(back.status).toBe(200);
    expect(await back.text()).toContain("Signed in");
    await flow.done;
    expect(issuer.exchanges()).toBe(1);
    const p = signInFor(s, root);
    expect(p.signedIn()).toBe(true);
    expect(p.tokens()?.access_token).toBe("at-1");
    expect(p.signedInAt()!.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it("a refusal from the issuer, a cancel and a server that doesn't sign in are errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "garu-signin-"));
    const port = await freePort();
    const s = spec(issuer.url);
    const flow = await startSignIn(s, root, { port });
    const back = await fetch(`http://127.0.0.1:${port}/callback?error=access_denied&error_description=no`);
    expect(await back.text()).toContain("Sign-in failed");
    await expect(flow.done).rejects.toThrow(/access_denied/);
    expect(signInFor(s, root).signedIn()).toBe(false);

    const again = await startSignIn(s, root, { port });
    again.cancel();
    await expect(again.done).rejects.toThrow(/cancelled/);

    await expect(startSignIn({ ...s, auth: undefined, oauth: undefined } as McpServerSpec, root, { port })).rejects.toThrow(/doesn't sign in/);
    await expect(startSignIn(s, root, { port, timeoutMs: 50 }).then((f) => f.done)).rejects.toThrow(/timed out/);
  });
});
