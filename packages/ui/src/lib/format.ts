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
  if (diff < 45_000) return "just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function until(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  if (diff < 60_000) return `${Math.ceil(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.ceil(diff / 60_000)}m`;
  return `${Math.floor(diff / 3_600_000)}h ${Math.round((diff % 3_600_000) / 60_000)}m`;
}
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}
export function dayLabel(iso: string): string {
  const d = new Date(iso); const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
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
  return ({ ok: "done", error: "error", running: "running", interrupted: "interrupted", blocked: "blocked", max_turns: "hit turn limit", budget_exceeded: "over budget", "run.ok": "done" } as Record<string, string>)[s] ?? s;
}

/** Stable identity color per agent name. */
export function agentColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(--color-s${(h % 6) + 1})`;
}

/** First-person status line, the way a colleague would say it. */
export function statusLine(a: { status: string; inFlight: { turn: number } | null; pending: number; nextRun: string | null; lastRun: { status: string; startedAt: string } | null; cron: string | null; configured: boolean; needs?: string[]; signIn?: string[] }): string {
  if (a.status === "waiting") return a.pending === 1 ? "Waiting for you to approve one action" : `Waiting for you on ${a.pending} actions`;
  if (a.status === "working") return a.inFlight ? `Working — turn ${a.inFlight.turn}` : "Working";
  if (a.status === "scheduled") return `Sleeping — next run in ${until(a.nextRun)}`;
  if (a.status === "needs-setup") {
    const parts = [];
    if (a.needs?.length) parts.push(`add ${a.needs.join(", ")} to .env`);
    if (a.signIn?.length) parts.push(`sign in to ${a.signIn.join(", ")} with garu auth`);
    return `Needs setup — ${parts.join("; ")}`;
  }
  if (!a.configured) return "No Garufile found — history only";
  if (a.lastRun) return `Idle — last ran ${when(a.lastRun.startedAt)} (${statusLabel(a.lastRun.status)})`;
  if (a.cron) return "Scheduled, but nothing is running the schedule — start `garu ui --up`";
  return "Idle — hasn't run yet";
}

/** A cron expression in words for the common shapes; the raw expression otherwise. */
export function cronLabel(cron: string | null): string {
  if (!cron) return "when told";
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = p as [string, string, string, string, string];
  const hhmm = (h: string, m: string) => `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  const dows: Record<string, string> = { "1-5": "weekdays", "0,6": "weekends", "6,0": "weekends", "*": "" };
  if (/^\*\/(\d+)$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") return `every ${min.slice(2)} min`;
  if (min === "0" && hour === "*" && dom === "*" && mon === "*" && dow === "*") return "every hour";
  if (/^\d+$/.test(min) && /^\*\/(\d+)$/.test(hour) && dom === "*" && mon === "*" && dow === "*") return `every ${hour.slice(2)} h`;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && mon === "*") {
    const d = dows[dow] ?? (/^[0-6]$/.test(dow) ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(dow)] : dow);
    return `${d ? d + " " : "daily "}${hhmm(hour, min)}`.trim();
  }
  return cron;
}
