// MCP server for the local sign-in tests: reports whether Garu handed it an access token.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "token-test", version: "0.0.1" });
server.registerTool("whoami", { description: "Report the access token this server was started with", inputSchema: {} }, async () => ({
  content: [{ type: "text", text: `token=${process.env.GARU_OAUTH_ACCESS_TOKEN ?? "none"}` }],
}));
await server.connect(new StdioServerTransport());
