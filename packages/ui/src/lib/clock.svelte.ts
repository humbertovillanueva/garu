/**
 * One clock for every "in 25 min", "3 min ago" and "Yesterday" on screen. It ticks every half
 * minute, and the formatters in format.ts read it instead of Date.now(), so a countdown on a page
 * left open stays true instead of freezing at the moment it was drawn. The greeting follows it too.
 */
export const ticker = $state({ now: Date.now() });
if (typeof setInterval === "function") setInterval(() => (ticker.now = Date.now()), 30_000);
