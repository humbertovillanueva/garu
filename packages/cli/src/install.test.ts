import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGarufile } from "@garu/kernel";
import { describeForInstall, fetchSource, installGarufile, resolveSource } from "./install.js";

const FILE = `name: pond
description: Watches the pond.
model: gemini/gemini-2.5-flash-lite
prompt: Say what changed.
triggers:
  - cron: "0 7 * * 1-5"
tools:
  - name: web
    command: node
    args: ["fetch.js"]
    env:
      WEBHOOK_URL: \${POND_WEBHOOK_URL}
policy:
  - tool: "web.fetch_*"
    action: allow
    when:
      url: { matches: "^https://api\\\\.example\\\\.com/" }
  - tool: "web.post_message"
    action: ask
  - tool: "*"
    action: block
  - tool: "web.fetch_json"
    action: allow
`;

describe("garu install", () => {
  it("knows where an agent lives: a GitHub path, a GitHub page, an https URL, a file", () => {
    expect(resolveSource("github:someone/agents/pond/Garufile.yaml")).toEqual({ kind: "url", url: "https://raw.githubusercontent.com/someone/agents/main/pond/Garufile.yaml" });
    expect(resolveSource("github:someone/agents@v2/pond/Garufile.yaml")).toEqual({ kind: "url", url: "https://raw.githubusercontent.com/someone/agents/v2/pond/Garufile.yaml" });
    expect(resolveSource("https://github.com/someone/agents/blob/main/pond/Garufile.yaml")).toEqual({ kind: "url", url: "https://raw.githubusercontent.com/someone/agents/main/pond/Garufile.yaml" });
    expect(resolveSource("https://example.com/pond.yaml")).toEqual({ kind: "url", url: "https://example.com/pond.yaml" });
    expect(resolveSource("./pond.yaml")).toEqual({ kind: "file", path: "./pond.yaml" });
    expect(() => resolveSource("http://example.com/pond.yaml")).toThrow(/https/);
  });

  it("fetches a URL or reads a file, and refuses an answer that is not the file", async () => {
    const ok = await fetchSource({ kind: "url", url: "https://example.com/pond.yaml" }, (async () => new Response(FILE, { status: 200 })) as unknown as typeof fetch);
    expect(ok).toBe(FILE);
    await expect(fetchSource({ kind: "url", url: "https://example.com/x" }, (async () => new Response("", { status: 404 })) as unknown as typeof fetch)).rejects.toThrow(/HTTP 404/);
    const dir = mkdtempSync(join(tmpdir(), "garu-install-"));
    writeFileSync(join(dir, "pond.yaml"), FILE);
    expect(await fetchSource({ kind: "file", path: join(dir, "pond.yaml") })).toBe(FILE);
    await expect(fetchSource({ kind: "file", path: join(dir, "nope.yaml") })).rejects.toThrow(/no file/);
  });

  it("says what it runs here, what it may do, what it needs, and what never wins", () => {
    const lines = describeForInstall(parseGarufile(FILE), {});
    expect(lines).toEqual([
      "pond: Watches the pond.",
      "model gemini/gemini-2.5-flash-lite · 1 tool server(s) · 4 rule(s)",
      "runs on the schedule 0 7 * * 1-5",
      "runs on this computer: node fetch.js",
      "On its own: web.fetch_* when url matches ^https://api\\.example\\.com/",
      "Asks you first: web.post_message",
      "Anything else: blocked",
      "⚠ rule 4 (web.fetch_json) never wins; rule 3 (*) above it matches first",
      "⚠ needs ${POND_WEBHOOK_URL} in .env before it can run",
    ]);
    expect(describeForInstall(parseGarufile(FILE), { POND_WEBHOOK_URL: "x" }).some((l) => /needs/.test(l))).toBe(false);
  });

  it("writes it under agents/<name>, renamed if asked, and leaves an existing agent alone", () => {
    const root = mkdtempSync(join(tmpdir(), "garu-install-"));
    const first = installGarufile(FILE, root);
    expect(first.file).toBe(join(root, "agents", "pond", "Garufile.yaml"));
    expect(readFileSync(first.file, "utf8")).toBe(FILE);
    expect(() => installGarufile(FILE, root)).toThrow(/already exists/);
    const renamed = installGarufile(FILE, root, { name: "lake" });
    expect(renamed.garufile.name).toBe("lake");
    expect(existsSync(join(root, "agents", "lake", "Garufile.yaml"))).toBe(true);
    expect(() => installGarufile(FILE, root, { name: "Bad Name" })).toThrow(/lowercase/);
    expect(() => installGarufile("name: x\nmodel: nope\nprompt: p\n", root)).toThrow();
  });
});
