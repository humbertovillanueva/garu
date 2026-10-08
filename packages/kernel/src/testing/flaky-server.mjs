#!/usr/bin/env node
// A test MCP server that dies the first time it is started and works the second time.
// The marker file (argv[2]) remembers that the first start happened.
import { existsSync, writeFileSync } from "node:fs";
const marker = process.argv[2];
if (!existsSync(marker)) { writeFileSync(marker, "1"); process.exit(1); }
await import("./echo-server.mjs");
