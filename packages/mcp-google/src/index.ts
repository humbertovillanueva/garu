#!/usr/bin/env node
/**
 * garu-mcp-google — Gmail and Google Calendar for Garu agents, through Google's regular APIs.
 *
 *   node packages/mcp-google/dist/index.js calendar   list_calendars, list_events, get_event
 *   node packages/mcp-google/dist/index.js gmail      search_threads, get_thread, list_labels,
 *                                                      list_drafts, label_thread, create_draft
 *
 * It holds no credentials. Garu signs in (`auth: oauth` on this server in the Garufile, then
 * `garu auth`) and starts it with a short-lived access token in GARU_OAUTH_ACCESS_TOKEN. What
 * that token may do is set by the scopes in the Garufile; what the agent may ask for, by its policy.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { googleClient } from "./google.js";
import { calendarTools, gmailTools } from "./tools.js";

const mode = process.argv[2];
if (mode !== "calendar" && mode !== "gmail") {
  process.stderr.write("usage: garu-mcp-google calendar|gmail\n");
  process.exit(2);
}

const call = googleClient(process.env["GARU_OAUTH_ACCESS_TOKEN"]);
const tools = mode === "calendar" ? calendarTools(call) : gmailTools(call);
const server = new McpServer({ name: `garu-mcp-google-${mode}`, version: "0.1.0" });

for (const [name, def] of Object.entries(tools)) {
  server.registerTool(name, { description: def.description, inputSchema: def.inputSchema, ...(def.annotations ? { annotations: def.annotations } : {}) }, async (args: unknown) => {
    try {
      const result = await def.run(args as never);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: (e as Error).message }] };
    }
  });
}

await server.connect(new StdioServerTransport());
