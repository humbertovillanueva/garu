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
  it("tells the model its owner and language, and hands it the date in that language", async () => {
    const provider = new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "listo" }] }]);
    const res = await runAgent({
      garufile: { ...garufile, language: "es" },
      logRoot: mkdtempSync(join(tmpdir(), "garu-")),
      provider,
      owner: "Ana",
      approver: async () => ({ approved: false, by: "test-human" }),
      now: () => new Date("2026-10-07T05:00:00.000Z"),
    });
    expect(res.status).toBe("ok");
    const system = provider.calls[0]?.system ?? "";
    const at = new Date("2026-10-07T05:00:00.000Z");
    expect(system).toContain(`Current time: ${at.toLocaleDateString("es", { weekday: "long" })}, ${at.getDate()} de octubre de 2026`);
    expect(system).toContain("Your owner: Ana.");
    expect(system).toContain("in Spanish. Answer an email in the language it was written in.");
  });

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
      approver: async () => ({ approved: false, by: "test-human", note: "wrong target, use staging" }),
      now: () => new Date("2026-10-07T05:00:00.000Z"),
    });

    expect(res.status).toBe("ok");
    // the day, date and time in the machine's own zone, spelled out, with UTC for exact timestamps
    const at = new Date("2026-10-07T05:00:00.000Z");
    const weekday = at.toLocaleDateString("en-US", { weekday: "long" });
    expect(provider.calls[0]?.system).toMatch(new RegExp(`Current time: ${weekday}, October \\d+, 2026`));
    expect(provider.calls[0]?.system).toContain(`local date ${at.toLocaleDateString("en-CA")}; UTC 2026-10-07T05:00:00.000Z`);
    expect(provider.calls[0]?.system).toContain("Trigger: manual");
    expect(provider.calls[0]?.system).toContain("Your standing instructions:\ndo the thing");
    expect(provider.calls[0]?.messages[0]?.content).toEqual([{ type: "text", text: "Carry out your standing instructions now." }]);
    expect(res.output).toBe("done");
    expect(res.turns).toBe(2);

    // the model saw the tools under provider-safe names — minus echo.danger, which policy blocks unconditionally
    expect(provider.calls[0]?.tools.map((t) => t.name).sort()).toEqual(["echo__add", "echo__cut_read", "echo__cut_write", "echo__echo", "echo__fail"]);
    const offered = readRun(res.logPath).find((e) => e.event.type === "tools.offered")!.event;
    expect(offered).toMatchObject({ type: "tools.offered", hidden: ["echo.danger"] });

    // second call carried the tool results back
    const second = provider.calls[1]!;
    const results = second.messages.at(-1)!.content;
    expect(results).toEqual([
      { type: "tool_result", toolUseId: "t1", content: "hello" },
      { type: "tool_result", toolUseId: "t2", isError: true, content: "unknown tool echo__danger" },
      { type: "tool_result", toolUseId: "t3", isError: true, content: expect.stringMatching(/^DENIED by test-human: .*\nThe person who declined said: "wrong target, use staging"\./s) },
    ]);

    const types = readRun(res.logPath).map((e) => e.event.type);
    expect(types[0]).toBe("run.start");
    expect(types.at(-1)).toBe("run.end");
    expect(types).toContain("approval.requested");
    expect(readRun(res.logPath).find((e) => e.event.type === "approval.resolved")!.event).toMatchObject({ approved: false, by: "test-human", note: "wrong target, use staging" });
  }, 30_000);

  it("asks about every call of a step at once, not one after another", async () => {
    const provider = new FakeProvider([
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "a", name: "echo__add", input: { a: 1, b: 2 } },
          { type: "tool_use", id: "b", name: "echo__add", input: { a: 3, b: 4 } },
        ],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "done" }] },
    ]);
    const asked: string[] = [];
    let bothUp!: () => void;
    const bothAsked = new Promise<void>((resolve) => { bothUp = resolve; });
    const res = await runAgent({
      garufile,
      logRoot: mkdtempSync(join(tmpdir(), "garu-")),
      provider,
      approver: async (_req, _decision, ctx) => {
        asked.push(ctx.callId);
        if (asked.length === 2) bothUp();
        // Each answer waits until both cards are up. A kernel that asks one at a time never gets the second card while the first waits, and fails here.
        await Promise.race([bothAsked, new Promise((_, reject) => setTimeout(() => reject(new Error("the second ask never came while the first was waiting")), 5_000))]);
        return { approved: true, by: "test-human" };
      },
    });
    expect(res.status).toBe("ok");
    expect(asked).toHaveLength(2);
    const results = provider.calls[1]!.messages.at(-1)!.content as { type: string; toolUseId: string; isError?: boolean }[];
    expect(results.map((r) => [r.type, r.toolUseId, r.isError ?? false])).toEqual([["tool_result", "a", false], ["tool_result", "b", false]]);
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

  it("a provider that can't reach the network ends the run as offline, with no turns counted", async () => {
    const logRoot = mkdtempSync(join(tmpdir(), "garu-"));
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND generativelanguage.googleapis.com"), { code: "ENOTFOUND" });
    const provider = { id: "fake", complete: async () => { throw new TypeError("fetch failed", { cause }); } };
    const res = await runAgent({ garufile, logRoot, provider, approver: async () => ({ approved: false, by: "test" }), trigger: "cron:0 7 * * 1-5" });
    expect(res).toMatchObject({ status: "error", offline: true, turns: 0 });
    const end = readRun(res.logPath).find((e) => e.event.type === "run.end")!.event;
    expect(end).toMatchObject({ type: "run.end", status: "error", offline: true });
  });

  it("a priced model whose provider reports no usage is not claimed as priced", async () => {
    const logRoot = mkdtempSync(join(tmpdir(), "garu-"));
    const quiet = parseGarufile(`
name: quiet
model: gemini/gemini-3.5-flash
prompt: say hi
`);
    const provider = new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "hi" }] }]);
    const res = await runAgent({ garufile: quiet, logRoot, provider, approver: async () => ({ approved: false, by: "test" }) });
    expect(res.status).toBe("ok");
    const end = readRun(res.logPath).find((e) => e.event.type === "run.end")!.event;
    expect(end).toMatchObject({ type: "run.end", status: "ok", priced: false });
  });

  it("a start-up error shows the Garufile's ${VAR}, never its value", async () => {
    process.env["GARU_TEST_SECRET"] = "hunter2-not-for-logs";
    const leaky = parseGarufile(`
name: leaky
model: fake/any
prompt: p
tools:
  - name: nope
    command: definitely-not-a-command-garu
    args: ["--token", "\${GARU_TEST_SECRET}"]
`);
    const res = await runAgent({ garufile: leaky, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider: new FakeProvider([]), approver: async () => ({ approved: false, by: "test" }) });
    expect(res.status).toBe("error");
    expect(res.output).toContain("${GARU_TEST_SECRET}");
    expect(res.output).not.toContain("hunter2");
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
