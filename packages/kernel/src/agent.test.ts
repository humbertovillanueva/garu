import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "./agent.js";
import { parseGarufile } from "./garufile.js";
import { FakeProvider } from "./providers/fake.js";
import { readRun } from "./recorder.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "testing", "echo-server.mjs");

const garufile = parseGarufile(`
name: loop-test
model: fake/any
prompt: do the thing
maxTurns: 5
tools:
  - name: echo
    command: node
    args: ["${serverPath}"]
policy:
  - tool: echo.echo
    action: allow
  - tool: echo.danger
    action: block
    reason: no deleting
  - tool: "*"
    action: ask
`);

describe("runAgent", () => {
  it("runs tools through policy and feeds results back to the model", async () => {
    const provider = new FakeProvider([
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "echo__echo", input: { text: "hello" } },
          { type: "tool_use", id: "t2", name: "echo__danger", input: { target: "prod" } },
          { type: "tool_use", id: "t3", name: "echo__add", input: { a: 1, b: 2 } },
        ],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "done" }] },
    ]);
    const logRoot = mkdtempSync(join(tmpdir(), "garu-"));
    const res = await runAgent({
      garufile,
      logRoot,
      provider,
      approver: async () => ({ approved: false, by: "test-human" }),
    });

    expect(res.status).toBe("ok");
    expect(res.output).toBe("done");
    expect(res.turns).toBe(2);

    // the model saw the tools under provider-safe names
    expect(provider.calls[0]?.tools.map((t) => t.name).sort()).toEqual(["echo__add", "echo__danger", "echo__echo", "echo__fail"]);

    // second call carried the tool results back
    const second = provider.calls[1]!;
    const results = second.messages.at(-1)!.content;
    expect(results).toEqual([
      { type: "tool_result", toolUseId: "t1", content: "hello" },
      { type: "tool_result", toolUseId: "t2", isError: true, content: "BLOCKED by policy: no deleting" },
      { type: "tool_result", toolUseId: "t3", isError: true, content: expect.stringMatching(/^DENIED by test-human/) },
    ]);

    const types = readRun(res.logPath).map((e) => e.event.type);
    expect(types[0]).toBe("run.start");
    expect(types.at(-1)).toBe("run.end");
    expect(types).toContain("approval.requested");
  }, 30_000);

  it("stops at maxTurns and says so", async () => {
    const forever = Array.from({ length: 10 }, () => ({
      stopReason: "tool_use" as const,
      content: [{ type: "tool_use" as const, id: "x", name: "echo__echo", input: { text: "again" } }],
    }));
    const res = await runAgent({
      garufile,
      logRoot: mkdtempSync(join(tmpdir(), "garu-")),
      provider: new FakeProvider(forever),
      approver: async () => ({ approved: true, by: "t" }),
    });
    expect(res.status).toBe("max_turns");
    expect(res.turns).toBe(5);
  }, 30_000);

  it("a tool server that won't start is a recorded error, not a crash", async () => {
    const bad = parseGarufile(`
name: bad
model: fake/any
prompt: x
tools:
  - name: ghost
    command: /definitely/not/a/real/binary
`);
    const res = await runAgent({
      garufile: bad,
      logRoot: mkdtempSync(join(tmpdir(), "garu-")),
      provider: new FakeProvider([]),
      approver: async () => ({ approved: true, by: "t" }),
    });
    expect(res.status).toBe("error");
    expect(res.output).toMatch(/tool server "ghost" failed to start/);
    const last = readRun(res.logPath).at(-1)!;
    expect(last.event).toMatchObject({ type: "run.end", status: "error" });
  }, 30_000);
});
