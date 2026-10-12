/**
 * The fetch tools, apart from the stdio server so they can be tested with a fake fetch.
 *
 * Two read tools, GET only, size-capped, with a timeout, and one optional post tool whose
 * destination comes from this server's environment, never from the model. There is
 * deliberately no allowlist here: that belongs in the agent's Garufile policy, where
 * `when: { url: { matches: "^https://api\\.github\\.com/" } }` decides what may be fetched.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { toSlackMrkdwn } from "./format.js";

export const MAX_CHARS_DEFAULT = 20_000;
const MAX_CHARS_HARD = 200_000;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

/** This machine, the LAN, link-local, Tailscale's range: places a model-chosen URL must never reach. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const low = ip.toLowerCase();
  return low === "::" || low === "::1" || /^f[cd]/.test(low) || /^fe[89ab]/.test(low);
}
const PRIVATE_NAMES = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i;
const isHomeHost = (hostname: string) => { const h = hostname.replace(/^\[|\]$/g, ""); return PRIVATE_NAMES.test(h) || (isIP(h) !== 0 && isPrivateAddress(h)); };
const defaultLookup = async (host: string): Promise<string[]> => (await lookup(host, { all: true })).map((a) => a.address);

export interface ToolResult {
  [key: string]: unknown;
  isError?: boolean;
  content: { type: "text"; text: string }[];
}
export interface ToolDef {
  description: string;
  inputSchema: z.ZodRawShape;
  /** What the tool may do, for clients that show it: reads only, can change things, reaches the open web. */
  annotations: ToolAnnotations;
  run: (args: never) => Promise<ToolResult>;
}

function tool<S extends z.ZodRawShape>(description: string, inputSchema: S, annotations: ToolAnnotations, run: (args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>): ToolDef {
  return { description, inputSchema, annotations, run: run as (args: never) => Promise<ToolResult> };
}

const text = (t: string, isError = false): ToolResult => ({ ...(isError ? { isError: true } : {}), content: [{ type: "text", text: t }] });

function clip(s: string, max: number): { text: string; truncated: boolean } {
  const n = Math.min(Math.max(1, max), MAX_CHARS_HARD);
  return s.length > n ? { text: s.slice(0, n), truncated: true } : { text: s, truncated: false };
}
const clipped = (s: string, max: number) => {
  const c = clip(s, max);
  return c.text + (c.truncated ? `\n…[truncated to ${c.text.length} chars]` : "");
};

/** Very small HTML → text: drop scripts/styles/tags, collapse whitespace. Good enough for articles and APIs. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|br|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n") // no stray space at either end of a line
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Both read tools only ever GET, and reach whatever the policy lets them: the open web. */
const READS: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export interface FetchToolsOptions {
  fetchFn?: typeof fetch;
  webhookUrl?: string | undefined;
  /** DNS, injectable for tests: the addresses a host name resolves to. */
  lookupFn?: (host: string) => Promise<string[]>;
}

export function fetchTools(opts: FetchToolsOptions = {}): Record<string, ToolDef> {
  const fetchFn = opts.fetchFn ?? fetch;
  const lookupFn = opts.lookupFn ?? defaultLookup;

  /** Only the open web: not this machine (where the control room answers), not the LAN, whatever name a host hides behind. */
  async function assertPublic(u: URL): Promise<void> {
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`only http(s) URLs are allowed, got ${u.protocol}`);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (PRIVATE_NAMES.test(host)) throw new Error(`${u.hostname} is this machine or a private network; fetch reaches only the open web`);
    const addrs = isIP(host) ? [host] : await lookupFn(host);
    if (addrs.some(isPrivateAddress)) throw new Error(`${u.hostname} points at this machine or a private network; fetch reaches only the open web`);
  }

  async function get(url: string, accept: string): Promise<{ status: number; body: string; contentType: string }> {
    let u = new URL(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      for (let hop = 0; ; hop++) {
        await assertPublic(u);
        const res = await fetchFn(u, {
          method: "GET",
          // Followed by hand so every hop gets the same check: a public host must not be able to bounce us inside.
          redirect: "manual",
          signal: ctrl.signal,
          headers: { accept, "user-agent": "garu-mcp-fetch/0.1 (+https://github.com/humbertovillanueva/garu)" },
        });
        const location = res.headers.get("location");
        if ([301, 302, 303, 307, 308].includes(res.status) && location) {
          if (hop >= MAX_REDIRECTS) throw new Error(`${url}: too many redirects`);
          u = new URL(location, u);
          continue;
        }
        const body = await res.text();
        return { status: res.status, body, contentType: res.headers.get("content-type") ?? "" };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const tools: Record<string, ToolDef> = {
    fetch_json: tool(
      "GET a URL that returns JSON. Returns the parsed JSON (clipped if large). Use for APIs. Reaches only the open web, never this machine or a private network.",
      { url: z.string().url(), maxChars: z.number().int().positive().optional() },
      { title: "Fetch JSON", ...READS },
      async ({ url, maxChars }) => {
        const r = await get(url, "application/json");
        if (r.status >= 400) return text(`HTTP ${r.status} from ${url}: ${r.body.slice(0, 300)}`, true);
        let body = r.body;
        try {
          body = JSON.stringify(JSON.parse(r.body));
        } catch {
          /* not JSON after all; return as-is */
        }
        return text(clipped(body, maxChars ?? MAX_CHARS_DEFAULT));
      },
    ),

    fetch_text: tool(
      "GET a URL and return its readable text (HTML is stripped to text). Use for web pages and articles. Reaches only the open web, never this machine or a private network.",
      { url: z.string().url(), maxChars: z.number().int().positive().optional() },
      { title: "Fetch a page as text", ...READS },
      async ({ url, maxChars }) => {
        const r = await get(url, "text/html, text/plain;q=0.9, */*;q=0.5");
        if (r.status >= 400) return text(`HTTP ${r.status} from ${url}`, true);
        return text(clipped(/html/i.test(r.contentType) ? htmlToText(r.body) : r.body, maxChars ?? MAX_CHARS_DEFAULT));
      },
    ),
  };

  // post_message exists only when this server was started with WEBHOOK_URL: one channel, chosen by you.
  const hook = opts.webhookUrl;
  if (hook) {
    const h = new URL(hook);
    // The webhook URL is itself a secret (whoever has it can post to your channel): it travels encrypted,
    // unless it never leaves your own network.
    if (h.protocol !== "https:" && !(h.protocol === "http:" && isHomeHost(h.hostname))) {
      throw new Error(`WEBHOOK_URL must be https://; http:// is fine only on your own network (e.g. http://192.168.1.20:8080/...)`);
    }
    tools["post_message"] = tool(
      "Post a text message to the configured channel (a Slack or Discord webhook set up by the user). Markdown-lite is fine. Keep it under 1900 characters.",
      { text: z.string().min(1).max(1900) },
      // It adds a message and never removes anything, but each call posts again: not idempotent.
      { title: "Post to your channel", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      async ({ text: message }) => {
        const u = new URL(hook);
        const body = /discord\.com$|discordapp\.com$/.test(u.hostname) ? { content: message } : { text: /slack\.com$/.test(u.hostname) ? toSlackMrkdwn(message) : message };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const res = await fetchFn(u, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
          if (!res.ok) return text(`webhook answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, true);
          return text(`posted ${message.length} chars to ${u.hostname}`);
        } finally {
          clearTimeout(timer);
        }
      },
    );
  }
  return tools;
}
