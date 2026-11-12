import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "./agent.js";
import { parseGarufile } from "./garufile.js";
import { readParked } from "./park.js";
import { FakeProvider } from "./providers/fake.js";
import { Memory } from "./memory.js";
import type { CompleteRequest, CompleteResponse } from "./provider.js";
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
  - tool: echo.peek
    action: allow
  - tool: echo.danger
    action: block
    reason: no deleting
  - tool: "*"
    action: ask
`);

/** Answers the script, then loses the network the way the Gemini provider reports it after the computer slept. */
function sleepyProvider(script: CompleteResponse[]) {
  const fake = new FakeProvider(script);
  let left = script.length;
  return {
    id: "fake",
    calls: fake.calls,
    complete: async (req: CompleteRequest) => {
      if (left-- > 0) return fake.complete(req);
      throw new Error("gemini gemini-3.5-flash-lite: can't reach the network (The operation was aborted due to timeout)");
    },
  };
}

describe("runAgent asking another agent", () => {
  const asking = parseGarufile(`
name: tomay-test
model: fake/any
prompt: write the day
maxTurns: 4
tools:
  - name: echo
    command: node
    args: ["${serverPath}"]
policy:
  - tool: garu.ask
    when: { agent: { matches: "^bea$" } }
    action: allow
  - tool: "*"
    action: block
    reason: nothing else
`);
  const script = (): CompleteResponse[] => [
    { stopReason: "tool_use", content: [
      { type: "tool_use", id: "a1", name: "garu__ask", input: { agent: "bea", message: "Anything from Lena this week?" } },
      { type: "tool_use", id: "a2", name: "garu__ask", input: { agent: "rook", message: "stars?" } },
    ] },
    { stopReason: "end_turn", content: [{ type: "text", text: "10:00 Lena: she is waiting on the pricing copy." }] },
  ];

  it("offers garu.ask only when the run can reach other agents, and the answer comes back as the tool result", async () => {
    const asked: [string, string][] = [];
    const provider = new FakeProvider(script());
    const res = await runAgent({
      garufile: asking,
      logRoot: mkdtempSync(join(tmpdir(), "garu-")),
      provider,
      approver: async () => ({ approved: false, by: "t" }),
      ask: {
        agents: () => ["tomay-test", "bea", "rook"],
        ask: async (target, message) => { asked.push([target, message]); return { status: "ok", output: "Yes: Monday, she is waiting on the pricing copy." }; },
      },
    });
    expect(res.status).toBe("ok");
    // echo's tools are all blocked and hidden; the one tool on offer is the ask, whose text names the others but not itself
    const offered = provider.calls[0]!.tools.map((t) => t.name);
    expect(offered).toEqual(["garu__ask"]);
    expect(provider.calls[0]!.tools[0]!.description).toContain("bea, rook");
    expect(provider.calls[0]!.tools[0]!.description).not.toContain("tomay-test");
    const results = provider.calls[1]!.messages.at(-1)!.content;
    expect(results).toEqual([
      { type: "tool_result", toolUseId: "a1", content: "Yes: Monday, she is waiting on the pricing copy." },
      { type: "tool_result", toolUseId: "a2", isError: true, content: "BLOCKED by policy: nothing else" },
    ]);
    expect(asked).toEqual([["bea", "Anything from Lena this week?"]]);
    const log = readRun(res.logPath);
    expect(log.find((e) => e.event.type === "tool.request" && e.event.request.tool === "ask")!.event).toMatchObject({ request: { server: "garu", tool: "ask", args: { agent: "bea" } } });
  });

  it("a refusal or a failed run reaches the model as an error it can act on", async () => {
    const provider = new FakeProvider(script());
    const res = await runAgent({
      garufile: asking,
      logRoot: mkdtempSync(join(tmpdir(), "garu-")),
      provider,
      approver: async () => ({ approved: false, by: "t" }),
      ask: { agents: () => ["bea"], ask: async () => { throw new Error("bea is busy with a run right now; answer with what you have, or say it should be asked later"); } },
    });
    expect(res.status).toBe("ok");
    const results = provider.calls[1]!.messages.at(-1)!.content;
    expect(results[0]).toEqual({ type: "tool_result", toolUseId: "a1", isError: true, content: expect.stringMatching(/^ERROR: bea is busy/) });
  });

  it("without a way to reach other agents, garu.ask is not offered at all", async () => {
    const provider = new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "alone" }] }]);
    const res = await runAgent({ garufile: asking, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider, approver: async () => ({ approved: false, by: "t" }) });
    expect(res.status).toBe("ok");
    expect(provider.calls[0]!.tools).toEqual([]);
  });
});

describe("runAgent with a memory", () => {
  const remembering = parseGarufile(`
name: bea-test
model: fake/any
prompt: sort the inbox
maxTurns: 4
memory: true
policy:
  - tool: garu.remember
    action: allow
  - tool: garu.forget
    action: allow
  - tool: "*"
    action: block
`);

  it("shows the notebook in the prompt, and the tools add to it and drop from it", async () => {
    const logRoot = mkdtempSync(join(tmpdir(), "garu-"));
    const memory = new Memory(join(logRoot, "memory"));
    memory.add("bea-test", "Lena's newsletters go under FYI", "2026-11-10");
    const provider = new FakeProvider([
      { stopReason: "tool_use", content: [
        { type: "tool_use", id: "m1", name: "garu__remember", input: { note: "Replies to Priya: casual, first names" } },
        { type: "tool_use", id: "m2", name: "garu__forget", input: { note: "Lena's newsletters go under FYI" } },
        { type: "tool_use", id: "m3", name: "garu__forget", input: { note: "never written" } },
      ] },
      { stopReason: "end_turn", content: [{ type: "text", text: "noted" }] },
    ]);
    const res = await runAgent({ garufile: remembering, logRoot, memory, provider, approver: async () => ({ approved: false, by: "t" }) });
    expect(res.status).toBe("ok");
    expect(provider.calls[0]!.system).toContain("Your memory");
    expect(provider.calls[0]!.system).toContain("- 2026-11-10 · Lena's newsletters go under FYI");
    expect(provider.calls[0]!.tools.map((t) => t.name).sort()).toEqual(["garu__forget", "garu__remember"]);
    expect(provider.calls[1]!.messages.at(-1)!.content).toEqual([
      { type: "tool_result", toolUseId: "m1", content: "remembered" },
      { type: "tool_result", toolUseId: "m2", content: "forgotten" },
      { type: "tool_result", toolUseId: "m3", isError: true, content: expect.stringMatching(/^ERROR: no such note/) },
    ]);
    expect(memory.read("bea-test").map((n) => n.text)).toEqual(["Replies to Priya: casual, first names"]);
    // Every note went through the recorder like any other call.
    expect(readRun(res.logPath).filter((e) => e.event.type === "tool.request").map((e) => (e.event as { request: { tool: string } }).request.tool)).toEqual(["remember", "forget", "forget"]);
  });

  it("without memory: true, or without a store, the notebook and its tools stay out of the run", async () => {
    const logRoot = mkdtempSync(join(tmpdir(), "garu-"));
    const off = parseGarufile(`
name: quiet
model: fake/any
prompt: hi
policy:
  - tool: "*"
    action: allow
`);
    const p1 = new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "a" }] }]);
    await runAgent({ garufile: off, logRoot, memory: new Memory(join(logRoot, "memory")), provider: p1, approver: async () => ({ approved: false, by: "t" }) });
    expect(p1.calls[0]!.system).not.toContain("Your memory");
    expect(p1.calls[0]!.tools).toEqual([]);
    const p2 = new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "a" }] }]);
    await runAgent({ garufile: remembering, logRoot, provider: p2, approver: async () => ({ approved: false, by: "t" }) });
    expect(p2.calls[0]!.system).not.toContain("Your memory");
    expect(p2.calls[0]!.tools).toEqual([]);
  });
});

describe("runAgent parking on an ask", () => {
  it("parks the step as it stands, and resumes in the same log with the answer under the original call", async () => {
    const logRoot = mkdtempSync(join(tmpdir(), "garu-"));
    const provider = new FakeProvider([
      { stopReason: "tool_use", content: [
        { type: "tool_use", id: "t1", name: "echo__echo", input: { text: "hello" } },
        { type: "tool_use", id: "t2", name: "echo__add", input: { a: 1, b: 2 } }, // asks: no rule names it
      ] },
    ]);
    const asked: string[] = [];
    const res = await runAgent({
      garufile, logRoot, provider, park: true, host: { hop: 1 }, trigger: "cron:0 7 * * *", input: "a note", owner: "Humberto",
      approver: async (req, _d, ctx) => { asked.push(`${req.tool}:${ctx.parkable}`); return { parked: "req001" }; },
    });
    expect(res.status).toBe("parked");
    expect(res.parked).toEqual({ requests: ["req001"] });
    expect(asked).toEqual(["add:true"]);
    const state = readParked(logRoot, "loop-test", res.runId)!;
    expect(state).toMatchObject({ trigger: "cron:0 7 * * *", input: "a note", owner: "Humberto", host: { hop: 1 }, turn: 1, completed: 1, sent: { calls: 1, writes: 1 } });
    expect(state.step).toEqual([
      { kind: "done", block: { type: "tool_result", toolUseId: "t1", content: "hello" } },
      { kind: "waiting", call: expect.objectContaining({ toolUseId: "t2", name: "echo__add", qualified: "echo.add", args: { a: 1, b: 2 }, requestId: "req001" }) },
    ]);
    const before = readRun(res.logPath).map((e) => e.event.type);
    expect(before.at(-1)).toBe("run.parked");
    expect(before).not.toContain("run.end");

    // The answer came: the run comes back, finishes the step, and goes on.
    const again = new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "3 it is" }] }]);
    const back = await runAgent({
      garufile, logRoot, provider: again, park: true,
      approver: async () => { throw new Error("nothing should ask on the way back"); },
      resume: { parked: state, answers: { req001: { approved: true, by: "humberto (ui)" } } },
    });
    expect(back).toMatchObject({ status: "ok", runId: res.runId, logPath: res.logPath, output: "3 it is", turns: 2 });
    expect(readParked(logRoot, "loop-test", res.runId)).toBeNull();
    const first = again.calls[0]!;
    expect(first.system).toContain("Trigger: cron:0 7 * * *");
    expect(first.system).toContain("Your owner: Humberto.");
    expect(first.system).toContain("This run paused at");
    expect(first.messages[0]).toEqual({ role: "user", content: [{ type: "text", text: "a note" }] });
    expect(first.messages.at(-1)!.content).toEqual([
      { type: "tool_result", toolUseId: "t1", content: "hello" },
      { type: "tool_result", toolUseId: "t2", content: "3" },
    ]);
    const events = readRun(res.logPath);
    const types = events.map((e) => e.event.type);
    expect(types.filter((t) => t === "run.start")).toHaveLength(1);
    expect(types.slice(types.indexOf("run.parked"))).toEqual(["run.parked", "run.resumed", "approval.resolved", "tool.result", "model.turn", "run.end"]);
    const addCall = events.find((e) => e.event.type === "tool.request" && e.event.request.tool === "add")!.event as { callId: string };
    expect(events.find((e) => e.event.type === "approval.resolved")!.event).toMatchObject({ callId: addCall.callId, approved: true, by: "humberto (ui)" });
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  }, 30_000);

  it("a no on the way back reaches the model as DENIED with the note; an answer that vanished as a deny too", async () => {
    const logRoot = mkdtempSync(join(tmpdir(), "garu-"));
    const provider = new FakeProvider([
      { stopReason: "tool_use", content: [
        { type: "tool_use", id: "t1", name: "echo__add", input: { a: 1, b: 2 } },
        { type: "tool_use", id: "t2", name: "echo__fail", input: {} },
      ] },
    ]);
    let n = 0;
    const res = await runAgent({ garufile, logRoot, provider, park: true, approver: async () => ({ parked: `req${++n}` }) });
    expect(res.status).toBe("parked");
    expect(res.parked?.requests.sort()).toEqual(["req1", "req2"]);
    const again = new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "ok then" }] }]);
    const back = await runAgent({
      garufile, logRoot, provider: again, park: true, approver: async () => { throw new Error("no"); },
      resume: { parked: readParked(logRoot, "loop-test", res.runId)!, answers: { req1: { approved: false, by: "humberto (ui)", note: "not now" } } },
    });
    expect(back.status).toBe("ok");
    const results = again.calls[0]!.messages.at(-1)!.content;
    expect(results[0]).toMatchObject({ toolUseId: "t1", isError: true, content: expect.stringMatching(/^DENIED by humberto \(ui\): .*\nThe person who declined said: "not now"/s) });
    expect(results[1]).toMatchObject({ toolUseId: "t2", isError: true, content: expect.stringContaining("DENIED by inbox: request vanished") });
    expect(readRun(res.logPath).filter((e) => e.event.type === "tool.result")).toHaveLength(0);
  }, 30_000);
});

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

  it("a catch-up tells the model when the run was due, in its language, and records it", async () => {
    const provider = new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "listo" }] }]);
    // Due at 23:00 on the 27th in Denver (05:00 UTC on the 28th); running at 00:30 on the 28th after a sleep.
    const due = new Date("2026-10-28T05:00:00.000Z");
    const res = await runAgent({
      garufile: { ...garufile, language: "es" },
      logRoot: mkdtempSync(join(tmpdir(), "garu-")),
      provider,
      approver: async () => ({ approved: false, by: "test-human" }),
      trigger: "catch-up:0 23 * * *",
      dueAt: due,
      now: () => new Date("2026-10-28T06:30:00.000Z"),
    });
    expect(res.status).toBe("ok");
    const system = provider.calls[0]?.system ?? "";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(system).toContain(`This run was due at ${due.toLocaleString("es", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} (local date ${due.toLocaleDateString("en-CA", { timeZone: tz })}; UTC 2026-10-28T05:00:00.000Z)`);
    expect(system).toContain("mean the due time's day, not the current one");
    const start = readRun(res.logPath).find((e) => e.event.type === "run.start")!.event;
    expect(start).toMatchObject({ type: "run.start", trigger: "catch-up:0 23 * * *", dueAt: "2026-10-28T05:00:00.000Z" });
    // A run on time says nothing about a due time.
    const onTime = new FakeProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "ok" }] }]);
    const plain = await runAgent({ garufile, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider: onTime, approver: async () => ({ approved: false, by: "t" }) });
    expect(onTime.calls[0]?.system).not.toContain("This run was due");
    expect(readRun(plain.logPath).find((e) => e.event.type === "run.start")!.event).not.toHaveProperty("dueAt");
  }, 30_000);

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
    expect(provider.calls[0]?.tools.map((t) => t.name).sort()).toEqual(["echo__add", "echo__cut_read", "echo__cut_write", "echo__echo", "echo__fail", "echo__peek"]);
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

  it("a run the network cut off after read-only steps only is offline too: nothing changed, so it can be caught up", async () => {
    // Tomay's morning of 2026-10-28: two turns, three calls that only read, then the computer slept through the third model call.
    const provider = sleepyProvider([
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "a", name: "echo__peek", input: {} }, { type: "tool_use", id: "b", name: "echo__peek", input: {} }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "c", name: "echo__peek", input: {} }] },
    ]);
    const res = await runAgent({ garufile, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider, approver: async () => ({ approved: false, by: "t" }), trigger: "cron:0 7 * * 1-5" });
    expect(res).toMatchObject({ status: "error", offline: true, turns: 2 });
    expect(res.output).toBe("no network after 3 read-only steps; will catch up: gemini gemini-3.5-flash-lite: can't reach the network (The operation was aborted due to timeout)");
    const events = readRun(res.logPath).map((e) => e.event);
    expect(events.filter((e) => e.type === "tool.result" && e.ok)).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ type: "run.end", status: "error", offline: true, summary: expect.stringMatching(/^no network after 3 read-only steps; will catch up/) });
  }, 30_000);

  it("a run the network cut off after a call that may have written stands as an error: never replayed", async () => {
    // echo.echo carries no readOnlyHint, so as far as Garu knows it changed something.
    const provider = sleepyProvider([
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "a", name: "echo__peek", input: {} }, { type: "tool_use", id: "b", name: "echo__echo", input: { text: "written" } }] },
    ]);
    const res = await runAgent({ garufile, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider, approver: async () => ({ approved: false, by: "t" }), trigger: "cron:0 7 * * 1-5" });
    expect(res).toMatchObject({ status: "error", turns: 1 });
    expect(res.offline).toBeUndefined();
    expect(res.output).toBe("gemini gemini-3.5-flash-lite: can't reach the network (The operation was aborted due to timeout)");
    expect(readRun(res.logPath).at(-1)!.event).not.toHaveProperty("offline");
  }, 30_000);

  it("a call that never went out (blocked, declined, unknown) changes nothing; a run by hand says no catch-up", async () => {
    const provider = sleepyProvider([
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "a", name: "echo__danger", input: { target: "prod" } }, { type: "tool_use", id: "b", name: "echo__add", input: { a: 1, b: 2 } }] },
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "c", name: "echo__peek", input: {} }] },
    ]);
    const res = await runAgent({ garufile, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider, approver: async () => ({ approved: false, by: "t" }) });
    expect(res).toMatchObject({ status: "error", offline: true, turns: 2 });
    // One step went out, and "manual" has no schedule to catch it up.
    expect(res.output).toMatch(/^no network after 1 read-only step: gemini/);
  }, 30_000);

  it("a turn with no words and no tools is an error unless the model really finished", async () => {
    const cut = new FakeProvider([{ stopReason: "max_tokens", content: [], usage: { inputTokens: 10, outputTokens: 0 } }]);
    const res = await runAgent({ garufile, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider: cut, approver: async () => ({ approved: false, by: "t" }) });
    expect(res.status).toBe("error");
    expect(res.output).toMatch(/ran out of room before writing anything \(max_tokens\)/);
    expect(res.offline).toBeUndefined();
    const end = readRun(res.logPath).find((e) => e.event.type === "run.end")!.event;
    expect(end).toMatchObject({ type: "run.end", status: "error", summary: expect.stringMatching(/max_tokens/) });

    const odd = new FakeProvider([{ stopReason: "other", content: [] }]);
    const res2 = await runAgent({ garufile, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider: odd, approver: async () => ({ approved: false, by: "t" }) });
    expect(res2).toMatchObject({ status: "error", output: "the model stopped without an answer (other)" });

    // A proper end of turn with nothing to say is still a finished run (nothing to report).
    const quiet = new FakeProvider([{ stopReason: "end_turn", content: [] }]);
    const res3 = await runAgent({ garufile, logRoot: mkdtempSync(join(tmpdir(), "garu-")), provider: quiet, approver: async () => ({ approved: false, by: "t" }) });
    expect(res3.status).toBe("ok");
  }, 30_000);

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
