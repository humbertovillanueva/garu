/**
 * Chat — a conversation with an agent.
 *
 * One JSONL file per agent. A message from you starts a run whose input is
 * the recent transcript plus your message; the run's final text comes back as
 * the agent's reply. Runs the agent starts on its own (cron, UI "Run now")
 * post their summary here too, so the thread reads like the agent's diary.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface ChatMessage {
  id: string;
  ts: string;
  role: "user" | "agent";
  text: string;
  /** Run that produced (agent) or was started by (user) this message. */
  runId?: string;
  /** "chat" for replies to you; the trigger name for diary entries from other runs; "error" when a run failed. */
  kind: "chat" | "run" | "error";
}

/** What the agent is told about its own schedule and runs before it answers you. Facts, not memory. */
export interface SelfStatus {
  /** Cron pattern, or null for an on-demand agent. */
  cron: string | null;
  /** Whether Garu is running schedules right now (`garu ui --up` / the service). */
  schedulesOn: boolean;
  nextRun: Date | null;
  /** Newest first. */
  runs: { startedAt: Date; trigger: string; status: string }[];
  now?: Date;
  /** IANA zone used to print times; defaults to the machine's. */
  timeZone?: string;
}

const fmtTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/** A few plain lines the agent can quote when asked "did you run?" or "why didn't you post?". */
export function describeSelf(s: SelfStatus): string {
  const tz = s.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = s.now ?? new Date();
  const lines: string[] = [];
  if (s.cron) {
    lines.push(`Schedule: cron "${s.cron}" (local time, ${tz}). Garu's scheduler is ${s.schedulesOn ? "on" : "OFF, so nothing fires until it is started"}.`);
    if (s.nextRun && s.schedulesOn) lines.push(`Next scheduled run: ${fmtTime(s.nextRun, tz)}.`);
  } else {
    lines.push("Schedule: none; you run only when asked.");
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const recent = s.runs.slice(0, 6);
  if (recent.length === 0) lines.push("Runs: none recorded yet.");
  else {
    const kind = (t: string) => (t.startsWith("cron:") ? "scheduled" : t.startsWith("catch-up:") ? "catch-up (missed while Garu was off or asleep)" : t === "chat" ? "chat" : t);
    lines.push("Recent runs, newest first: " + recent.map((r) => `${fmtTime(r.startedAt, tz)} — ${kind(r.trigger)} — ${r.status}`).join("; ") + ".");
    const scheduledToday = recent.some((r) => (r.trigger.startsWith("cron:") || r.trigger.startsWith("catch-up:")) && new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(r.startedAt) === today);
    if (s.cron && !scheduledToday) lines.push("No scheduled run has happened today. If one was due, Garu was not running at that time; it was not your decision.");
  }
  return lines.join("\n");
}

export class ChatStore {
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  private path(agent: string): string {
    if (!/^[a-z][a-z0-9-]*$/.test(agent)) throw new Error(`bad agent name "${agent}"`);
    return join(this.root, `${agent}.jsonl`);
  }

  messages(agent: string, limit = 200): ChatMessage[] {
    const p = this.path(agent);
    if (!existsSync(p)) return [];
    const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim());
    const out: ChatMessage[] = [];
    for (const l of lines) {
      try {
        out.push(JSON.parse(l) as ChatMessage);
      } catch {
        /* skip a torn line */
      }
    }
    return out.slice(-limit);
  }

  append(agent: string, msg: Omit<ChatMessage, "id" | "ts"> & { ts?: string }): ChatMessage {
    const full: ChatMessage = { id: randomUUID().slice(0, 8), ts: msg.ts ?? new Date().toISOString(), ...msg };
    appendFileSync(this.path(agent), JSON.stringify(full) + "\n");
    return full;
  }

  /** The run input for a new user message: recent context, then the message. Keeps diary entries short. */
  transcript(agent: string, userName: string, agentName: string, newMessage: string, maxMessages = 20, self?: SelfStatus): string {
    const recent = this.messages(agent).slice(-maxMessages);
    const lines = recent.map((m) => {
      const who = m.role === "user" ? userName : agentName;
      const text = m.kind === "run" ? `(after a run) ${m.text}` : m.text;
      return `${who}: ${text.length > 600 ? text.slice(0, 599) + "…" : text}`;
    });
    const history = lines.length ? `Conversation so far, oldest first:\n${lines.join("\n")}\n\n` : "";
    const facts = self ? `Facts about you from Garu's records (trust these over anything you remember):\n${describeSelf(self)}\n\n` : "";
    return (
      `${facts}${history}${userName}'s new message:\n${newMessage}\n\n` +
      `Reply to ${userName} directly, in plain language, as ${agentName}. If the message asks you to do work, do it with your tools under your policy and then say what you did. If it's a question, answer it (use tools to look things up if needed). If it's a greeting or small talk, just reply briefly — do not start your standing job unless asked. Don't repeat your standing instructions back.`
    );
  }
}
