/**
 * The two shapes of a pairing link, and how to read them back.
 *
 * The sign-in link, `https://<host>/?token=…`, is what the control room has always
 * put in its code: any phone's camera opens it in the browser, signed in, and the
 * Android app scans it itself. The app link, `garu://pair?base=…&token=…`, is for
 * the iPhone: its web view can't scan, and a camera scan of the https link lands in
 * Safari. A custom scheme is the one thing the iPhone's camera hands to the app
 * instead, so the pairing panel can switch its code to this shape.
 *
 * Nothing in here touches the screen or the network, so it can be tested as is.
 */

const TOKEN = /^[A-Za-z0-9_-]{32,}$/;

/** The scheme the phone apps register; the whole link is `garu://pair?base=<address>&token=<token>`. */
export const APP_SCHEME = "garu://pair";

/** Turn what a scan, a paste or an opened link gives us into an address and a token. Accepts the sign-in link, the app link, or "address token". */
export function parsePairing(input: string): { base: string; token: string } | null {
  const text = input.trim();
  const app = /^garu:\/\/pair\/?\?(.*)$/i.exec(text);
  if (app) {
    const q = new URLSearchParams(app[1]!);
    const base = q.get("base") ?? "";
    const token = q.get("token") ?? "";
    if (!TOKEN.test(token) || !/^https?:\/\//.test(base)) return null;
    try { return { base: new URL(base).origin, token }; } catch { return null; }
  }
  const m = /^(https?:\/\/[^\s/?#]+)[^\s?#]*\?(?:[^\s#&]*&)?token=([A-Za-z0-9_-]{32,})/.exec(text);
  if (m) return { base: m[1]!, token: m[2]! };
  const parts = text.split(/\s+/);
  if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    const [addr, tok] = TOKEN.test(b) ? [a, b] : [b, a];
    if (!TOKEN.test(tok)) return null;
    const base = /^https?:\/\//.test(addr) ? addr : `https://${addr}`;
    try { return { base: new URL(base).origin, token: tok }; } catch { return null; }
  }
  return null;
}

/** The app link for an address: what the pairing panel encodes when the code is for the iPhone app. */
export function appPairLink(base: string, token: string): string {
  return `${APP_SCHEME}?base=${encodeURIComponent(base.replace(/\/+$/, ""))}&token=${token}`;
}

/** A code made for this computer itself can't be reached from a phone. */
export const pointsAtThisComputer = (base: string): boolean => /^https?:\/\/(localhost|127\.|\[::1\])/.test(base);
