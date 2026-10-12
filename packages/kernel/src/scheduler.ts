/**
 * Scheduler — what makes an agent "always-on".
 *
 * Loads Garufiles, fires each agent on its cron triggers, and keeps the
 * basic promises: one run of an agent at a time (a slow run never piles up
 * behind itself), every fire and skip is visible, and shutdown waits for
 * in-flight runs instead of killing them mid-tool-call.
 */
import { lookup } from "node:dns/promises";
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
  | { type: "catch-up"; agent: string; cron: string; missedAt: Date }
  | { type: "skip.overlap"; agent: string; cron: string }
  | { type: "offline"; agent: string; cron: string }
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
  /** The most recent time the pattern was due in (since, now], or null if none. Used for catch-up. */
  lastDue(now: Date, since: Date): Date | null;
}
export type CronFactory = (pattern: string, cb: () => void) => CronHandle;

/** Walk the pattern forward from `since` and return the last due time that is not after `now`. */
export function lastDue(pattern: string, now: Date, since: Date): Date | null {
  const probe = new Cron(pattern, { paused: true });
  try {
    let last: Date | null = null;
    let cursor: Date = since;
    for (let i = 0; i < 10_000; i++) {
      const next = probe.nextRun(cursor);
      if (!next || next.getTime() > now.getTime()) break;
      last = next;
      cursor = next;
    }
    return last;
  } finally {
    probe.stop();
  }
}

export const defaultCronFactory: CronFactory = (pattern, cb) => {
  const job = new Cron(pattern, { protect: true }, cb);
  return { stop: () => job.stop(), nextRun: () => job.nextRun(), lastDue: (now, since) => lastDue(pattern, now, since) };
};

/**
 * Where each model provider lives, for the "can we reach it?" check before a run. A provider not
 * listed here (Ollama, a custom one) is taken as always reachable.
 */
export const PROVIDER_HOSTS: Record<string, string> = {
  gemini: "generativelanguage.googleapis.com",
  anthropic: "api.anthropic.com",
};
/** After an offline attempt, how long before the schedule tries that agent again. */
export const OFFLINE_RETRY_MS = 10 * 60_000;

/** A 3-second DNS lookup: enough to tell a laptop waking in the dark (no network for a few seconds) from a real wake. */
async function reachable(host: string): Promise<boolean> {
  const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), 3000).unref?.());
  return Promise.race([lookup(host).then(() => true, () => false), timeout]);
}

export async function defaultOnline(a: ScheduledAgent): Promise<boolean> {
  const host = PROVIDER_HOSTS[a.garufile.model.split("/")[0] ?? ""];
  return host ? reachable(host) : true;
}

/** Throws with a readable message if the cron pattern is invalid. */
export function assertValidCron(pattern: string): void {
  try {
    new Cron(pattern, { paused: true }).stop();
  } catch (e) {
    throw new Error(`invalid cron "${pattern}": ${(e as Error).message}`);
  }
}

/**
 * Catch-up: a laptop that was asleep or off at 7:00 should still get its 7:00 run.
 * On start, and then once a minute, every cron trigger that was due inside the
 * window with no run started since is fired once with a `catch-up:` trigger.
 */
export interface CatchUpOptions {
  /** When this agent's last scheduled run (cron or catch-up, not chat) started; null if never. An attempt that never reached the model (offline) doesn't count. */
  lastRunAt: (agent: string) => Date | null;
  /** How far back a missed fire still counts. Default 6 hours. */
  windowMs?: number;
  /** Clock, injectable for tests. */
  now?: () => Date;
  /** How often to re-check after start. Default 60s; 0 disables the timer (tests call checkMissed()). */
  everyMs?: number;
}

export interface SchedulerOptions {
  runner: Runner;
  onEvent?: (e: SchedulerEvent) => void;
  cronFactory?: CronFactory;
  catchUp?: CatchUpOptions;
  /** Whether the agent's model can be reached right now. Default: a DNS lookup of the provider's host. */
  online?: (agent: ScheduledAgent) => Promise<boolean>;
  /** A run of this agent started elsewhere (the control room, chat) that the scheduler can't see. */
  isBusy?: (agent: string) => boolean;
}

export class Scheduler {
  private readonly handles: CronHandle[] = [];
  private readonly jobs: { agent: ScheduledAgent; cron: string; handle: CronHandle }[] = [];
  private readonly inFlight = new Map<string, Promise<void>>();
  /** Agents between "fire" and "running": the reachability check is async, and two fires in one tick must not both pass. */
  private readonly starting = new Set<string>();
  /** Agents found offline, and when the schedule may try them again. */
  private readonly offlineUntil = new Map<string, number>();
  private stopping = false;
  private timer: NodeJS.Timeout | undefined;
  /** Catch-up runs go one after another, not all at once: a laptop waking up should not hammer the model's rate limit. */
  private catchUpQueue: Promise<void> = Promise.resolve();
  private readonly catchUpPending = new Set<string>();

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
        this.jobs.push({ agent: a, cron, handle });
        this.emit({ type: "scheduled", agent: a.garufile.name, cron, nextRun: handle.nextRun() });
        count++;
      }
    }
    if (this.opts.catchUp && count > 0) {
      this.checkMissed();
      const every = this.opts.catchUp.everyMs ?? 60_000;
      if (every > 0) {
        this.timer = setInterval(() => this.checkMissed(), every);
        this.timer.unref?.();
      }
    }
    return count;
  }

  /** Fire every trigger that was due inside the catch-up window and has no run since. Returns how many were queued. */
  checkMissed(): number {
    const cu = this.opts.catchUp;
    if (!cu || this.stopping) return 0;
    const now = (cu.now ?? (() => new Date()))();
    const since = new Date(now.getTime() - (cu.windowMs ?? 6 * 60 * 60_000));
    let queued = 0;
    for (const j of this.jobs) {
      const name = j.agent.garufile.name;
      if (this.inFlight.has(name) || this.starting.has(name) || this.catchUpPending.has(name)) continue;
      if ((this.offlineUntil.get(name) ?? 0) > now.getTime()) continue;
      const due = j.handle.lastDue(now, since);
      if (!due) continue;
      const last = cu.lastRunAt(name);
      if (last && last.getTime() >= due.getTime()) continue;
      this.emit({ type: "catch-up", agent: name, cron: j.cron, missedAt: due });
      this.catchUpPending.add(name);
      this.catchUpQueue = this.catchUpQueue.then(() => {
        this.catchUpPending.delete(name);
        // While it waited its turn, its own cron may have fired and run: check again before firing.
        const lastNow = cu.lastRunAt(name);
        if (this.inFlight.has(name) || this.starting.has(name) || (lastNow && lastNow.getTime() >= due.getTime())) return;
        return this.fire(j.agent, j.cron, "catch-up");
      });
      queued++;
    }
    return queued;
  }

  /** Fire one agent now (also used by cron callbacks). Resolves when the run finishes or is skipped. */
  async fire(a: ScheduledAgent, cron: string, kind: "cron" | "catch-up" = "cron"): Promise<void> {
    const name = a.garufile.name;
    if (this.stopping) return;
    if (this.inFlight.has(name) || this.starting.has(name) || this.opts.isBusy?.(name)) {
      this.emit({ type: "skip.overlap", agent: name, cron });
      return;
    }
    this.starting.add(name);
    let online: boolean;
    try {
      online = await (this.opts.online ?? defaultOnline)(a);
    } finally {
      this.starting.delete(name);
    }
    if (!online) {
      // A laptop waking in the dark, or no Wi-Fi: a run now could only fail. Catch-up retries once the network is back.
      const now = (this.opts.catchUp?.now ?? (() => new Date()))();
      this.offlineUntil.set(name, now.getTime() + OFFLINE_RETRY_MS);
      this.emit({ type: "offline", agent: name, cron });
      return;
    }
    if (this.stopping || this.inFlight.has(name)) return;
    this.emit({ type: "fire", agent: name, cron });
    const p = this.opts
      .runner(a, `${kind}:${cron}`)
      .then((result) => this.emit({ type: "run.done", agent: name, result }))
      .catch((e: unknown) => this.emit({ type: "run.failed", agent: name, error: (e as Error).message }))
      .finally(() => this.inFlight.delete(name));
    this.inFlight.set(name, p);
    await p;
  }

  /** Stop scheduling new runs and wait for in-flight ones: forever by default, or up to `deadlineMs`. */
  async stop(deadlineMs?: number): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    for (const h of this.handles) h.stop();
    this.handles.length = 0;
    this.jobs.length = 0;
    this.emit({ type: "stopping", inFlight: this.inFlight.size });
    const all = Promise.allSettled([...this.inFlight.values()]);
    await (deadlineMs === undefined ? all : Promise.race([all, new Promise<void>((r) => setTimeout(r, deadlineMs).unref?.())]));
    this.emit({ type: "stopped" });
  }

  get running(): number {
    return this.inFlight.size;
  }

  private emit(e: SchedulerEvent): void {
    this.opts.onEvent?.(e);
  }
}
