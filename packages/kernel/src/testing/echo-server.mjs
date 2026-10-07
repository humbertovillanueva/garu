// Minimal MCP server used by the kernel's own tests. Plain JS so tests can spawn it with `node`.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "echo-test", version: "0.0.1" });

server.registerTool(
  "echo",
  { description: "Echo text back", inputSchema: { text: z.string() } },
  async ({ text }) => ({ content: [{ type: "text", text }] }),
);
server.registerTool(
  "add",
  { description: "Add two numbers", inputSchema: { a: z.number(), b: z.number() } },
  async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }),
);
server.registerTool(
  "danger",
  { description: "Pretend to delete everything", inputSchema: { target: z.string() } },
  async ({ target }) => ({ content: [{ type: "text", text: `deleted ${target}` }] }),
);
server.registerTool(
  "fail",
  { description: "Always errors", inputSchema: {} },
  async () => ({ isError: true, content: [{ type: "text", text: "nope" }] }),
);

await server.connect(new StdioServerTransport());
