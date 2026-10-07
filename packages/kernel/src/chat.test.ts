import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatStore } from "./chat.js";

describe("ChatStore", () => {
  it("appends and reads messages per agent", () => {
    const s = new ChatStore(mkdtempSync(join(tmpdir(), "chat-")));
    s.append("tomay", { role: "user", text: "hi", kind: "chat" });
    s.append("tomay", { role: "agent", text: "hello", kind: "chat", runId: "r1" });
    s.append("other", { role: "user", text: "x", kind: "chat" });
    const m = s.messages("tomay");
    expect(m.map((x) => [x.role, x.text])).toEqual([["user", "hi"], ["agent", "hello"]]);
    expect(m[1]!.runId).toBe("r1");
    expect(m[0]!.id).toHaveLength(8);
    expect(s.messages("nobody")).toEqual([]);
    expect(() => s.messages("../etc")).toThrow(/bad agent name/);
  });

  it("builds a transcript with history and the new message", () => {
    const s = new ChatStore(mkdtempSync(join(tmpdir(), "chat-")));
    s.append("tomay", { role: "user", text: "what's the weather", kind: "chat" });
    s.append("tomay", { role: "agent", text: "84 and sunny", kind: "chat" });
    s.append("tomay", { role: "agent", text: "Wrote today's brief.", kind: "run", runId: "r9" });
    const t = s.transcript("tomay", "Humberto", "Tomay", "and tomorrow?");
    expect(t).toContain("Humberto: what's the weather");
    expect(t).toContain("Tomay: 84 and sunny");
    expect(t).toContain("run) Wrote today's brief.");
    expect(t).toContain("Humberto's new message:\nand tomorrow?");
    expect(t).toMatch(/Reply to Humberto directly/);
  });

  it("with no history, just the message and instructions", () => {
    const s = new ChatStore(mkdtempSync(join(tmpdir(), "chat-")));
    const t = s.transcript("tomay", "H", "T", "hey");
    expect(t.startsWith("H's new message:\nhey")).toBe(true);
  });
});
