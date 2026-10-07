/**
 * Model pricing — USD per million tokens.
 *
 * Used to turn token counts into money for the budget cap and the log.
 * Prices drift; this table is a best-effort snapshot and a Garufile can
 * override it with `budget.pricing` (set both to 0 on a free tier).
 * Unknown models price as null so the run can say "unpriced" instead of
 * silently reporting $0.
 */
export interface Price {
  inputPerMTok: number;
  outputPerMTok: number;
}

/** Keys are "provider/model" or a prefix ending in "*". Longest match wins. */
export const PRICE_TABLE: Record<string, Price> = {
  // Anthropic (Oct 2026 list prices)
  "anthropic/claude-opus-4*": { inputPerMTok: 5, outputPerMTok: 25 },
  "anthropic/claude-sonnet-4*": { inputPerMTok: 3, outputPerMTok: 15 },
  "anthropic/claude-haiku-4*": { inputPerMTok: 1, outputPerMTok: 5 },
  // Google — paid-tier prices for the Flash family; the free tier bills $0.
  "gemini/gemini-*-flash-lite*": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  "gemini/gemini-flash-lite-latest": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  "gemini/gemini-*-flash*": { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  "gemini/gemini-flash-latest": { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  "gemini/gemini-*-pro*": { inputPerMTok: 1.25, outputPerMTok: 10 },
  // Local models cost nothing per token.
  "ollama/*": { inputPerMTok: 0, outputPerMTok: 0 },
};

function globToRegex(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${esc}$`);
}

/** Look up a price for "provider/model". Returns null when nothing matches. */
export function priceFor(modelId: string, table: Record<string, Price> = PRICE_TABLE): Price | null {
  let best: { len: number; price: Price } | null = null;
  for (const [pattern, price] of Object.entries(table)) {
    if (globToRegex(pattern).test(modelId)) {
      // prefer the most specific pattern (longest literal part)
      const len = pattern.replace(/\*/g, "").length;
      if (!best || len > best.len) best = { len, price };
    }
  }
  return best?.price ?? null;
}

/** Cost in USD for a token count at a price. */
export function costOf(price: Price, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * price.inputPerMTok + (outputTokens / 1_000_000) * price.outputPerMTok;
}

/** "$0.0123" with sensible precision for small numbers. */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
