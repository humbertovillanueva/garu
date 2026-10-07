import { describe, expect, it } from "vitest";
import { costOf, formatUsd, priceFor } from "./pricing.js";

describe("priceFor", () => {
  it("matches by provider/model glob, most specific wins", () => {
    expect(priceFor("anthropic/claude-sonnet-4-6")).toEqual({ inputPerMTok: 3, outputPerMTok: 15 });
    expect(priceFor("anthropic/claude-haiku-4-5")).toEqual({ inputPerMTok: 1, outputPerMTok: 5 });
    // flash-lite must beat the broader flash pattern
    expect(priceFor("gemini/gemini-3.5-flash-lite")).toEqual({ inputPerMTok: 0.1, outputPerMTok: 0.4 });
    expect(priceFor("gemini/gemini-3.6-flash")).toEqual({ inputPerMTok: 0.3, outputPerMTok: 2.5 });
    expect(priceFor("ollama/llama3")).toEqual({ inputPerMTok: 0, outputPerMTok: 0 });
  });
  it("returns null for unknown models instead of pretending", () => {
    expect(priceFor("mystery/model-x")).toBeNull();
  });
  it("honours a custom table", () => {
    expect(priceFor("gemini/gemini-3.6-flash", { "gemini/*": { inputPerMTok: 0, outputPerMTok: 0 } })).toEqual({ inputPerMTok: 0, outputPerMTok: 0 });
  });
});

describe("costOf / formatUsd", () => {
  it("computes per-million pricing", () => {
    expect(costOf({ inputPerMTok: 3, outputPerMTok: 15 }, 1_000_000, 100_000)).toBeCloseTo(4.5, 10);
    expect(costOf({ inputPerMTok: 1, outputPerMTok: 5 }, 13286, 331)).toBeCloseTo(0.014941, 6);
  });
  it("formats small amounts readably", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0149)).toBe("$0.015");
    expect(formatUsd(0.0012)).toBe("$0.0012");
    expect(formatUsd(2.5)).toBe("$2.50");
  });
});
