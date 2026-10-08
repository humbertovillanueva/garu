import { describe, expect, it } from "vitest";
import { diffStats, lineDiff } from "./diff.js";

describe("lineDiff", () => {
  it("sees an appended line as one addition", () => {
    const d = lineDiff("a\nb\nc", "a\nb\nc\nd");
    expect(d).toEqual([{ t: "=", s: "a" }, { t: "=", s: "b" }, { t: "=", s: "c" }, { t: "+", s: "d" }]);
    expect(diffStats(d)).toEqual({ added: 1, removed: 0, unchanged: 3 });
  });
  it("sees a changed line in the middle", () => {
    const d = lineDiff("a\nb\nc", "a\nB\nc");
    expect(d.map((l) => l.t + l.s)).toEqual(["=a", "-b", "+B", "=c"]);
  });
  it("a new file is all additions; an emptied file all removals", () => {
    expect(lineDiff("", "x\ny").every((l) => l.t === "+")).toBe(true);
    expect(lineDiff("x\ny", "").every((l) => l.t === "-")).toBe(true);
  });
  it("identical content is all unchanged", () => {
    expect(diffStats(lineDiff("same\nsame", "same\nsame"))).toEqual({ added: 0, removed: 0, unchanged: 2 });
  });
});
