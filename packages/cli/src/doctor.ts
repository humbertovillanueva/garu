/**
 * garu doctor: the things that go wrong quietly on an owner's computer, checked in one go and said in
 * plain words. Node too old, a key missing from .env, a Garufile that doesn't parse, a Google sign-in
 * about to die, the login service not running, Tailscale not serving the phone, asks waiting past
 * their welcome, runs parked for an answer. The checks are pure: the command gathers the facts and
 * hands them here, so the words can be tested without a computer to be wrong about.
 */
import { t } from "./i18n.js";

export interface DoctorFacts {
  /** process.versions.node */
  node: string;
  /** Whether a .env sits in the folder. */
  dotEnv: boolean;
  /** The `${VAR}`s the Garufiles reference, with whether each is set. */
  keys: { name: string; set: boolean }[];
  /** The optional keys Garu itself reads, with whether each is set. */
  optional: { name: string; set: boolean; does: string }[];
  agents: string[];
  /** Garufiles that didn't parse. */
  problems: { source: string; error: string }[];
  /** Every sign-in a Garufile asks for: when it was done (null = never), and whether Google ends it at seven days. */
  signIns: { agent: string; source: string; server: string; at: Date | null; google: boolean }[];
  /** The login service: null where this platform has none. */
  service: { installed: boolean; running: boolean } | null;
  /** Tailscale's addresses for the control room; empty when it isn't serving it. */
  tailscale: string[];
  /** The outage the control room noted, if Tailscale stopped serving it. */
  reachLost: { since: string } | null;
  /** Asks waiting in the inbox, with when each expires. */
  pending: { agent: string; tool: string; expiresAt: string }[];
  /** Runs parked for an answer. */
  parked: number;
  /** The control room's build stamp on disk, and the one the running control room serves (null when it isn't answering). */
  build?: { onDisk: string | null; served: string | null };
  now?: Date;
}

export type Verdict = "ok" | "warn" | "bad";
export interface Check { verdict: Verdict; text: string }

export function doctor(f: DoctorFacts): Check[] {
  const now = f.now ?? new Date();
  const out: Check[] = [];
  const say = (verdict: Verdict, text: string) => out.push({ verdict, text });

  const major = Number(f.node.split(".")[0]);
  if (major >= 22) say("ok", t("Node {version}", { version: f.node }));
  else say("bad", t("Node {version} is too old; Garu needs 22 or newer", { version: f.node }));

  if (f.agents.length) say("ok", f.agents.length === 1 ? t("1 agent: {list}", { list: f.agents.join(", ") }) : t("{n} agents: {list}", { n: f.agents.length, list: f.agents.join(", ") }));
  else say("warn", t("no agents found under this folder; `garu new` makes one"));
  for (const p of f.problems) say("bad", t("{source} doesn't load: {error}", { source: p.source, error: p.error }));

  const missing = f.keys.filter((k) => !k.set).map((k) => k.name);
  if (!f.dotEnv && f.keys.length) say("bad", t("no .env in this folder, and the agents reference {list}", { list: f.keys.map((k) => k.name).join(", ") }));
  else if (missing.length) say("bad", missing.length === 1 ? t("{name} is referenced by an agent but not set in .env", { name: missing[0]! }) : t("{list} are referenced by agents but not set in .env", { list: missing.join(", ") }));
  else if (f.keys.length) say("ok", t("every key the agents reference is set in .env ({list})", { list: f.keys.map((k) => k.name).join(", ") }));
  for (const o of f.optional) say(o.set ? "ok" : "warn", o.set ? t("{name} is set: {does}", { name: o.name, does: o.does }) : t("{name} is not set: {does}", { name: o.name, does: o.does }));

  for (const s of f.signIns) {
    if (!s.at) { say("bad", t("{agent}'s {server} is not signed in; run: {command}", { agent: s.agent, server: s.server, command: `garu auth ${s.source} ${s.server}` })); continue; }
    const days = Math.floor((now.getTime() - s.at.getTime()) / 86_400_000);
    if (s.google && days >= 7) say("bad", t("{agent}'s {server} sign-in is {days} days old; Google ended it at 7. Sign in again: {command}", { agent: s.agent, server: s.server, days, command: `garu auth ${s.source} ${s.server}` }));
    else if (s.google && days >= 6) say("warn", t("{agent}'s {server} sign-in is {days} days old; Google ends it at 7. Sign in again: {command}", { agent: s.agent, server: s.server, days, command: `garu auth ${s.source} ${s.server}` }));
    else say("ok", s.google ? t("{agent}'s {server} sign-in is {days} days old (Google ends it at 7)", { agent: s.agent, server: s.server, days }) : t("{agent}'s {server} is signed in", { agent: s.agent, server: s.server }));
  }

  if (f.service === null) say("warn", t("no login service on this platform; `garu ui --up` has to be started by hand"));
  else if (!f.service.installed) say("warn", t("the login service is not installed, so a reboot takes the schedules down; `garu service install` sets it up"));
  else if (!f.service.running) say("bad", t("the login service is installed but not running; `garu service restart` starts it"));
  else say("ok", t("the login service is running"));

  if (f.build?.served && f.build.onDisk) {
    if (f.build.served === f.build.onDisk) say("ok", t("the control room serves the build in this folder ({build})", { build: f.build.onDisk }));
    else say("warn", t("the control room serves an older build ({served}) than this folder has ({onDisk}); `npm run deploy` restarts it on the new one", { served: f.build.served, onDisk: f.build.onDisk }));
  }
  if (f.reachLost) say("bad", t("Tailscale hasn't served the control room since {since}; the phone can't reach it. Open Tailscale on this computer.", { since: f.reachLost.since }));
  else if (f.tailscale.length) say("ok", t("Tailscale serves the control room at {url}", { url: f.tailscale[0]! }));
  else say("warn", t("Tailscale isn't serving the control room, so a phone can't reach it from outside this computer (docs/phone.md)"));

  const overdue = f.pending.filter((p) => Date.parse(p.expiresAt) <= now.getTime());
  if (overdue.length) say("warn", overdue.length === 1 ? t("1 ask is past its time and will be declined at the next sweep: {list}", { list: overdue.map((p) => `${p.agent} → ${p.tool}`).join(", ") }) : t("{n} asks are past their time and will be declined at the next sweep", { n: overdue.length }));
  const waiting = f.pending.length - overdue.length;
  if (waiting) say("warn", waiting === 1 ? t("1 ask is waiting for you in the inbox") : t("{n} asks are waiting for you in the inbox", { n: waiting }));
  if (f.parked) say("warn", f.parked === 1 ? t("1 run is parked for your answer") : t("{n} runs are parked for your answer", { n: f.parked }));
  if (!f.pending.length && !f.parked) say("ok", t("nothing is waiting on you"));
  return out;
}

export const MARK: Record<Verdict, string> = { ok: "✔", warn: "○", bad: "✖" };
