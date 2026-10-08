/**
 * Who may talk to the control room.
 *
 * The rule is simple: a browser on the same computer, talking straight to
 * the server, is you. Anything else — a phone over Tailscale, a laptop on
 * the LAN, a request that came through a proxy — needs the token in
 * `.garu/ui-token`. The token travels as a cookie (set once by visiting
 * `/?token=…` or by signing in), or as `Authorization: Bearer` for apps.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { dirname } from "node:path";

export const SESSION_COOKIE = "garu_session";

/** Read the token, or make one. 32 random bytes, file readable by you only. */
export function loadOrCreateToken(path: string): string {
  if (existsSync(path)) {
    const t = readFileSync(path, "utf8").trim();
    if (/^[A-Za-z0-9_-]{32,}$/.test(t)) return t;
  }
  const t = randomBytes(32).toString("base64url");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${t}\n`, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* windows */ }
  return t;
}

/** Headers a reverse proxy or tunnel adds. Their presence means the loopback address is the proxy, not the person. */
const FORWARDED = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "forwarded", "x-real-ip", "tailscale-user-login", "cf-connecting-ip"];

export interface RequestLike {
  headers: IncomingMessage["headers"];
  socket: { remoteAddress?: string | undefined };
  method?: string | undefined;
}

/** True when the request came from a browser on this computer, directly, addressed to localhost. */
export function isDirectLoopback(req: RequestLike): boolean {
  const addr = req.socket.remoteAddress ?? "";
  if (!(addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1")) return false;
  if (FORWARDED.some((h) => h in req.headers)) return false;
  const host = (req.headers.host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** The token the request carries, if any: cookie, bearer header, or `?token=`. */
export function presentedToken(req: RequestLike, url: URL): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (cookie) return cookie;
  return url.searchParams.get("token");
}

export function tokensMatch(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

export type AuthResult = "ok" | "none" | "bad";

/** `requireLogin` makes even the local browser sign in. */
export function authenticate(req: RequestLike, url: URL, token: string, requireLogin = false): AuthResult {
  if (!requireLogin && isDirectLoopback(req)) return "ok";
  const t = presentedToken(req, url);
  if (!t) return "none";
  return tokensMatch(t, token) ? "ok" : "bad";
}

export function isHttps(req: RequestLike): boolean {
  return (req.headers["x-forwarded-proto"] ?? "").toString().split(",")[0]!.trim() === "https";
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure ? "; Secure" : ""}`;
}
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * A write (POST) that a browser says came from another site. Browsers send
 * Sec-Fetch-Site on every request; refusing cross-site writes stops a web
 * page you happen to have open from approving things on your behalf.
 */
export function isCrossSiteWrite(req: RequestLike): boolean {
  if (req.method === "GET" || req.method === "HEAD") return false;
  const site = req.headers["sec-fetch-site"];
  return site !== undefined && site !== "same-origin" && site !== "none";
}
