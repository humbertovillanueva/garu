import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMORY_MAX_NOTES, Memory, memoryPrompt, parseNotes } from "./memory.js";

describe("Memory", () => {
  it("keeps one dated note per line, refuses a repeat, drops by exact text, and reads a hand-typed line too", () => {
    const m = new Memory(mkdtempSync(join(tmpdir(), "garu-mem-")));
    expect(m.read("bea")).toEqual([]);
    expect(m.add("bea", "  Replies to Priya:   casual. ", "2026-11-10")).toEqual({ ok: true });
    expect(m.add("bea", "Replies to Priya: casual.", "2026-11-12")).toEqual({ ok: false, reason: "already remembered" });
    expect(m.add("bea", "   ")).toMatchObject({ ok: false });
    expect(readFileSync(m.path("bea"), "utf8")).toBe("- 2026-11-10 · Replies to Priya: casual.\n");
    // The owner edits the file by hand: a plain bullet is a note without a date; other lines are ignored.
    writeFileSync(m.path("bea"), readFileSync(m.path("bea"), "utf8") + "# notes\n- Lena's newsletters go under FYI\n\nnot a bullet\n");
    expect(m.read("bea")).toEqual([{ text: "Replies to Priya: casual.", at: "2026-11-10" }, { text: "Lena's newsletters go under FYI" }]);
    expect(m.forget("bea", "nothing like this")).toBe(false);
    expect(m.forget("bea", "Replies to Priya: casual.")).toBe(true);
    expect(m.read("bea")).toEqual([{ text: "Lena's newsletters go under FYI" }]);
    expect(m.read("tomay")).toEqual([]);
  });

  it("is a notebook, not a database: a cap on notes and on their length, said in words", () => {
    const m = new Memory(mkdtempSync(join(tmpdir(), "garu-mem-")));
    for (let i = 0; i < MEMORY_MAX_NOTES; i++) expect(m.add("a", `note ${i}`).ok).toBe(true);
    expect(m.add("a", "one more")).toEqual({ ok: false, reason: expect.stringContaining("full") });
    expect(m.add("b", "x".repeat(300))).toEqual({ ok: false, reason: expect.stringContaining("240") });
    expect(parseNotes("")).toEqual([]);
    expect(memoryPrompt([])).toContain("nothing written down yet");
    expect(memoryPrompt([{ text: "a", at: "2026-01-02" }, { text: "b" }])).toContain("- 2026-01-02 · a\n- b");
  });
});
