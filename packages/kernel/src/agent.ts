import { ModelQuotaError, ModelBusyError } from "./providers/gemini.js";
/**
 * The agent loop.
 *
 *   model turn → tool calls (through the bus, through policy) → results back → repeat
 *
 * until the model stops asking for tools, or maxTurns is hit. Every step is
 * recorded. A blocked or denied call is reported back to the model as a
 * tool error so it can adapt instead of pretending the call succeeded.
 */
import type { Garufile } from "./garufile.js";
import { ToolBus, extractText, type Approver, type BuiltinTool, type CallOutcome } from "./bus.js";
import { holdAwake, watchSleep } from "./awake.js";
import { memoryPrompt, memoryTools, type Memory } from "./memory.js";
import { removeParked, writeParked, type ParkedRun, type ParkedStep } from "./park.js";
import { PolicyEngine } from "./policy.js";
import { Recorder, type Envelope } from "./recorder.js";
import { fromModelToolName, splitModelId, toModelToolName, type ContentBlock, type ModelMessage, type ModelProvider, type ModelTool } from "./provider.js";
import { getProvider } from "./providers/index.js";
import { costOf, priceFor } from "./pricing.js";

export interface RunOptions {
  garufile: Garufile;
  /** Where flight-recorder logs go. */
  logRoot: string;
  approver: Approver;
  trigger?: string;
  /** Override provider lookup (tests). */
  provider?: ModelProvider;
  /** Extra text appended to the prompt for this run (e.g. a webhook payload). */
  input?: string;
  /** Mirror of recorder events (pretty printing). */
  sink?: (e: Envelope) => void;
  /** Clock, injectable for tests. */
  now?: () => Date;
  /** The person the agent works for, by name, so it can address them; the Garufile's prompt says "your owner". */
  owner?: string;
  /** Where the agents' notebooks live. A Garufile with `memory: true` gets its own; without a store here, memory stays off. */
  memory?: Memory;
  /** A catch-up: when the schedule meant this run to happen. The model is told, so "today" means that day. */
  dueAt?: Date;
  /**
   * The other agents, when the run happens where they live (the control room). With it the model is
   * offered one more tool, garu.ask, policed like any other: `tool: garu.ask` with `when: { agent: … }`.
   */
  ask?: AskAgents;
  /**
   * The run may park: when an ask isn't answered within the approver's hold, the loop saves the
   * conversation beside its log and ends as "parked" instead of holding the computer and a tool
   * server for hours. The host starts it again with `resume` once the answer is in.
   */
  park?: boolean;
  /** Kept in the parked state for the host, untouched (the control room stores the ask depth). */
  host?: Record<string, unknown>;
  /** A parked run coming back: its saved state, and the answer to each request it waited on, by request id. */
  resume?: { parked: ParkedRun; answers: Record<string, { approved: boolean; by: string; note?: string }> };
}

/** How a run reaches the owner's other agents. The control room supplies it; a bare `garu run` has none. */
export interface AskAgents {
  /** The agents this one may ring: every other agent with a webhook door. For the tool's description. */
  agents(): string[];
  /** Ring another agent's door with a message and wait for its answer. Throws with a plain reason when it can't (no such agent, no door, busy, too many agents in a row). */
  ask(target: string, message: string): Promise<{ status: string; output: string }>;
}

/** The one tool Garu provides itself: ask another agent, and get what it wrote back. */
export function askTool(self: string, ask: AskAgents): BuiltinTool {
  const names = ask.agents().filter((n) => n !== self);
  return {
    server: "garu",
    name: "ask",
    description:
      `Ask another of your owner's agents a question and get its answer. Each is an expert on its own job and answers with its own tools, under its own rules; what it writes back is your result. ` +
      (names.length ? `Agents you can ask: ${names.join(", ")}.` : `No other agent can be asked right now.`),
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "The agent's name, exactly as listed." },
        message: { type: "string", description: "Your question, with the context it needs to answer." },
      },
      required: ["agent", "message"],
    },
    readOnly: false,
    call: async (args) => {
      const agent = typeof args["agent"] === "string" ? args["agent"].trim() : "";
      const message = typeof args["message"] === "string" ? args["message"].trim() : "";
      if (!agent || !message) return { text: "garu.ask needs an agent and a message", isError: true };
      try {
        const r = await ask.ask(agent, message);
        if (r.status === "parked") return { text: `${agent} is waiting on its owner's answer to a question of its own and will finish later; it can't answer you now. Go on with what you have, or say it should be asked another time.`, isError: true };
        if (r.status !== "ok") return { text: `${agent} could not answer (its run ended ${r.status})${r.output ? `: ${r.output}` : ""}`, isError: true };
        return { text: r.output.trim() || `${agent} answered with nothing to say` };
      } catch (e) {
        return { text: (e as Error).message, isError: true };
      }
    },
  };
}

/** "es" → "Spanish", for the one line that tells the model which language to write in. */
function languageName(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code; } catch { return code; }
}

/** The model's daily quota is used up: which model, and when it resets. */
export type ModelQuota = { model: string; retryAt: string; limit?: number };

export interface RunResult {
  runId: string;
  logPath: string;
  status: "ok" | "error" | "blocked" | "max_turns" | "budget_exceeded" | "parked";
  /** The model's final text, if any. */
  output: string;
  turns: number;
  /** Estimated spend for this run. null when the model has no known price. */
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  /**
   * The network went away before the run changed anything out there: no model answer yet, or only
   * calls to tools their servers mark read-only. The schedule treats such a run as not run and catches up.
   */
  offline?: boolean;
  /** The model was busy through every retry; with `offline`, the run did nothing and the schedule tries again. */
  busy?: { model: string; reason: string };
  /** The run stopped because the model's daily quota is used up. */
  quota?: ModelQuota;
  /** The run put itself away, waiting on these inbox requests; it ends when it resumes. */
  parked?: { requests: string[] };
}

/** What the model is told about one call, whatever became of it. */
function resultBlock(out: CallOutcome, toolUseId: string): ContentBlock {
  switch (out.status) {
    case "ok":
      return { type: "tool_result", toolUseId, content: extractText(out.result) || JSON.stringify(out.result) };
    case "blocked":
      return { type: "tool_result", toolUseId, isError: true, content: `BLOCKED by policy: ${out.decision.reason}` };
    case "denied":
      return {
        type: "tool_result",
        toolUseId,
        isError: true,
        content: `DENIED by ${out.by}: ${out.decision.reason}` + (out.note ? `\nThe person who declined said: "${out.note}". Act on this before doing anything else — correct the mistake if there is one, and do not repeat it in later calls.` : ""),
      };
    case "error":
      return { type: "tool_result", toolUseId, isError: true, content: `ERROR: ${out.error}` };
    case "parked":
      // Never reaches the model: a parked call is saved, not answered. Here only so every outcome has a line.
      return { type: "tool_result", toolUseId, isError: true, content: `ERROR: waiting for an answer` };
  }
}

/** The model answered busy (high demand, rate limited) through every retry: the error, or null. */
export function modelBusy(e: unknown): ModelBusyError | null {
  const seen = new Set<unknown>();
  for (let cur = e; cur && typeof cur === "object" && !seen.has(cur); cur = (cur as { cause?: unknown }).cause) {
    seen.add(cur);
    if (cur instanceof ModelBusyError) return cur;
  }
  return null;
}

/** The network, not the model, failed: fetch's "fetch failed", a DNS or socket error, a timeout, Ollama unreachable. */
export function isConnectionError(e: unknown): boolean {
  const seen = new Set<unknown>();
  for (let cur = e; cur && typeof cur === "object" && !seen.has(cur); cur = (cur as { cause?: unknown }).cause) {
    seen.add(cur);
    const { name, code, message } = cur as { name?: string; code?: string; message?: string };
    if (name === "TimeoutError" || name === "AbortError") return true;
    if (code && /^(ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE|UND_ERR_(CONNECT_TIMEOUT|SOCKET))$/.test(code)) return true;
    if (message && /fetch failed|can't reach|network error|socket hang up|connection error|getaddrinfo/i.test(message)) return true;
  }
  return false;
}

const SYSTEM_PREAMBLE = `You are an autonomous agent running inside Garu.
Every tool call you make passes through a policy kernel. Some calls will be blocked or
denied by the human; when that happens you will receive an error — do not retry the
same call, explain what you could not do and continue with what you can.
When you are finished, reply with a short plain summary of what you did.`;

export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const g = opts.garufile;
  const { provider: providerId, model } = splitModelId(g.model);
  const provider = opts.provider ?? getProvider(providerId);

  // Refused before anything is recorded: a run that can't start must not leave a "running" run behind.
  const price = g.budget.pricing ?? priceFor(g.model);
  const maxCost = g.budget.maxCostUsd;
  if (maxCost !== undefined && !price) {
    throw new Error(
      `budget.maxCostUsd is set but "${g.model}" has no known price; add budget.pricing to the Garufile`,
    );
  }

  // A parked run coming back: same run id, same log, and the state file goes first thing, so a run
  // killed halfway through its resume is never resumed twice (an approved call must not go out twice).
  const parked = opts.resume?.parked;
  if (parked) removeParked(opts.logRoot, g.name, parked.runId);
  const recorder = new Recorder({ root: opts.logRoot, agent: g.name, ...(parked ? { runId: parked.runId, resume: true } : {}), ...(opts.sink ? { sink: opts.sink } : {}) });
  const policy = new PolicyEngine(g.policy);
  const memory = g.memory ? opts.memory : undefined;
  const builtins = [...(opts.ask ? [askTool(g.name, opts.ask)] : []), ...(memory ? memoryTools(memory, g.name) : [])];
  const bus = new ToolBus({ policy, recorder, approver: opts.approver, agent: g.name, parkable: opts.park === true, ...(g.sandbox ? { sandbox: g.sandbox } : {}), ...(builtins.length ? { builtins } : {}) });
  const release = holdAwake();
  // A nap mid-run goes in the log, so an hour-long step reads as what it was. A recorder that can't
  // write fails the run loudly at its next event; a timer callback isn't the place to throw.
  const stopWatching = watchSleep((s) => {
    try { recorder.record({ type: "host.slept", since: s.since.toISOString(), ms: s.ms }); } catch { /* the loop's next record fails loudly */ }
  });

  const trigger = parked?.trigger ?? opts.trigger ?? "manual";
  const input = parked ? parked.input : opts.input;
  const dueAt = parked ? (parked.dueAt ? new Date(parked.dueAt) : undefined) : opts.dueAt;
  const owner = parked ? parked.owner : opts.owner;
  if (parked) recorder.record({ type: "run.resumed", parkedAt: parked.parkedAt });
  else
    recorder.record({
      type: "run.start",
      agent: g.name,
      model: g.model,
      trigger,
      ...(g.sandbox ? { sandbox: { image: g.sandbox.image, network: g.sandbox.network } } : {}),
      ...(dueAt ? { dueAt: dueAt.toISOString() } : {}),
    });

  let status: RunResult["status"] = "ok";
  let output = "";
  let turn = parked?.turn ?? 0;

  let totalCost = parked?.totalCost ?? 0;
  let inputTokens = parked?.inputTokens ?? 0;
  let outputTokens = parked?.outputTokens ?? 0;
  // Turns the model actually answered. `turn` counts attempts, so an error mid-call doesn't inflate it.
  let completed = parked?.completed ?? 0;
  // A priced model that reports no usage can't be metered: the run says so instead of claiming a price.
  let unmetered = parked?.unmetered ?? false;
  // The network went away before anything out there changed: not a run, as far as the schedule is concerned.
  let offline = false;
  let busy: { model: string; reason: string } | undefined;
  let quota: ModelQuota | undefined;
  let parkedNow: { requests: string[] } | undefined;

  try {
    await bus.connect(g.tools);
    // Tools the policy blocks unconditionally are never shown to the model: fewer wasted turns, less temptation.
    const visible = bus.listTools().filter((t) => policy.staticDecision({ server: t.server, tool: t.name }) !== "block");
    const hidden = bus.listTools().filter((t) => !visible.includes(t)).map((t) => t.qualified);
    const known = visible.map((t) => t.qualified);
    const tools: ModelTool[] = visible.map((t) => ({
      name: toModelToolName(t.qualified),
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    if (!parked) recorder.record({ type: "tools.offered", offered: known, hidden });

    // The Garufile prompt is who the agent is and what its job is: it lives in the system prompt.
    // The user turn is what this particular run is about: a chat message, a note, or simply "do your job".
    const userText = input ?? "Carry out your standing instructions now.";
    const messages: ModelMessage[] = parked ? parked.messages : [{ role: "user", content: [{ type: "text", text: userText }] }];
    const now = (opts.now ?? (() => new Date()))();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Spelled out in local time: given only a UTC timestamp, models get the weekday wrong, and after
    // 6 PM in Denver the UTC date is already tomorrow's. In the agent's language, so a brief's title
    // ("martes, 13 de octubre") is copied, not translated.
    const spell = (d: Date) => d.toLocaleString(g.language ?? "en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
    const local = spell(now);
    const localDate = dayOf(now);
    // A catch-up after midnight for a run due the evening before: without this, "today" is the wrong day.
    const due = dueAt;
    const system = [
      SYSTEM_PREAMBLE,
      `Agent: ${g.name}${g.description ? ` — ${g.description}` : ""}`,
      ...(owner ? [`Your owner: ${owner}.`] : []),
      ...(g.language ? [`Language: write everything meant for your owner (summaries, documents, notes, chat replies) in ${languageName(g.language)}. Answer an email in the language it was written in.`] : []),
      ...(memory ? [memoryPrompt(memory.read(g.name))] : []),
      `Trigger: ${trigger}`,
      `Current time: ${local}, ${tz} (local date ${localDate}; UTC ${now.toISOString()}). Use this for any date, day of the week or timestamp; never work them out or guess.`,
      ...(due ? [`This run was due at ${spell(due)} (local date ${dayOf(due)}; UTC ${due.toISOString()}) and is running late: the computer was asleep or off. "Today", "tonight" and the local date your instructions refer to mean the due time's day, not the current one.`] : []),
      ...(parked ? [`This run paused at ${spell(new Date(parked.parkedAt))} while your owner was asked about one of your calls, and resumed now: the answer is in the tool results that follow. Carry on from there; don't start over.`] : []),
      `Your standing instructions:\n${g.prompt.trim()}`,
      `The user message that follows is what this run is about. If it asks a question, answer it. If it asks for work, do it. If it only says to carry out your standing instructions, do exactly that. Never do work the message asked you not to do.`,
    ].join("\n\n");

    // Coming back: the step the run stopped in is finished first. Calls that were done stay as they
    // were; the ones that waited get their answer recorded and go out now, or come back as DENIED.
    if (parked) {
      const answers = opts.resume!.answers;
      const results: ContentBlock[] = await Promise.all(parked.step.map(async (s): Promise<ContentBlock> => {
        if (s.kind === "done") return s.block;
        const c = s.call;
        const answer = answers[c.requestId] ?? { approved: false, by: "inbox: request vanished" };
        return resultBlock(await bus.callDecided(c.qualified, c.args, c.callId, c.decision, answer), c.toolUseId);
      }));
      messages.push({ role: "user", content: results });
    }

    while (turn < g.maxTurns) {
      turn++;
      const res = await provider.complete({
        model, system, messages, tools, options: g.modelOptions,
        onRetry: (r) => recorder.record({ type: "model.retry", attempt: r.attempt, maxAttempts: r.maxAttempts, waitMs: r.waitMs, reason: r.reason }),
      });
      completed++;
      if (price && !res.usage) unmetered = true;
      const text = res.content.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
      let turnCost: number | undefined;
      if (res.usage) {
        inputTokens += res.usage.inputTokens;
        outputTokens += res.usage.outputTokens;
        if (price) {
          turnCost = costOf(price, res.usage.inputTokens, res.usage.outputTokens);
          totalCost += turnCost;
        }
      }
      recorder.record({
        type: "model.turn",
        turn,
        ...(res.usage ? { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens } : {}),
        ...(turnCost !== undefined ? { costUsd: turnCost, totalCostUsd: totalCost } : {}),
        ...(text ? { text } : {}),
      });
      messages.push({ role: "assistant", content: res.content });

      const toolUses = res.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
      if (toolUses.length === 0) {
        // No tools and no words: only a proper end of turn makes that a finished run. A reply cut off
        // before its first word, or stopped for a reason the provider doesn't name, is an error that says so.
        if (!text && res.stopReason !== "end_turn") {
          throw new Error(
            res.stopReason === "max_tokens"
              ? "the model ran out of room before writing anything (max_tokens): the answer was cut off at its start"
              : `the model stopped without an answer (${res.stopReason})`,
          );
        }
        output = text;
        break;
      }

      // Money guard: the turn we just paid for is recorded; nothing further runs.
      // A free model at a cap of 0 has spent nothing, so it carries on; a paid one stops at its first cent.
      if (maxCost !== undefined && totalCost > 0 && totalCost >= maxCost) {
        recorder.record({ type: "budget.exceeded", costUsd: totalCost, maxCostUsd: maxCost, pendingToolCalls: toolUses.length });
        status = "budget_exceeded";
        output = text || `stopped: estimated cost reached the budget cap`;
        break;
      }

      // Every call the model made in this step goes out together. When two of them need a yes,
      // both cards reach the inbox at once instead of the second waiting on the first; the results
      // still go back to the model in the order it asked.
      const outs = await Promise.all(toolUses.map(async (tu) => {
        const qualified = fromModelToolName(tu.name, known);
        const out: (CallOutcome & { callId: string }) | null = qualified ? await bus.call(qualified, tu.input) : null;
        return { tu, qualified, out };
      }));
      const blockOf = (o: (typeof outs)[number]): ContentBlock => o.out ? resultBlock(o.out, o.tu.id) : { type: "tool_result", toolUseId: o.tu.id, content: `unknown tool ${o.tu.name}`, isError: true };
      // One of them is waiting on a person and the hold is over: the whole step is saved as it stands
      // and the run puts itself away. The calls that finished keep their results; the waiting ones are
      // made when the answer comes, under the same call ids, in this same log.
      const waiting = outs.filter((o) => o.out?.status === "parked");
      if (waiting.length) {
        const sent = bus.sentSoFar();
        const step: ParkedStep[] = outs.map((o): ParkedStep =>
          o.out?.status === "parked"
            ? { kind: "waiting", call: { toolUseId: o.tu.id, name: o.tu.name, qualified: o.qualified!, args: o.tu.input, callId: o.out.callId, requestId: o.out.requestId, decision: o.out.decision } }
            : { kind: "done", block: blockOf(o) },
        );
        const requests = waiting.map((o) => (o.out as { requestId: string }).requestId);
        const host = parked?.host ?? opts.host;
        writeParked(opts.logRoot, {
          version: 1,
          agent: g.name,
          runId: recorder.runId,
          trigger,
          parkedAt: (opts.now ?? (() => new Date()))().toISOString(),
          ...(input !== undefined ? { input } : {}),
          ...(dueAt ? { dueAt: dueAt.toISOString() } : {}),
          ...(owner !== undefined ? { owner } : {}),
          ...(host ? { host } : {}),
          messages,
          step,
          turn,
          completed,
          totalCost,
          inputTokens,
          outputTokens,
          unmetered,
          sent: { calls: (parked?.sent.calls ?? 0) + sent.calls, writes: (parked?.sent.writes ?? 0) + sent.writes },
        });
        recorder.record({ type: "run.parked", requests });
        status = "parked";
        parkedNow = { requests };
        break;
      }
      messages.push({ role: "user", content: outs.map(blockOf) });
    }

    if (status === "ok" && turn >= g.maxTurns && !output) status = "max_turns";
  } catch (e) {
    status = "error";
    const err = e as Error;
    // The network went away (the computer slept). When every call that went out was to a tool its
    // server marks read-only, nothing out there changed and the run can be tried again from the start:
    // it is "offline", the schedule doesn't count it and catches up. One call to a tool without that
    // mark, and the run stands as an error: a brief written or a message posted must not happen twice.
    // A model that stayed busy through every retry is the same case: nothing was done, try again later.
    const sent = bus.sentSoFar();
    const b = modelBusy(err);
    offline = (isConnectionError(err) || b !== null) && sent.allReadOnly && (parked?.sent.writes ?? 0) === 0;
    if (b && offline) busy = { model: b.model, reason: b.reason };
    if (err instanceof ModelQuotaError) quota = { model: err.model, retryAt: err.retryAt, ...(err.limit !== undefined ? { limit: err.limit } : {}) };
    recorder.record({ type: "error", message: err.message, ...(err.stack ? { stack: err.stack } : {}) });
    const scheduled = /^(cron|catch-up):/.test(trigger);
    const why = busy ? `model busy (${busy.reason})` : "no network";
    const again = busy ? "; will try again" : "; will catch up";
    output = !offline ? err.message
      : sent.calls === 0 ? `${why}: ${err.message}`
      : `${why} after ${sent.calls} read-only step${sent.calls === 1 ? "" : "s"}${scheduled ? again : ""}: ${err.message}`;
  } finally {
    stopWatching();
    release();
    await bus.close();
    // A parked run hasn't ended: its run.end comes when it resumes and finishes.
    if (status !== "parked")
      recorder.record({
        type: "run.end",
        status,
        costUsd: totalCost,
        priced: price !== null && !unmetered,
        ...(offline ? { offline: true } : {}),
        ...(busy ? { busy } : {}),
        ...(quota ? { quota } : {}),
        ...(output ? { summary: output.slice(0, 200) } : {}),
      });
  }

  return {
    runId: recorder.runId,
    logPath: recorder.path,
    status,
    output,
    ...(quota ? { quota } : {}),
    ...(parkedNow ? { parked: parkedNow } : {}),
    turns: completed,
    costUsd: price ? totalCost : null,
    inputTokens,
    outputTokens,
    ...(offline ? { offline: true } : {}),
    ...(busy ? { busy } : {}),
  };
}
