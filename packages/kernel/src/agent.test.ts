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

  it("budget cap: stops before executing tool calls once cost reaches maxCostUsd", async () => {
    const capped = parseGarufile(`
name: capped
model: anthropic/claude-sonnet-4-6
prompt: x
maxTurns: 10
budget:
  maxCostUsd: 0.05
tools:
  - name: echo
    command: node
    args: ["${serverPath}"]
policy:
  - tool: "*"
    action: allow
`);
    // Sonnet: $3/M in, $15/M out. 10k in + 2k out = $0.03 + $0.03 = $0.06 per turn → first turn already over cap.
    const provider = new FakeProvider([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "echo__echo", input: { text: "should never run" } }],
        usage: { inputTokens: 10_000, outputTokens: 2_000 },
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "unreachable" }] },
    ]);
    const res = await runAgent({ garufile: capped, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider, approver: async () => ({ approved: true, by: "t" }) });

    expect(res.status).toBe("budget_exceeded");
    expect(res.turns).toBe(1);
    expect(res.costUsd).toBeCloseTo(0.06, 6);
    expect(provider.calls).toHaveLength(1); // no second model call

    const events = readRun(res.logPath).map((e) => e.event);
    expect(events.some((e) => e.type === "tool.request")).toBe(false); // the tool call never reached the bus
    const b = events.find((e) => e.type === "budget.exceeded");
    expect(b).toMatchObject({ type: "budget.exceeded", maxCostUsd: 0.05, pendingToolCalls: 1 });
    const end = events.at(-1);
    expect(end).toMatchObject({ type: "run.end", status: "budget_exceeded", priced: true });
  }, 30_000);

  it("budget cap: a run under the cap completes and reports cost", async () => {
    const cheap = parseGarufile(`
name: cheap
model: anthropic/claude-haiku-4-5
prompt: x
budget:
  maxCostUsd: 1
`);
    const provider = new FakeProvider([
      { stopReason: "end_turn", content: [{ type: "text", text: "hi" }], usage: { inputTokens: 1000, outputTokens: 100 } },
    ]);
    const res = await runAgent({ garufile: cheap, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider, approver: async () => ({ approved: true, by: "t" }) });
    expect(res.status).toBe("ok");
    expect(res.costUsd).toBeCloseTo(0.0015, 8); // 1000/1M*1 + 100/1M*5
    expect(res.inputTokens).toBe(1000);
  });

  it("budget cap on an unpriced model is refused up front unless pricing is given", async () => {
    const unpriced = parseGarufile(`
name: unpriced
model: fake/any
prompt: x
budget:
  maxCostUsd: 1
`);
    await expect(
      runAgent({ garufile: unpriced, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider: new FakeProvider([]), approver: async () => ({ approved: true, by: "t" }) }),
    ).rejects.toThrow(/no known price/);

    const withPricing = parseGarufile(`
name: unpriced
model: fake/any
prompt: x
budget:
  maxCostUsd: 1
  pricing: { inputPerMTok: 0, outputPerMTok: 0 }
`);
    const res = await runAgent({
      garufile: withPricing,
      logRoot: mkdtempSync(join(tmpdir(), "garu-")),
      provider: new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "free" }], usage: { inputTokens: 5, outputTokens: 5 } }]),
      approver: async () => ({ approved: true, by: "t" }),
    });
    expect(res.status).toBe("ok");
    expect(res.costUsd).toBe(0);
  });

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
