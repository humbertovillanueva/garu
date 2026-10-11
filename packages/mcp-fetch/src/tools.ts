/**
 * The fetch tools, apart from the stdio server so they can be tested with a fake fetch.
 *
 * Two read tools, GET only, size-capped, with a timeout, and one optional post tool whose
 * destination comes from this server's environment, never from the model. There is
 * deliberately no allowlist here: that belongs in the agent's Garufile policy, where
 * `when: { url: { matches: "^https://api\\.github\\.com/" } }` decides what may be fetched.
 */
import { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { toSlackMrkdwn } from "./format.js";

export const MAX_CHARS_DEFAULT = 20_000;
const MAX_CHARS_HARD = 200_000;
const TIMEOUT_MS = 20_000;

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

export function fetchTools(opts: { fetchFn?: typeof fetch; webhookUrl?: string | undefined } = {}): Record<string, ToolDef> {
  const fetchFn = opts.fetchFn ?? fetch;

  async function get(url: string, accept: string): Promise<{ status: number; body: string; contentType: string }> {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`only http(s) URLs are allowed, got ${u.protocol}`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchFn(u, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { accept, "user-agent": "garu-mcp-fetch/0.1 (+https://github.com/humbertovillanueva/garu)" },
      });
      const body = await res.text();
      return { status: res.status, body, contentType: res.headers.get("content-type") ?? "" };
    } finally {
      clearTimeout(timer);
    }
  }

  const tools: Record<string, ToolDef> = {
    fetch_json: tool(
      "GET a URL that returns JSON. Returns the parsed JSON (clipped if large). Use for APIs.",
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
      "GET a URL and return its readable text (HTML is stripped to text). Use for web pages and articles.",
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
