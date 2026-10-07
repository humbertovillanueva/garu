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
}

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

  const recorder = new Recorder({ root: opts.logRoot, agent: g.name, ...(opts.sink ? { sink: opts.sink } : {}) });
  const policy = new PolicyEngine(g.policy);
  const bus = new ToolBus({ policy, recorder, approver: opts.approver });

  const trigger = opts.trigger ?? "manual";
  recorder.record({ type: "run.start", agent: g.name, model: g.model, trigger });

  let status: RunResult["status"] = "ok";
  let output = "";
  let turn = 0;

  const price = g.budget.pricing ?? priceFor(g.model);
  const maxCost = g.budget.maxCostUsd;
  let totalCost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  if (maxCost !== undefined && !price) {
    throw new Error(
      `budget.maxCostUsd is set but "${g.model}" has no known price; add budget.pricing to the Garufile`,
    );
  }

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

    const userText = opts.input ? `${g.prompt}\n\n---\nInput for this run:\n${opts.input}` : g.prompt;
    const messages: ModelMessage[] = [{ role: "user", content: [{ type: "text", text: userText }] }];
    const now = (opts.now ?? (() => new Date()))();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const system = [
      SYSTEM_PREAMBLE,
      `Agent: ${g.name}${g.description ? ` — ${g.description}` : ""}`,
      `Trigger: ${trigger}`,
      `Current time: ${now.toISOString()} (${tz}). Use this for any timestamp; never guess the date.`,
    ].join("\n\n");

    while (turn < g.maxTurns) {
      turn++;
      const res = await provider.complete({ model, system, messages, tools });
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
      if (maxCost !== undefined && totalCost >= maxCost) {
        recorder.record({ type: "budget.exceeded", costUsd: totalCost, maxCostUsd: maxCost, pendingToolCalls: toolUses.length });
        status = "budget_exceeded";
        output = text || `stopped: estimated cost reached the budget cap`;
        break;
      }

      const results: ContentBlock[] = [];
      for (const tu of toolUses) {
        const qualified = fromModelToolName(tu.name, known);
        if (!qualified) {
          results.push({ type: "tool_result", toolUseId: tu.id, content: `unknown tool ${tu.name}`, isError: true });
          continue;
        }
        const out = await bus.call(qualified, tu.input);
        switch (out.status) {
          case "ok":
            results.push({ type: "tool_result", toolUseId: tu.id, content: extractText(out.result) || JSON.stringify(out.result) });
            break;
          case "blocked":
            results.push({ type: "tool_result", toolUseId: tu.id, isError: true, content: `BLOCKED by policy: ${out.decision.reason}` });
            break;
          case "denied":
            results.push({ type: "tool_result", toolUseId: tu.id, isError: true, content: `DENIED by ${out.by}: ${out.decision.reason}` });
            break;
          case "error":
            results.push({ type: "tool_result", toolUseId: tu.id, isError: true, content: `ERROR: ${out.error}` });
            break;
        }
      }
      messages.push({ role: "user", content: results });
    }

    if (status === "ok" && turn >= g.maxTurns && !output) status = "max_turns";
  } catch (e) {
    status = "error";
    const err = e as Error;
    recorder.record({ type: "error", message: err.message, ...(err.stack ? { stack: err.stack } : {}) });
    output = err.message;
  } finally {
    await bus.close();
    recorder.record({
      type: "run.end",
      status,
      costUsd: totalCost,
      priced: price !== null,
      ...(output ? { summary: output.slice(0, 200) } : {}),
    });
  }

  return {
    runId: recorder.runId,
    logPath: recorder.path,
    status,
    output,
    turns: turn,
    costUsd: price ? totalCost : null,
    inputTokens,
    outputTokens,
  };
}
