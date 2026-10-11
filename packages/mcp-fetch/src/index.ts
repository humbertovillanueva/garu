#!/usr/bin/env node
/**
 * garu-mcp-fetch — the smallest useful web tool.
 *
 * Two tools, GET only, size-capped, with a timeout. It deliberately has no
 * allowlist of its own: that belongs in the agent's Garufile policy, where
 * `when: { url: { matches: "^https://api\\.github\\.com/" } }` decides what
 * this server may be asked to fetch. The tool stays dumb; the policy is smart.
 *
 * post_message — send text to one webhook (Slack or Discord incoming webhook, or
 * anything that accepts JSON). The URL comes from WEBHOOK_URL in this server's
 * environment, never from the model: it cannot choose where messages go.
 * The tools themselves live in tools.ts.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fetchTools } from "./tools.js";

const server = new McpServer({ name: "garu-mcp-fetch", version: "0.1.0" });

for (const [name, def] of Object.entries(fetchTools({ webhookUrl: process.env["WEBHOOK_URL"] }))) {
  server.registerTool(name, { description: def.description, inputSchema: def.inputSchema, annotations: def.annotations }, async (args: unknown) => def.run(args as never));
}

await server.connect(new StdioServerTransport());
