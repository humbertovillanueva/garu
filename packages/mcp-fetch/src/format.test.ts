import { describe, expect, it } from "vitest";
import { toSlackMrkdwn } from "./format.js";

describe("toSlackMrkdwn", () => {
  it("turns headings into bold lines", () => {
    expect(toSlackMrkdwn("# Morning brief\n## Weather\nHigh 85°F")).toBe("*Morning brief*\n*Weather*\nHigh 85°F");
  });
  it("turns dashes into bullets and double-star bold into single-star", () => {
    expect(toSlackMrkdwn("- **Garu** (12 pts) — thing\n  - nested")).toBe("• *Garu* (12 pts) — thing\n  • nested");
  });
  it("leaves plain text alone", () => {
    expect(toSlackMrkdwn("hello #brief, 2 * 3 = 6")).toBe("hello #brief, 2 * 3 = 6");
  });
});
