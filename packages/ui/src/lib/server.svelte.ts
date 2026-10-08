/**
 * Which control room this page talks to.
 *
 * In the browser it is always the one that served the page, so `base` is "".
 * In the Garu app (a webview on the phone) the page comes from the app itself
 * and the control room is on your computer: the app remembers its address and
 * token after you pair by scanning the code in Settings → Your phone.
 */
export const isApp = import.meta.env["VITE_GARU_APP"] === "1";
/** version · commit · build time, stamped at build. */
export const build = (import.meta.env["VITE_GARU_BUILD"] as string | undefined) ?? "dev";

const KEY = "garu.server";

function load(): { base: string; token: string } {
  if (!isApp) return { base: "", token: "" };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as { base?: string; token?: string };
      if (typeof v.base === "string" && typeof v.token === "string") return { base: v.base, token: v.token };
    }
  } catch { /* fresh install */ }
  return { base: "", token: "" };
}

export const server = $state(load());

export const paired = () => !isApp || Boolean(server.base && server.token);

export function remember(base: string, token: string): void {
  server.base = base.replace(/\/+$/, "");
  server.token = token;
  try { localStorage.setItem(KEY, JSON.stringify({ base: server.base, token })); } catch { /* storage off */ }
}

export function forget(): void {
  server.base = ""; server.token = "";
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Turn what a scan or a paste gives us into an address and a token. Accepts the sign-in link, or "address token". */
export function parsePairing(input: string): { base: string; token: string } | null {
  const text = input.trim();
  const m = /^(https?:\/\/[^\s/?#]+)[^\s?#]*\?(?:[^\s#&]*&)?token=([A-Za-z0-9_-]{32,})/.exec(text);
  if (m) return { base: m[1]!, token: m[2]! };
  const parts = text.split(/\s+/);
  if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    const [addr, tok] = /^[A-Za-z0-9_-]{32,}$/.test(b) ? [a, b] : [b, a];
    if (!/^[A-Za-z0-9_-]{32,}$/.test(tok)) return null;
    const base = /^https?:\/\//.test(addr) ? addr : `https://${addr}`;
    try { return { base: new URL(base).origin, token: tok }; } catch { return null; }
  }
  return null;
}
