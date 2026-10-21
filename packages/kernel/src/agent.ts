import { ModelQuotaError } from "./providers/gemini.js";
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
import { ToolBus, extractText, type Approver } from "./bus.js";
import { holdAwake } from "./awake.js";
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
  status: "ok" | "error" | "blocked" | "max_turns" | "budget_exceeded";
  /** The model's final text, if any. */
  output: string;
  turns: number;
  /** Estimated spend for this run. null when the model has no known price. */
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  /** The network was down before the model ever answered. The schedule treats such a run as not run. */
  offline?: boolean;
  /** The run stopped because the model's daily quota is used up. */
  quota?: ModelQuota;
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

  const recorder = new Recorder({ root: opts.logRoot, agent: g.name, ...(opts.sink ? { sink: opts.sink } : {}) });
  const policy = new PolicyEngine(g.policy);
  const bus = new ToolBus({ policy, recorder, approver: opts.approver, agent: g.name, ...(g.sandbox ? { sandbox: g.sandbox } : {}) });
  const release = holdAwake();

  const trigger = opts.trigger ?? "manual";
  recorder.record({
    type: "run.start",
    agent: g.name,
    model: g.model,
    trigger,
    ...(g.sandbox ? { sandbox: { image: g.sandbox.image, network: g.sandbox.network } } : {}),
  });

  let status: RunResult["status"] = "ok";
  let output = "";
  let turn = 0;

  let totalCost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  // Turns the model actually answered. `turn` counts attempts, so an error mid-call doesn't inflate it.
  let completed = 0;
  // A priced model that reports no usage can't be metered: the run says so instead of claiming a price.
  let unmetered = false;
  // The network was down before the model ever answered: not a run, as far as the schedule is concerned.
  let offline = false;
  let quota: ModelQuota | undefined;

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
    recorder.record({ type: "tools.offered", offered: known, hidden });

    // The Garufile prompt is who the agent is and what its job is: it lives in the system prompt.
    // The user turn is what this particular run is about: a chat message, a note, or simply "do your job".
    const userText = opts.input ?? "Carry out your standing instructions now.";
    const messages: ModelMessage[] = [{ role: "user", content: [{ type: "text", text: userText }] }];
    const now = (opts.now ?? (() => new Date()))();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Spelled out in local time: given only a UTC timestamp, models get the weekday wrong, and after
    // 6 PM in Denver the UTC date is already tomorrow's. In the agent's language, so a brief's title
    // ("martes, 13 de octubre") is copied, not translated.
    const local = now.toLocaleString(g.language ?? "en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    const localDate = now.toLocaleDateString("en-CA", { timeZone: tz });
    const system = [
      SYSTEM_PREAMBLE,
      `Agent: ${g.name}${g.description ? ` — ${g.description}` : ""}`,
      ...(opts.owner ? [`Your owner: ${opts.owner}.`] : []),
      ...(g.language ? [`Language: write everything meant for your owner (summaries, documents, notes, chat replies) in ${languageName(g.language)}. Answer an email in the language it was written in.`] : []),
      `Trigger: ${trigger}`,
      `Current time: ${local}, ${tz} (local date ${localDate}; UTC ${now.toISOString()}). Use this for any date, day of the week or timestamp; never work them out or guess.`,
      `Your standing instructions:\n${g.prompt.trim()}`,
      `The user message that follows is what this run is about. If it asks a question, answer it. If it asks for work, do it. If it only says to carry out your standing instructions, do exactly that. Never do work the message asked you not to do.`,
    ].join("\n\n");

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
      const results: ContentBlock[] = await Promise.all(toolUses.map(async (tu): Promise<ContentBlock> => {
        const qualified = fromModelToolName(tu.name, known);
        if (!qualified) return { type: "tool_result", toolUseId: tu.id, content: `unknown tool ${tu.name}`, isError: true };
        const out = await bus.call(qualified, tu.input);
        switch (out.status) {
          case "ok":
            return { type: "tool_result", toolUseId: tu.id, content: extractText(out.result) || JSON.stringify(out.result) };
          case "blocked":
            return { type: "tool_result", toolUseId: tu.id, isError: true, content: `BLOCKED by policy: ${out.decision.reason}` };
          case "denied":
            return {
              type: "tool_result",
              toolUseId: tu.id,
              isError: true,
              content: `DENIED by ${out.by}: ${out.decision.reason}` + (out.note ? `\nThe person who declined said: "${out.note}". Act on this before doing anything else — correct the mistake if there is one, and do not repeat it in later calls.` : ""),
            };
          case "error":
            return { type: "tool_result", toolUseId: tu.id, isError: true, content: `ERROR: ${out.error}` };
        }
      }));
      messages.push({ role: "user", content: results });
    }

    if (status === "ok" && turn >= g.maxTurns && !output) status = "max_turns";
  } catch (e) {
    status = "error";
    const err = e as Error;
    offline = completed === 0 && isConnectionError(err);
    if (err instanceof ModelQuotaError) quota = { model: err.model, retryAt: err.retryAt, ...(err.limit !== undefined ? { limit: err.limit } : {}) };
    recorder.record({ type: "error", message: err.message, ...(err.stack ? { stack: err.stack } : {}) });
    output = offline ? `no network: ${err.message}` : err.message;
  } finally {
    release();
    await bus.close();
    recorder.record({
      type: "run.end",
      status,
      costUsd: totalCost,
      priced: price !== null && !unmetered,
      ...(offline ? { offline: true } : {}),
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
    turns: completed,
    costUsd: price ? totalCost : null,
    inputTokens,
    outputTokens,
    ...(offline ? { offline: true } : {}),
  };
}
