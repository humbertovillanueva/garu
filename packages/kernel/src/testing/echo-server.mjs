// Minimal MCP server used by the kernel's own tests. Plain JS so tests can spawn it with `node`.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// NOISY_STDERR=<bytes>: write that much to stderr first, like a server that logs a lot while starting.
if (process.env.NOISY_STDERR) process.stderr.write("log ".repeat(Math.ceil(Number(process.env.NOISY_STDERR) / 4)) + "\n");

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
// A call that is cut off once (a timeout, a Mac that slept through it) and works the second time:
// one that only reads, one that writes.
const cuts = { cut_read: 0, cut_write: 0 };
const cutOnce = (name) => async () =>
  cuts[name]++ === 0 ? { isError: true, content: [{ type: "text", text: "This operation was aborted" }] } : { content: [{ type: "text", text: "fine" }] };
// A tool that only looks, and says so (readOnlyHint): a run cut off after calls like this one has changed nothing.
server.registerTool("peek", { description: "Only looks", inputSchema: {}, annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: "text", text: "looked" }] }));
server.registerTool("cut_read", { description: "Cut off once, then answers", inputSchema: {}, annotations: { readOnlyHint: true } }, cutOnce("cut_read"));
server.registerTool("cut_write", { description: "Cut off once, then answers; a write", inputSchema: {} }, cutOnce("cut_write"));

await server.connect(new StdioServerTransport());
