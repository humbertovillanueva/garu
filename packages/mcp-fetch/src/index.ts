#!/usr/bin/env node
/**
 * garu-mcp-fetch — the smallest useful web tool.
 *
 * Two tools, GET only, size-capped, with a timeout. It deliberately has no
 * allowlist of its own: that belongs in the agent's Garufile policy, where
 * `when: { url: { matches: "^https://api\\.github\\.com/" } }` decides what
 * this server may be asked to fetch. The tool stays dumb; the policy is smart.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toSlackMrkdwn } from "./format.js";
import { z } from "zod";

const MAX_CHARS_DEFAULT = 20_000;
const MAX_CHARS_HARD = 200_000;
const TIMEOUT_MS = 20_000;

async function get(url: string, accept: string): Promise<{ status: number; body: string; contentType: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`only http(s) URLs are allowed, got ${u.protocol}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u, {
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

function clip(s: string, max: number): { text: string; truncated: boolean } {
  const n = Math.min(Math.max(1, max), MAX_CHARS_HARD);
  return s.length > n ? { text: s.slice(0, n), truncated: true } : { text: s, truncated: false };
}

/** Very small HTML → text: drop scripts/styles/tags, collapse whitespace. Good enough for articles and APIs. */
function htmlToText(html: string): string {
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
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const server = new McpServer({ name: "garu-mcp-fetch", version: "0.1.0" });

server.registerTool(
  "fetch_json",
  {
    description: "GET a URL that returns JSON. Returns the parsed JSON (clipped if large). Use for APIs.",
    inputSchema: { url: z.string().url(), maxChars: z.number().int().positive().optional() },
  },
  async ({ url, maxChars }) => {
    const r = await get(url, "application/json");
    if (r.status >= 400) return { isError: true, content: [{ type: "text", text: `HTTP ${r.status} from ${url}: ${r.body.slice(0, 300)}` }] };
    let text = r.body;
    try {
      text = JSON.stringify(JSON.parse(r.body));
    } catch {
      /* not JSON after all; return as-is */
    }
    const c = clip(text, maxChars ?? MAX_CHARS_DEFAULT);
    return { content: [{ type: "text", text: c.text + (c.truncated ? `\n…[truncated to ${c.text.length} chars]` : "") }] };
  },
);

server.registerTool(
  "fetch_text",
  {
    description: "GET a URL and return its readable text (HTML is stripped to text). Use for web pages and articles.",
    inputSchema: { url: z.string().url(), maxChars: z.number().int().positive().optional() },
  },
  async ({ url, maxChars }) => {
    const r = await get(url, "text/html, text/plain;q=0.9, */*;q=0.5");
    if (r.status >= 400) return { isError: true, content: [{ type: "text", text: `HTTP ${r.status} from ${url}` }] };
    const text = /html/i.test(r.contentType) ? htmlToText(r.body) : r.body;
    const c = clip(text, maxChars ?? MAX_CHARS_DEFAULT);
    return { content: [{ type: "text", text: c.text + (c.truncated ? `\n…[truncated to ${c.text.length} chars]` : "") }] };
  },
);

/**
 * post_message — send text to one webhook (Slack or Discord incoming webhook, or
 * anything that accepts JSON). The URL comes from WEBHOOK_URL in this server's
 * environment, never from the model: it cannot choose where messages go.
 */
const WEBHOOK_URL = process.env["WEBHOOK_URL"];
if (WEBHOOK_URL) {
  server.registerTool(
    "post_message",
    {
      description: "Post a text message to the configured channel (a Slack or Discord webhook set up by the user). Markdown-lite is fine. Keep it under 1900 characters.",
      inputSchema: { text: z.string().min(1).max(1900) },
    },
    async ({ text }) => {
      const u = new URL(WEBHOOK_URL);
      const body = /discord\.com$|discordapp\.com$/.test(u.hostname) ? { content: text } : { text: /slack\.com$/.test(u.hostname) ? toSlackMrkdwn(text) : text };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(u, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) return { isError: true, content: [{ type: "text", text: `webhook answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }] };
        return { content: [{ type: "text", text: `posted ${text.length} chars to ${u.hostname}` }] };
      } finally {
        clearTimeout(timer);
      }
    },
  );
}

await server.connect(new StdioServerTransport());
