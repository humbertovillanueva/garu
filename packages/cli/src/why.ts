/**
 * garu why, in words: the run page's "Why it did that" as lines for the terminal, from the kernel's
 * explainRun. Same sentences as the control room, so the two can't drift apart.
 */
import { explainRun, type Envelope } from "@garu/kernel";
import { t } from "./i18n.js";

/** The run page's "Why it did that", one line per point, for the terminal. */
export function whyLines(events: Envelope[]): string[] {
  const why = explainRun(events);
  const times = (n: number) => (n > 1 ? ` ×${n}` : "");
  const out: string[] = [];
  const nAllowed = why.allowed.reduce((s, a) => s + a.n, 0);
  const allowed = why.allowed.map((a) => `${a.tool}${times(a.n)}${a.rule !== a.tool ? ` (${t("rule {rule}", { rule: a.rule })})` : ""}`).join(", ");
  if (nAllowed) out.push(nAllowed === 1 ? t("1 call went through on its own: {list}", { list: allowed }) : t("{n} calls went through on their own: {list}", { n: nAllowed, list: allowed }));
  for (const a of why.asked) {
    const outcome = [
      a.approved ? `${t("approved by {who}", { who: t("you") })}${times(a.approved)}` : "",
      a.declined ? `${t("declined by {who}", { who: t("you") })}${times(a.declined)}${a.notes.length ? ` (“${a.notes.join("”, “")}”)` : ""}` : "",
      a.expired ? `${t("expired, no answer")}${times(a.expired)}` : "",
      a.grant ? `${t("allowed by your 24h approval")}${times(a.grant)}` : "",
    ].filter(Boolean).join(", ") || t("waiting for you");
    out.push(a.n === 1 ? t("{tool} asked you once: {outcome}", { tool: a.tool, outcome }) : t("{tool} asked you {n} times: {outcome}", { tool: a.tool, n: a.n, outcome }));
  }
  const nBlocked = why.blocked.reduce((s, b) => s + b.n, 0);
  const blocked = why.blocked.map((b) => `${b.tool}${times(b.n)}${b.reason ? ` (${b.reason})` : ""}`).join(", ");
  if (nBlocked) out.push(nBlocked === 1 ? t("1 call was blocked by the policy: {list}", { list: blocked }) : t("{n} calls were blocked by the policy: {list}", { n: nBlocked, list: blocked }));
  if (why.hidden.length) out.push(why.hidden.length === 1 ? t("1 tool was never offered, since no rule could allow it: {list}", { list: why.hidden.join(", ") }) : t("{n} tools were never offered, since no rule could allow them: {list}", { n: why.hidden.length, list: why.hidden.join(", ") }));
  const s = why.stopped;
  if (s === "busy") out.push(t("It stopped because the model was busy; nothing was changed, and the schedule tries again."));
  else if (s === "offline") out.push(t("It stopped because the network went away; nothing was changed, and the schedule tries again."));
  else if (s === "budget") out.push(t("It stopped at its budget cap."));
  else if (s === "max_turns") out.push(t("It stopped at its turn limit."));
  else if (s === "blocked") out.push(t("It stopped: the policy blocked what it needed."));
  else if (s) out.push(t("It stopped with an error: {message}", { message: s.replace(/^error: /, "") }));
  if (!out.length) out.push(t("It made no tool calls and ran to the end."));
  return out;
}

