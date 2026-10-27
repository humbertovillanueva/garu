import { isApp } from "./server.svelte";
import { t, dateLocale } from "./i18n.svelte";
import { ticker } from "./clock.svelte";
export function usd(n: number | null | undefined, priced = true): string {
  if (!priced) return t("unpriced");
  if (n === null || n === undefined) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
/* Times read the way a person says them: "3:42 PM", "Yesterday 3:42 PM", "Tue 3:42 PM", "Oct 8, 3:42 PM". Never seconds, never a Z.
   The relative ones read the shared clock (clock.svelte.ts), so what they say is redrawn as the minutes pass. */
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const daysBetween = (a: Date, b: Date) => Math.round((new Date(b.toDateString()).getTime() - new Date(a.toDateString()).getTime()) / 86_400_000);
/** "3:42 PM" in the reader's locale, no seconds. */
export function clock(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit" });
}
/** "3:42:07 PM": only the run timeline needs seconds, where steps are seconds apart. */
export function clockExact(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit", second: "2-digit" });
}
/** Day + time, as short as the distance allows. */
export function humanTime(iso: string | null | undefined, now = new Date(ticker.now)): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const time = clock(d);
  const days = daysBetween(d, now);
  if (days === 0) return time;
  if (days === 1) return t("Yesterday {time}", { time });
  if (days === -1) return t("Tomorrow {time}", { time });
  if (days > 1 && days < 7) return t("{weekday} {time}", { weekday: d.toLocaleDateString(dateLocale(), { weekday: "short" }), time });
  if (days < -1 && days > -7) return t("{weekday} {time}", { weekday: d.toLocaleDateString(dateLocale(), { weekday: "short" }), time });
  return t("{day}, {time}", { day: d.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }), time });
}
/** How long ago, in words; falls back to humanTime after a day. */
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = ticker.now - d.getTime();
  if (diff < 45_000) return t("just now");
  if (diff < 3_600_000) return t("{n} min ago", { n: Math.max(1, Math.floor(diff / 60_000)) });
  if (diff < 6 * 3_600_000) return t("{n} h ago", { n: Math.floor(diff / 3_600_000) });
  return humanTime(iso);
}
/** How long until, in words: "in 12 min", "in 2 h 10 min", or the day and time when it is further out. */
export function until(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - ticker.now;
  if (diff <= 0) return t("now");
  if (diff < 60_000) return t("in under a minute");
  if (diff >= 12 * 3_600_000) return humanTime(iso);
  // Whole minutes first, then split: never "in 1 h 60 min" or "in 2 h 0 min".
  const m = Math.ceil(diff / 60_000);
  if (m < 60) return t("in {m} min", { m });
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? t("in {h} h {rest} min", { h, rest }) : t("in {h} h", { h });
}
/** The reader's calendar day of an instant, as YYYY-MM-DD (the control room buckets days the same way). */
export function localDay(at: string | Date): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** A trigger string from the recorder, in words. */
export function triggerLabel(trigger: string): string {
  if (trigger === "cron" || trigger.startsWith("cron:")) return t("scheduled");
  if (trigger === "catch-up" || trigger.startsWith("catch-up:")) return t("catch-up");
  if (trigger === "chat") return t("message");
  if (trigger === "manual" || trigger === "ui") return t("run now");
  return trigger;
}
export function dayLabel(iso: string): string {
  const d = new Date(iso); const today = new Date(ticker.now);
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return t("Today");
  if (same(d, y)) return t("Yesterday");
  return d.toLocaleDateString(dateLocale(), { weekday: "long", month: "short", day: "numeric" });
}
/** How long a run took, in words: "a few seconds", "under a minute", "3 min", "1 h 5 min". Never seconds. */
export function duration(a: string, b: string | null): string {
  if (!b) return t("running");
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 10_000) return t("a few seconds");
  if (ms < 60_000) return t("under a minute");
  const m = Math.round(ms / 60_000);
  if (m < 60) return t("{m} min", { m });
  return m % 60 ? t("{h} h {m} min", { h: Math.floor(m / 60), m: m % 60 }) : t("{h} h", { h: Math.floor(m / 60) });
}
export function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
export function truncate(s: string, n = 90): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
export function statusLabel(s: string): string {
  return ({ ok: t("done"), error: t("error"), running: t("running"), interrupted: t("interrupted"), blocked: t("blocked"), max_turns: t("hit turn limit"), budget_exceeded: t("over budget"), "run.ok": t("done"), "needs-setup": t("needs setup"), waiting: t("waiting for you"), working: t("working"), scheduled: t("scheduled"), sleeping: t("sleeping"), idle: t("idle") } as Record<string, string>)[s] ?? s;
}

/** First-person status line, the way a colleague would say it. */
export function statusLine(a: { status: string; inFlight: { turn: number } | null; pending: number; nextRun: string | null; lastRun: { status: string; startedAt: string } | null; cron: string | null; configured: boolean; needs?: string[]; signIn?: string[] }): string {
  if (a.status === "waiting") return a.pending === 1 ? t("Waiting for you to approve one action") : t("Waiting for you on {n} actions", { n: a.pending });
  if (a.status === "working") return a.inFlight ? t("Working — turn {turn}", { turn: a.inFlight.turn }) : t("Working");
  if (a.status === "scheduled") return t("Sleeping — next run {until}", { until: until(a.nextRun) });
  if (a.status === "needs-setup") {
    // The fix happens on the computer; the phone says so instead of showing commands it can't run.
    if (isApp) return t("Needs setup on your computer");
    const parts = [];
    if (a.needs?.length) parts.push(t("add {keys} to .env", { keys: a.needs.join(", ") }));
    if (a.signIn?.length) parts.push(t("sign in to {services} with npm run garu -- auth", { services: a.signIn.join(", ") }));
    return t("Needs setup — {parts}", { parts: parts.join("; ") });
  }
  if (!a.configured) return t("No Garufile found — history only");
  if (a.lastRun) return t("Idle — last ran {when} ({status})", { when: when(a.lastRun.startedAt), status: statusLabel(a.lastRun.status) });
  if (a.cron) return t("Has a schedule, but Garu isn't running schedules right now");
  return t("Idle — hasn't run yet");
}

/** A cron expression in words for the common shapes; the raw expression otherwise. */
export function cronLabel(cron: string | null): string {
  if (!cron) return t("when told");
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = p as [string, string, string, string, string];
  const hhmm = (h: string, m: string) => { const d = new Date(2000, 0, 1, Number(h), Number(m)); return d.toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit" }); };
  const dows: Record<string, string> = { "1-5": t("Weekdays"), "0,6": t("Weekends"), "6,0": t("Weekends"), "*": "" };
  if (/^\*\/(\d+)$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") return t("every {n} min", { n: min.slice(2) });
  if (min === "0" && hour === "*" && dom === "*" && mon === "*" && dow === "*") return t("every hour");
  if (/^\d+$/.test(min) && /^\*\/(\d+)$/.test(hour) && dom === "*" && mon === "*" && dow === "*") return t("every {n} h", { n: hour.slice(2) });
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && mon === "*") {
    const d = dows[dow] ?? (/^[0-6]$/.test(dow) ? [t("Sundays"), t("Mondays"), t("Tuesdays"), t("Wednesdays"), t("Thursdays"), t("Fridays"), t("Saturdays")][Number(dow)] : dow);
    return d ? t("{days} {time}", { days: d, time: hhmm(hour, min) }) : t("Daily {time}", { time: hhmm(hour, min) });
  }
  return cron;
}

/** The build stamp ("0.1.0 · 8eedb90 · 2026-10-10 20:30 UTC") as a reader wants it: "0.1.0, build 8eedb90, 2:30 PM". */
export function buildText(stamp: string): string {
  const [version, commit, built] = stamp.split(" · ");
  const at = built ? humanTime(built.replace(" UTC", "Z").replace(" ", "T")) : "";
  return [version, commit ? t("build {commit}", { commit }) : "", at].filter(Boolean).join(", ");
}

/**
 * Who decided an ask, the way the reader would say it. The recorder keeps the raw value
 * ("Humberto (ui)", "grant g_… (humberto)", "inbox: expired"); only the words on screen change.
 */
export function decidedBy(by: string | undefined): string {
  if (!by) return "";
  if (/expired/.test(by)) return t("nobody answered in time");
  if (/vanished/.test(by)) return t("the request went away");
  if (/garu stopped/.test(by)) return t("a restart of Garu");
  if (/^grant\b/.test(by)) return t("your 24-hour approval");
  if (/\((ui|cli|phone|app)\)$/.test(by)) return t("you");
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
