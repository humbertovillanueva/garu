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
  transcript(agent: string, userName: string, agentName: string, newMessage: string, maxMessages = 20): string {
    const recent = this.messages(agent).slice(-maxMessages);
    const lines = recent.map((m) => {
      const who = m.role === "user" ? userName : agentName;
      const text = m.kind === "run" ? `(after a run) ${m.text}` : m.text;
      return `${who}: ${text.length > 600 ? text.slice(0, 599) + "…" : text}`;
    });
    const history = lines.length ? `Conversation so far, oldest first:\n${lines.join("\n")}\n\n` : "";
    return (
      `${history}${userName}'s new message:\n${newMessage}\n\n` +
      `Reply to ${userName} directly, in plain language, as ${agentName}. If the message asks you to do work, do it with your tools under your policy and then say what you did. If it's just a question, answer it. Don't repeat your standing instructions back.`
    );
  }
}
