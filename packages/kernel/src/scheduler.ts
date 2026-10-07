/**
 * Scheduler — what makes an agent "always-on".
 *
 * Loads Garufiles, fires each agent on its cron triggers, and keeps the
 * basic promises: one run of an agent at a time (a slow run never piles up
 * behind itself), every fire and skip is visible, and shutdown waits for
 * in-flight runs instead of killing them mid-tool-call.
 */
import { Cron } from "croner";
import type { Garufile } from "./garufile.js";
import type { RunResult } from "./agent.js";

export interface ScheduledAgent {
  garufile: Garufile;
  /** Where it was loaded from; shown in logs. */
  source: string;
}

export type SchedulerEvent =
  | { type: "scheduled"; agent: string; cron: string; nextRun: Date | null }
  | { type: "fire"; agent: string; cron: string }
  | { type: "skip.overlap"; agent: string; cron: string }
  | { type: "run.done"; agent: string; result: RunResult }
  | { type: "run.failed"; agent: string; error: string }
  | { type: "stopping"; inFlight: number }
  | { type: "stopped" };

/** Runs one agent once. Injected so the scheduler can be tested without models or MCP servers. */
export type Runner = (agent: ScheduledAgent, trigger: string) => Promise<RunResult>;

/** Cron engine abstraction: schedule `cb` on `pattern`; returns a handle. Injected for tests. */
export interface CronHandle {
  stop(): void;
  nextRun(): Date | null;
}
export type CronFactory = (pattern: string, cb: () => void) => CronHandle;

export const defaultCronFactory: CronFactory = (pattern, cb) => {
  const job = new Cron(pattern, { protect: true }, cb);
  return { stop: () => job.stop(), nextRun: () => job.nextRun() };
};

/** Throws with a readable message if the cron pattern is invalid. */
export function assertValidCron(pattern: string): void {
  try {
    new Cron(pattern, { paused: true }).stop();
  } catch (e) {
    throw new Error(`invalid cron "${pattern}": ${(e as Error).message}`);
  }
}

export interface SchedulerOptions {
  runner: Runner;
  onEvent?: (e: SchedulerEvent) => void;
  cronFactory?: CronFactory;
}

export class Scheduler {
  private readonly handles: CronHandle[] = [];
  private readonly inFlight = new Map<string, Promise<void>>();
  private stopping = false;

  constructor(private readonly opts: SchedulerOptions) {}

  /** Register every cron trigger of every agent. Agents without cron triggers are ignored (they're `garu run` agents). */
  start(agents: readonly ScheduledAgent[]): number {
    let count = 0;
    for (const a of agents) {
      for (const t of a.garufile.triggers) {
        if (!t.cron) continue;
        assertValidCron(t.cron);
        const cron = t.cron;
        const handle = (this.opts.cronFactory ?? defaultCronFactory)(cron, () => void this.fire(a, cron));
        this.handles.push(handle);
        this.emit({ type: "scheduled", agent: a.garufile.name, cron, nextRun: handle.nextRun() });
        count++;
      }
    }
    return count;
  }

  /** Fire one agent now (also used by cron callbacks). Resolves when the run finishes or is skipped. */
  async fire(a: ScheduledAgent, cron: string): Promise<void> {
    const name = a.garufile.name;
    if (this.stopping) return;
    if (this.inFlight.has(name)) {
      this.emit({ type: "skip.overlap", agent: name, cron });
      return;
    }
    this.emit({ type: "fire", agent: name, cron });
    const p = this.opts
      .runner(a, `cron:${cron}`)
      .then((result) => this.emit({ type: "run.done", agent: name, result }))
      .catch((e: unknown) => this.emit({ type: "run.failed", agent: name, error: (e as Error).message }))
      .finally(() => this.inFlight.delete(name));
    this.inFlight.set(name, p);
    await p;
  }

  /** Stop scheduling new runs and wait for in-flight ones. */
  async stop(): Promise<void> {
    this.stopping = true;
    for (const h of this.handles) h.stop();
    this.handles.length = 0;
    this.emit({ type: "stopping", inFlight: this.inFlight.size });
    await Promise.allSettled([...this.inFlight.values()]);
    this.emit({ type: "stopped" });
  }

  get running(): number {
    return this.inFlight.size;
  }

  private emit(e: SchedulerEvent): void {
    this.opts.onEvent?.(e);
  }
}
