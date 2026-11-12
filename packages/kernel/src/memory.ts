/**
 * An agent's memory.
 *
 * A short notebook per agent, kept between runs: `<root>/<agent>.md`, one note per line with the day it
 * was written. The model is shown it at the start of every run and keeps it with two built-in tools,
 * garu.remember and garu.forget, which go through the policy like any other call. The owner reads and
 * edits it on the agent's page, or in any text editor. Small on purpose: a notebook, not a database;
 * what is no longer true gets forgotten, not kept.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BuiltinTool } from "./bus.js";

export const MEMORY_MAX_NOTES = 40;
export const MEMORY_MAX_NOTE_CHARS = 240;

export interface MemoryNote {
  text: string;
  /** The local day it was written (YYYY-MM-DD); missing for a line someone typed into the file by hand. */
  at?: string;
}

export class Memory {
  constructor(readonly root: string) {}

  path(agent: string): string {
    return join(this.root, `${agent}.md`);
  }

  read(agent: string): MemoryNote[] {
    const path = this.path(agent);
    if (!existsSync(path)) return [];
    return parseNotes(readFileSync(path, "utf8"));
  }

  /** Adds a note; a refusal says why, in words the model (or a person) can act on. */
  add(agent: string, text: string, at = localDate()): { ok: true } | { ok: false; reason: string } {
    const note = clean(text);
    if (!note) return { ok: false, reason: "a note needs some text" };
    if (note.length > MEMORY_MAX_NOTE_CHARS) return { ok: false, reason: `a note is at most ${MEMORY_MAX_NOTE_CHARS} characters; keep it to one fact` };
    const notes = this.read(agent);
    if (notes.some((n) => n.text === note)) return { ok: false, reason: "already remembered" };
    if (notes.length >= MEMORY_MAX_NOTES) return { ok: false, reason: `memory is full (${MEMORY_MAX_NOTES} notes); forget one that is no longer true first` };
    this.write(agent, [...notes, { text: note, at }]);
    return { ok: true };
  }

  /** Drops the note with exactly this text; false when there is none. */
  forget(agent: string, text: string): boolean {
    const note = clean(text);
    const notes = this.read(agent);
    const kept = notes.filter((n) => n.text !== note);
    if (kept.length === notes.length) return false;
    this.write(agent, kept);
    return true;
  }

  private write(agent: string, notes: MemoryNote[]): void {
    mkdirSync(this.root, { recursive: true });
    const path = this.path(agent);
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, notes.map(line).join("\n") + (notes.length ? "\n" : ""));
    renameSync(tmp, path);
  }
}

/** "- 2026-11-12 · text" is a dated note; a bare "- text" line (typed by hand) is one without a date; anything else is ignored. */
export function parseNotes(md: string): MemoryNote[] {
  const out: MemoryNote[] = [];
  for (const raw of md.split("\n")) {
    const m = /^\s*[-*]\s+(.*)$/.exec(raw);
    if (!m) continue;
    const dated = /^(\d{4}-\d{2}-\d{2})\s+·\s+(.*)$/.exec(m[1]!);
    const text = clean(dated ? dated[2]! : m[1]!);
    if (text) out.push(dated ? { text, at: dated[1]! } : { text });
  }
  return out;
}

const line = (n: MemoryNote) => `- ${n.at ? `${n.at} · ` : ""}${n.text}`;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
function localDate(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The notebook as the model sees it in its system prompt. */
export function memoryPrompt(notes: MemoryNote[]): string {
  const head = "Your memory: your own notes from earlier runs, each with the day you wrote it. garu.remember adds one, garu.forget drops one that is no longer true.";
  return notes.length ? `${head}\n${notes.map(line).join("\n")}` : `${head}\n(nothing written down yet)`;
}

/** The two built-in tools that keep an agent's notebook, for a run whose Garufile says `memory: true`. */
export function memoryTools(memory: Memory, agent: string): BuiltinTool[] {
  const text = (args: Record<string, unknown>) => (typeof args["note"] === "string" ? args["note"] : "");
  return [
    {
      server: "garu",
      name: "remember",
      description:
        `Write one short note into your memory; you are shown your memory at the start of every run. For what you will need in later runs and could not get again from your tools: a preference your owner stated, how to treat a recurring sender, a decision, something to follow up on. Not for today's results, and never anything secret. One fact per note, under ${MEMORY_MAX_NOTE_CHARS} characters, ${MEMORY_MAX_NOTES} notes at most; forget a note once it is no longer true.`,
      inputSchema: { type: "object", properties: { note: { type: "string", description: "The fact, in one sentence." } }, required: ["note"] },
      readOnly: false,
      call: async (args) => {
        const r = memory.add(agent, text(args));
        return r.ok ? { text: "remembered" } : { text: r.reason, isError: true };
      },
    },
    {
      server: "garu",
      name: "forget",
      description: "Drop one note from your memory because it is no longer true or no longer needed. Give its text exactly as your memory shows it.",
      inputSchema: { type: "object", properties: { note: { type: "string", description: "The note's text, exactly as it reads in your memory." } }, required: ["note"] },
      readOnly: false,
      call: async (args) => (memory.forget(agent, text(args)) ? { text: "forgotten" } : { text: "no such note in your memory; give its text exactly as shown", isError: true }),
    },
  ];
}
