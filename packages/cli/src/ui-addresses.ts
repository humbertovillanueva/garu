/**
 * Where a phone can reach this control room.
 *
 * The browser on this computer uses localhost, which a phone can't. If
 * Tailscale is serving us, `tailscale serve status` knows the https address;
 * we ask it so the sign-in code points there without the person having to
 * know. We also remember any address a reverse proxy has already sent us.
 */
import { execFile } from "node:child_process";

export interface Address {
  url: string;
  via: "tailscale" | "seen";
}

const CANDIDATES = ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/usr/bin/tailscale", "/usr/local/bin/tailscale"];

/** Pull the https addresses that proxy to `port` out of `tailscale serve status` (JSON or text form). */
export function parseServeStatus(out: string, port: number): string[] {
  const urls: string[] = [];
  try {
    const j = JSON.parse(out) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> };
    for (const [hostport, cfg] of Object.entries(j.Web ?? {})) {
      const proxies = Object.values(cfg.Handlers ?? {}).some((h) => h.Proxy?.endsWith(`:${port}`));
      if (!proxies) continue;
      const i = hostport.lastIndexOf(":");
      const host = i > 0 ? hostport.slice(0, i) : hostport;
      const p = i > 0 ? hostport.slice(i + 1) : "443";
      urls.push(p === "443" ? `https://${host}/` : `https://${host}:${p}/`);
    }
    return urls;
  } catch {
    /* text form */
  }
  let current: string | null = null;
  for (const line of out.split("\n")) {
    const m = /^(https:\/\/[^\s]+)/.exec(line.trim());
    if (m) { current = m[1]!.endsWith("/") ? m[1]! : `${m[1]!}/`; continue; }
    if (current && new RegExp(`proxy https?://(127\\.0\\.0\\.1|localhost):${port}\\b`).test(line)) {
      if (!urls.includes(current)) urls.push(current);
    }
  }
  return urls;
}

function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((res) => {
    try {
      execFile(cmd, args, { timeout: 2500 }, (err, stdout) => res(err ? null : String(stdout)));
    } catch {
      res(null);
    }
  });
}

let cache: { at: number; urls: string[] } | null = null;

/** Tailscale's address for this control room, if `tailscale serve` is on. Cached briefly; never throws. */
export async function tailscaleAddresses(port: number): Promise<string[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.urls;
  let urls: string[] = [];
  for (const cmd of CANDIDATES) {
    const out = (await run(cmd, ["serve", "status", "--json"])) ?? (await run(cmd, ["serve", "status"]));
    if (out === null) continue;
    urls = parseServeStatus(out, port);
    break;
  }
  cache = { at: Date.now(), urls };
  return urls;
}

/** Addresses a proxy in front of us has used, learnt from X-Forwarded-Host. */
export class SeenHosts {
  private readonly set = new Set<string>();
  note(headers: Record<string, string | string[] | undefined>): void {
    const host = headers["x-forwarded-host"];
    const proto = headers["x-forwarded-proto"];
    if (typeof host !== "string" || typeof proto !== "string") return;
    const h = host.split(",")[0]!.trim();
    const p = proto.split(",")[0]!.trim();
    if (!h || !/^https?$/.test(p) || /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h)) return;
    this.set.add(`${p}://${h}/`);
  }
  list(): string[] {
    return [...this.set];
  }
}
