/**
 * The packaged command, the way a person runs it: `garu ui` from a folder with one Garufile answers
 * for its agents and the New agent form; `garu doctor`, `garu try` and `garu status` print what they
 * should. Runs against packages/cli/dist, which CI builds before the tests; skipped when it isn't there.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "..", "dist", "index.js");
const built = existsSync(cli);

const GARUFILE = `name: pip
description: Says hello.
model: gemini/gemini-2.5-flash-lite
prompt: Say hello.
triggers:
  - manual: true
tools:
  - name: fs
    command: node
    args: ["-e", "0"]
policy:
  - tool: "fs.write_file"
    action: ask
    reason: writing
  - tool: "*"
    action: block
  - tool: "fs.read_file"
    action: allow
`;

const freePort = () => new Promise<number>((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const run = (args: string[], cwd: string) => new Promise<{ code: number | null; out: string }>((res) => {
  const p = spawn(process.execPath, [cli, ...args], { cwd, env: { ...process.env, GARU_LANG: "en", NO_COLOR: "1" } });
  let out = "";
  p.stdout.on("data", (c) => (out += c)); p.stderr.on("data", (c) => (out += c));
  p.on("close", (code) => res({ code, out }));
});

let root = "";
let port = 0;
let ui: ChildProcess | undefined;

describe.skipIf(!built)("the packaged command", () => {
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "garu-smoke-"));
    mkdirSync(join(root, "agents", "pip"), { recursive: true });
    writeFileSync(join(root, "agents", "pip", "Garufile.yaml"), GARUFILE);
    port = await freePort();
    ui = spawn(process.execPath, [cli, "ui", "-p", String(port), "--as", "Test"], { cwd: root, env: { ...process.env, GARU_LANG: "en" }, stdio: "ignore" });
    for (let i = 0; i < 200; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/agents`)).ok) return; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("garu ui did not come up");
  }, 30_000);
  afterAll(() => { ui?.kill(); });

  it("garu ui answers for the agents and the form, from this folder", async () => {
    const agents = (await (await fetch(`http://127.0.0.1:${port}/api/agents`)).json()) as { agents: { name: string; configured: boolean }[] };
    expect(agents.agents.map((a) => a.name)).toEqual(["pip"]);
    expect(agents.agents[0]!.configured).toBe(true);
    const form = (await (await fetch(`http://127.0.0.1:${port}/api/new`)).json()) as { kinds: unknown[]; taken: string[] };
    expect(form.kinds.length).toBe(12);
    expect(form.taken).toEqual(["pip"]);
    const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    expect(page).toContain("garu-build");
  });

  it("garu doctor, garu try and garu status say what they should", async () => {
    const doctor = await run(["doctor"], root);
    expect(doctor.out).toContain("1 agent: pip");
    expect(doctor.out).toContain("pip: rule 3 (fs.read_file) never wins; rule 2 (*) above it matches first");
    const tried = await run(["try", "pip", "fs.write_file", '{"path": "x"}'], root);
    expect(tried.code).toBe(0);
    expect(tried.out).toContain("? ask  fs.write_file");
    expect(tried.out).toContain("rule 1 (fs.write_file) decides: writing");
    const status = await run(["status"], root);
    expect(status.code).toBe(0);
    expect(status.out).toContain("pip");
    expect(status.out).toContain("1 rule never wins");
  }, 20_000);
});
