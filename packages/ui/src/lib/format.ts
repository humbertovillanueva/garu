import { isApp } from "./server.svelte";
export function usd(n: number | null | undefined, priced = true): string {
  if (!priced) return "unpriced";
  if (n === null || n === undefined) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
/* Times read the way a person says them: "3:42 PM", "Yesterday 3:42 PM", "Tue 3:42 PM", "Oct 8, 3:42 PM". Never seconds, never a Z. */
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const daysBetween = (a: Date, b: Date) => Math.round((new Date(b.toDateString()).getTime() - new Date(a.toDateString()).getTime()) / 86_400_000);
/** "3:42 PM" in the reader's locale, no seconds. */
export function clock(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
/** "3:42:07 PM": only the run timeline needs seconds, where steps are seconds apart. */
export function clockExact(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}
/** Day + time, as short as the distance allows. */
export function humanTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const t = clock(d);
  const days = daysBetween(d, now);
  if (days === 0) return t;
  if (days === 1) return `Yesterday ${t}`;
  if (days === -1) return `Tomorrow ${t}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${t}`;
  if (days < -1 && days > -7) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${t}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${t}`;
}
/** How long ago, in words; falls back to humanTime after a day. */
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 45_000) return "just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min ago`;
  if (diff < 6 * 3_600_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return humanTime(iso);
}
/** How long until, in words: "in 12 min", "in 2 h 10 min", or the day and time when it is further out. */
export function until(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  if (diff < 60_000) return "in under a minute";
  if (diff >= 12 * 3_600_000) return humanTime(iso);
  // Whole minutes first, then split: never "in 1 h 60 min" or "in 2 h 0 min".
  const m = Math.ceil(diff / 60_000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `in ${h} h ${rest} min` : `in ${h} h`;
}
/** The reader's calendar day of an instant, as YYYY-MM-DD (the control room buckets days the same way). */
export function localDay(at: string | Date): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** A trigger string from the recorder, in words. */
export function triggerLabel(t: string): string {
  if (t === "cron" || t.startsWith("cron:")) return "scheduled";
  if (t === "catch-up" || t.startsWith("catch-up:")) return "catch-up";
  if (t === "chat") return "message";
  if (t === "manual" || t === "ui") return "run now";
  return t;
}
export function dayLabel(iso: string): string {
  const d = new Date(iso); const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
/** How long a run took, in words: "a few seconds", "under a minute", "3 min", "1 h 5 min". Never seconds. */
export function duration(a: string, b: string | null): string {
  if (!b) return "running";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 10_000) return "a few seconds";
  if (ms < 60_000) return "under a minute";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
}
export function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
export function truncate(s: string, n = 90): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
export function statusLabel(s: string): string {
  return ({ ok: "done", error: "error", running: "running", interrupted: "interrupted", blocked: "blocked", max_turns: "hit turn limit", budget_exceeded: "over budget", "run.ok": "done", "needs-setup": "needs setup", waiting: "waiting for you", working: "working", scheduled: "scheduled", idle: "idle" } as Record<string, string>)[s] ?? s;
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
  if (a.status === "scheduled") return `Sleeping — next run ${until(a.nextRun)}`;
  if (a.status === "needs-setup") {
    // The fix happens on the computer; the phone says so instead of showing commands it can't run.
    if (isApp) return "Needs setup on your computer";
    const parts = [];
    if (a.needs?.length) parts.push(`add ${a.needs.join(", ")} to .env`);
    if (a.signIn?.length) parts.push(`sign in to ${a.signIn.join(", ")} with npm run garu -- auth`);
    return `Needs setup — ${parts.join("; ")}`;
  }
  if (!a.configured) return "No Garufile found — history only";
  if (a.lastRun) return `Idle — last ran ${when(a.lastRun.startedAt)} (${statusLabel(a.lastRun.status)})`;
  if (a.cron) return "Has a schedule, but Garu isn't running schedules right now";
  return "Idle — hasn't run yet";
}

/** A cron expression in words for the common shapes; the raw expression otherwise. */
export function cronLabel(cron: string | null): string {
  if (!cron) return "when told";
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = p as [string, string, string, string, string];
  const hhmm = (h: string, m: string) => { const d = new Date(2000, 0, 1, Number(h), Number(m)); return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
  const dows: Record<string, string> = { "1-5": "Weekdays", "0,6": "Weekends", "6,0": "Weekends", "*": "" };
  if (/^\*\/(\d+)$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") return `every ${min.slice(2)} min`;
  if (min === "0" && hour === "*" && dom === "*" && mon === "*" && dow === "*") return "every hour";
  if (/^\d+$/.test(min) && /^\*\/(\d+)$/.test(hour) && dom === "*" && mon === "*" && dow === "*") return `every ${hour.slice(2)} h`;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && mon === "*") {
    const d = dows[dow] ?? (/^[0-6]$/.test(dow) ? ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][Number(dow)] : dow);
    return `${d ? d + " " : "Daily "}${hhmm(hour, min)}`.trim();
  }
  return cron;
}

/** The build stamp ("0.1.0 · 8eedb90 · 2026-10-10 20:30 UTC") as a reader wants it: "0.1.0, build 8eedb90, 2:30 PM". */
export function buildText(stamp: string): string {
  const [version, commit, built] = stamp.split(" · ");
  const at = built ? humanTime(built.replace(" UTC", "Z").replace(" ", "T")) : "";
  return [version, commit ? `build ${commit}` : "", at].filter(Boolean).join(", ");
}

/**
 * Who decided an ask, the way the reader would say it. The recorder keeps the raw value
 * ("Humberto (ui)", "grant g_… (humberto)", "inbox: expired"); only the words on screen change.
 */
export function decidedBy(by: string | undefined): string {
  if (!by) return "";
  if (/expired/.test(by)) return "nobody answered in time";
  if (/vanished/.test(by)) return "the request went away";
  if (/^grant\b/.test(by)) return "your 24-hour approval";
  if (/\((ui|cli|phone|app)\)$/.test(by)) return "you";
  return by;
}
export const expired = (by: string | undefined) => !!by && /expired/.test(by);

/**
 * An agent's own words with any machine timestamp ("2026-10-10T21:00:01.052Z") said as a time instead
 * ("3:00 PM", "Yesterday 3:00 PM"). The agent's text is otherwise left exactly as it wrote it.
 */
export function plainTimes(text: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})\b/g, (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : humanTime(iso);
  });
}
