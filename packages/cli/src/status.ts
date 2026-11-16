/**
 * garu status: Home, for the terminal. One line per agent with what it's doing, when it runs next,
 * how its last run went and what's waiting on you, for a Mac reached over SSH or an owner who'd
 * rather not open the browser. Pure: the command gathers the facts, this says them.
 */
import { formatUsd, localDay, localTime } from "@garu/kernel";
import { t } from "./i18n.js";

export interface AgentFacts {
  name: string;
  cron: string | null;
  /** The next fire, when the schedules run. */
  nextRun: Date | null;
  last: { startedAt: string; endedAt: string | null; status: string; offline?: boolean; busy?: boolean; asked: number; blocked: string[]; summary: string | null } | null;
  /** Asks waiting in the inbox for this agent. */
  pending: number;
  /** Runs parked for an answer. */
  parked: number;
  runsToday: number;
  cap: number | null;
  costTodayUsd: number;
  /** Keys or sign-ins it still needs. */
  needs: string[];
}

export interface StatusFacts {
  agents: AgentFacts[];
  /** Whether the schedules are running (the login service, or garu ui --up). */
  up: boolean;
  now?: Date;
}

/** "in 25 min", "in 2 h 20 min", "tomorrow 7:00 AM", "Thu 8:00 AM". */
export function inWords(at: Date, now: Date): string {
  const ms = at.getTime() - now.getTime();
  if (ms < 60_000) return t("now");
  const min = Math.round(ms / 60_000);
  if (min < 60) return t("in {n} min", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24 && at.getDate() === now.getDate()) return min % 60 ? t("in {h} h {m} min", { h, m: min % 60 }) : t("in {h} h", { h });
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const clock = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (at.toDateString() === tomorrow.toDateString()) return t("tomorrow {time}", { time: clock });
  return `${at.toLocaleDateString(undefined, { weekday: "short" })} ${clock}`;
}

function ended(last: NonNullable<AgentFacts["last"]>): string {
  if (last.status === "parked") return t("parked for your answer");
  if (last.status === "running") return t("running");
  if (last.busy) return t("model busy");
  if (last.offline) return t("no network");
  return ({ ok: t("ok"), error: t("error"), blocked: t("blocked"), max_turns: t("hit turn limit"), budget_exceeded: t("over budget"), interrupted: t("interrupted") } as Record<string, string>)[last.status] ?? last.status;
}

export function statusLines(f: StatusFacts): string[] {
  const now = f.now ?? new Date();
  const out: string[] = [];
  const width = Math.max(4, ...f.agents.map((a) => a.name.length));
  for (const a of f.agents) {
    const state = a.pending ? (a.pending === 1 ? t("waiting for you") : t("waiting for you on {n}", { n: a.pending }))
      : a.parked ? t("parked for your answer")
      : a.last && !a.last.endedAt && a.last.status === "running" ? t("working")
      : a.needs.length ? t("needs setup: {list}", { list: a.needs.join(", ") })
      : a.cap && a.runsToday >= a.cap ? t("done for today")
      : a.cron && f.up && a.nextRun ? t("next {when}", { when: inWords(a.nextRun, now) })
      : a.cron ? t("scheduled, but schedules are off")
      : t("idle");
    const last = a.last
      ? `${t("last {when}", { when: localTime(a.last.startedAt, { date: localDay(a.last.startedAt) !== localDay(now), seconds: false }) })}: ${ended(a.last)}${a.last.asked ? `, ${a.last.asked === 1 ? t("asked you once") : t("asked you {n} times", { n: a.last.asked })}` : ""}${a.last.blocked.length ? `, ${t("blocked: {list}", { list: a.last.blocked.join(", ") })}` : ""}`
      : t("no runs yet");
    const today = a.runsToday ? ` · ${a.cap ? t("{n} of {cap} runs today", { n: a.runsToday, cap: a.cap }) : a.runsToday === 1 ? t("1 run today") : t("{n} runs today", { n: a.runsToday })}, ${formatUsd(a.costTodayUsd)}` : "";
    out.push(`${a.name.padEnd(width)}  ${state} · ${last}${today}`);
  }
  const waiting = f.agents.reduce((n, a) => n + a.pending, 0);
  out.push("");
  out.push(waiting ? (waiting === 1 ? t("1 ask is waiting for you: garu inbox") : t("{n} asks are waiting for you: garu inbox", { n: waiting })) : t("nothing is waiting on you"));
  if (!f.up) out.push(t("schedules are off: `garu ui --up`, or `garu service install` to run them at login"));
  return out;
}
