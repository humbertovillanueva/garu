export function usd(n: number | null | undefined, priced = true): string {
  if (!priced) return "unpriced";
  if (n === null || n === undefined) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}

export function duration(a: string, b: string | null): string {
  if (!b) return "running";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function truncate(s: string, n = 90): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function statusLabel(s: string): string {
  return { ok: "ok", error: "error", running: "running", blocked: "blocked", max_turns: "max turns", budget_exceeded: "over budget" }[s] ?? s;
}

/** Stable series color per agent name: first four get a hue, the rest share gray. */
export function seriesVar(agent: string, order: string[]): string {
  const i = order.indexOf(agent);
  return i >= 0 && i < 4 ? `var(--color-s${i + 1})` : "var(--color-s-other)";
}
