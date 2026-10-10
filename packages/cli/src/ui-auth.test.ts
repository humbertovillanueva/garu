import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authenticate, isCrossSiteWrite, isDirectLoopback, loadOrCreateToken, parseCookies, sessionCookie } from "./ui-auth.js";

const TOKEN = "a".repeat(43);
const req = (headers: Record<string, string> = {}, addr = "127.0.0.1", method = "GET") => ({ headers: { host: "localhost:4000", ...headers }, socket: { remoteAddress: addr }, method });
const url = (s = "/api/agents") => new URL(s, "http://localhost:4000");

describe("control room auth", () => {
  it("makes a token once and keeps it private", () => {
    const dir = mkdtempSync(join(tmpdir(), "garu-auth-"));
    const p = join(dir, "ui-token");
    const t = loadOrCreateToken(p);
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(loadOrCreateToken(p)).toBe(t);
    expect(readFileSync(p, "utf8").trim()).toBe(t);
    if (process.platform !== "win32") expect(statSync(p).mode & 0o777).toBe(0o600);
  });

  it("trusts a browser on this computer talking straight to localhost", () => {
    expect(isDirectLoopback(req())).toBe(true);
    expect(authenticate(req(), url(), TOKEN)).toBe("ok");
  });

  it("does not trust loopback when a proxy or tunnel is in front", () => {
    expect(isDirectLoopback(req({ "x-forwarded-for": "100.64.0.9" }))).toBe(false);
    expect(isDirectLoopback(req({ "tailscale-user-login": "h@x" }))).toBe(false);
    expect(authenticate(req({ "x-forwarded-for": "100.64.0.9" }), url(), TOKEN)).toBe("none");
  });

  it("does not trust loopback addressed by another hostname (DNS rebinding)", () => {
    expect(isDirectLoopback(req({ host: "evil.example:4000" }))).toBe(false);
  });

  it("needs the token from anywhere else, via cookie, bearer or link", () => {
    const lan = (h: Record<string, string> = {}) => req(h, "192.168.1.20");
    expect(authenticate(lan(), url(), TOKEN)).toBe("none");
    expect(authenticate(lan({ cookie: `garu_session=${TOKEN}` }), url(), TOKEN)).toBe("ok");
    expect(authenticate(lan({ cookie: `garu_session=${"b".repeat(43)}` }), url(), TOKEN)).toBe("bad");
    expect(authenticate(lan({ authorization: `Bearer ${TOKEN}` }), url(), TOKEN)).toBe("ok");
    expect(authenticate(lan(), url(`/?token=${TOKEN}`), TOKEN)).toBe("ok");
    expect(authenticate(lan(), url(`/?token=nope`), TOKEN)).toBe("bad");
  });

  it("can require login even on this computer", () => {
    expect(authenticate(req(), url(), TOKEN, true)).toBe("none");
  });

  it("an explicit wrong token is wrong even from this computer; a stale local cookie is forgiven", () => {
    expect(authenticate(req({ authorization: "Bearer nope" }), url(), TOKEN)).toBe("bad");
    expect(authenticate(req(), url("/api/agents?token=nope"), TOKEN)).toBe("bad");
    expect(authenticate(req({ cookie: "garu_session=stale" }), url(), TOKEN)).toBe("ok");
    expect(authenticate(req({ cookie: "garu_session=stale" }, "192.168.1.20"), url(), TOKEN)).toBe("bad");
  });

  it("refuses writes a browser marks as cross-site", () => {
    expect(isCrossSiteWrite(req({ "sec-fetch-site": "cross-site" }, "127.0.0.1", "POST"))).toBe(true);
    expect(isCrossSiteWrite(req({ "sec-fetch-site": "same-origin" }, "127.0.0.1", "POST"))).toBe(false);
    expect(isCrossSiteWrite(req({}, "127.0.0.1", "POST"))).toBe(false);
    expect(isCrossSiteWrite(req({ "sec-fetch-site": "cross-site" }, "127.0.0.1", "GET"))).toBe(false);
  });

  it("formats cookies", () => {
    expect(parseCookies("a=1; garu_session=xyz")).toEqual({ a: "1", garu_session: "xyz" });
    expect(sessionCookie("t", true)).toContain("Secure");
    expect(sessionCookie("t", false)).not.toContain("Secure");
  });
});

describe("rotating the token", () => {
  it("writes a different token to the same file", async () => {
    const { rotateToken } = await import("./ui-auth.js");
    const dir = mkdtempSync(join(tmpdir(), "garu-auth-"));
    const p = join(dir, "ui-token");
    const a = loadOrCreateToken(p);
    const b = rotateToken(p);
    expect(b).not.toBe(a);
    expect(loadOrCreateToken(p)).toBe(b);
  });
});

describe("the app's origin", () => {
  it("gets CORS headers; other origins get none", async () => {
    const { corsHeaders } = await import("./ui-auth.js");
    expect(corsHeaders(req({ origin: "https://localhost" }))["access-control-allow-origin"]).toBe("https://localhost");
    expect(corsHeaders(req({ origin: "capacitor://localhost" }))["access-control-allow-origin"]).toBe("capacitor://localhost");
    expect(corsHeaders(req({ origin: "http://localhost:5173" }))["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(corsHeaders(req({ origin: "https://evil.example" }))).toEqual({});
    expect(corsHeaders(req({ origin: "https://localhost.evil.example" }))).toEqual({});
    expect(corsHeaders(req())).toEqual({});
  });
  it("a bearer-authenticated write is not a cross-site write", () => {
    expect(isCrossSiteWrite(req({ "sec-fetch-site": "cross-site", authorization: `Bearer ${TOKEN}` }, "100.64.0.9", "POST"))).toBe(false);
    expect(isCrossSiteWrite(req({ "sec-fetch-site": "cross-site" }, "100.64.0.9", "POST"))).toBe(true);
  });
});

import { redactLogLine } from "./ui-server.js";
describe("redactLogLine", () => {
  it("keeps hosts and run ids, masks URL paths and anything key-shaped", () => {
    expect(redactLogLine("POST https://hooks.slack.com/services/T000/B000/XXXXYYYYZZZZ failed")).toBe("POST https://hooks.slack.com/… failed");
    expect(redactLogLine("token aNUBC4xzRckRCiuU8tWYtcwR8pQRAVPUAe5ZOM9Wo2U refused")).toBe("token … refused");
    expect(redactLogLine("■ tomay: ok — 20261010-045324-4dbd6e18")).toBe("■ tomay: ok — 20261010-045324-4dbd6e18");
    expect(redactLogLine("04:53:24 ↺ rook: missed 10:00:00 PM (cron 0 * * * *), catching up")).toBe("04:53:24 ↺ rook: missed 10:00:00 PM (cron 0 * * * *), catching up");
  });
});
