#!/usr/bin/env node
// Seed .garu/ with realistic runs, a paused approval, a grant and some chat,
// so the control room has something to show without an API key or a model.
// For UI work and screenshots. Run from the repo root after `npm run build`:
//
//   node scripts/demo-data.mjs
//
// It only writes under .garu/ (gitignored) and never touches your Garufiles.
// The people, meetings and emails are made up (example.com); the agents, their
// tools, rules and schedules are the real ones in agents/.

import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Recorder, Inbox, ChatStore } from "../packages/kernel/dist/index.js";

const root = resolve(process.cwd(), ".garu");
const runs = join(root, "runs");
mkdirSync(runs, { recursive: true });

const minutesAgo = (m) => new Date(Date.now() - m * 60_000);
const stamp = (d) => d.toISOString().replace(/[-:T]/g, "").slice(0, 15).replace(/^(\d{8})(\d{6}).*/, "$1-$2");
const hex = () => Math.random().toString(16).slice(2, 10);
const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
/** How many minutes ago hh:mm was on the last `n` weekdays where it has already passed, newest first. */
function weekdayMornings(n, h, m) {
  const now = new Date();
  const out = [];
  for (let back = 0; out.length < n && back < 21; back++) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, m);
    if (t.getDay() === 0 || t.getDay() === 6 || t > now) continue;
    out.push((now.getTime() - t.getTime()) / 60_000);
  }
  return out;
}

const BRIEF = `# Your day — ${today}
## Schedule
- 10:00 Design review with Lena and Sam (prep below)
- 12:30 Lunch with Priya (prep below)
- 15:00 1:1 with Jordan (prep below)
- 16:30 Focus: write the launch post
## Free blocks
8:00–10:00 · 11:00–12:30 · 13:30–15:00 · 15:30–16:30
## 10:00 · Design review
- **Who:** Lena Ortiz (design) and Sam Park (engineering).
- **Last time:** Thursday, Lena sent the homepage draft; Sam asked whether the hero image slows the page down.
- **Still open:** the pricing copy Lena is waiting on.
- **Bring:** the pricing copy, or a date for it.
## 12:30 · Lunch with Priya
- **Who:** Priya Nair.
- **Last time:** Tuesday, she suggested the Thai place on 3rd and asked how the trip went.
- **Still open:** nothing open.
## 15:00 · 1:1 with Jordan
- **Who:** Jordan Lee.
- **Last time:** Friday, Jordan shared the Q4 plan and asked for comments before this meeting.
- **Still open:** your comments on the Q4 plan.
- **Bring:** your notes on the plan.`;

const DRAFT = {
  to: ["Lena Ortiz <lena@example.com>"],
  subject: "Re: Homepage draft",
  body: "Hi Lena,\n\nThanks for sending the homepage draft, it reads well. I'll get back to you on the pricing copy before our review.\n\nHumberto",
  threadId: "18c2f04a9e7b1d36",
};

/** Write one run as the kernel would, with timestamps spread over `secs` seconds ending `endMinutesAgo` ago. */
function run(agent, { model, trigger, offered, hidden = [], steps, status = "ok", summary, cost, endMinutesAgo, secs = 6 }) {
  const end = minutesAgo(endMinutesAgo);
  const start = new Date(end.getTime() - secs * 1000);
  const runId = `${stamp(start)}-${hex()}`;
  const rec = new Recorder({ root: runs, agent, runId });
  const total = steps.length * 4 + 3;
  let i = 0;
  const at = () => new Date(start.getTime() + ((end.getTime() - start.getTime()) * Math.min(i++, total)) / total).toISOString();
  const lines = [];
  const push = (event) => lines.push(JSON.stringify({ seq: lines.length + 1, ts: at(), runId, agent, event }));
  push({ type: "run.start", agent, model, trigger });
  push({ type: "tools.offered", offered, hidden });
  let turn = 0;
  let spent = 0;
  for (const s of steps) {
    if (s.turn) { turn++; spent += s.cost ?? 0.0004; push({ type: "model.turn", turn, inputTokens: s.in ?? 2400 * turn, outputTokens: s.out ?? 240, costUsd: s.cost ?? 0.0004, totalCostUsd: spent }); continue; }
    const callId = crypto.randomUUID();
    const [server, tool] = s.tool.split(".");
    push({ type: "tool.request", callId, request: { server, tool, args: s.args } });
    push({ type: "policy.decision", callId, decision: { action: s.action, ruleIndex: s.rule ?? 0, matched: s.tool, reason: s.reason ?? "" } });
    if (s.action === "ask") {
      push({ type: "approval.requested", callId });
      if (s.pending) break;
      push({ type: "approval.resolved", callId, approved: s.approved ?? true, by: "Humberto (ui)" });
      if (!(s.approved ?? true)) { push({ type: "tool.result", callId, ok: false, durationMs: 0, error: "declined by Humberto (ui)" }); continue; }
    }
    if (s.action === "block") { push({ type: "tool.result", callId, ok: false, durationMs: 0, error: "blocked by policy" }); continue; }
    push({ type: "tool.result", callId, ok: true, durationMs: s.ms ?? 300, result: [{ type: "text", text: s.result ?? "ok" }] });
  }
  if (!steps.some((s) => s.pending)) push({ type: "run.end", status, summary, costUsd: cost ?? spent, priced: true });
  writeFileSync(rec.path, lines.join("\n") + "\n");
  return runId;
}

// Tomay: reads the calendar and the mail with the people in each meeting, writes the day's brief.
// Rule numbers are agents/tomay/Garufile.yaml's, counted from 0.
const TOMAY_TOOLS = {
  offered: ["calendar.list_calendars", "calendar.list_events", "calendar.get_event", "gmail.search_threads", "gmail.get_thread", "fs.list_allowed_directories", "fs.list_directory", "fs.read_text_file", "fs.write_file"],
  hidden: ["gmail.list_labels", "gmail.list_drafts", "gmail.label_thread", "gmail.create_draft", "fs.edit_file", "fs.move_file", "fs.create_directory"],
};
const day = new Date().toISOString().slice(0, 10);
const tomaySteps = [
  { turn: true, cost: 0.0002 },
  { tool: "calendar.list_calendars", args: {}, action: "allow", rule: 0, ms: 230, result: '[{"id":"primary","name":"Humberto","primary":true}]' },
  { turn: true, cost: 0.0003 },
  { tool: "calendar.list_events", args: { calendarId: "primary", timeMin: `${day}T00:00:00-06:00`, timeMax: `${day}T23:59:59-06:00` }, action: "allow", rule: 1, ms: 180, result: '{"events":[{"title":"Design review"},{"title":"Lunch with Priya"},{"title":"1:1 with Jordan"},{"title":"Focus: write the launch post"}]}' },
  { turn: true, cost: 0.0004 },
  { tool: "gmail.search_threads", args: { query: "from:lena@example.com OR from:sam@example.com newer_than:60d" }, action: "allow", rule: 4, ms: 520, result: '{"threads":[{"subject":"Homepage draft"}]}' },
  { tool: "gmail.search_threads", args: { query: "from:priya@example.com newer_than:60d" }, action: "allow", rule: 4, ms: 470, result: '{"threads":[{"subject":"Lunch Monday?"}]}' },
  { tool: "gmail.search_threads", args: { query: "from:jordan@example.com newer_than:60d" }, action: "allow", rule: 4, ms: 490, result: '{"threads":[{"subject":"Q4 plan"}]}' },
  { turn: true, cost: 0.0005 },
  { tool: "gmail.get_thread", args: { threadId: "18c2f04a9e7b1d36" }, action: "allow", rule: 5, ms: 160, result: '{"subject":"Homepage draft","messages":[…]}' },
  { tool: "gmail.get_thread", args: { threadId: "18c2e7713b0c5a12" }, action: "allow", rule: 5, ms: 140, result: '{"subject":"Q4 plan","messages":[…]}' },
  { turn: true, cost: 0.0006 },
  { tool: "fs.list_allowed_directories", args: {}, action: "allow", rule: 7, ms: 4, result: "agents/tomay/briefs" },
  { turn: true, cost: 0.0007, in: 9800, out: 620 },
  { tool: "fs.write_file", args: { path: `agents/tomay/briefs/${day}.md`, content: BRIEF }, action: "allow", rule: 9, ms: 5, result: "Successfully wrote file" },
  { turn: true, cost: 0.0004 },
];
const TOMAY_SUMMARIES = [
  "3 meetings today. The design review needs the most prep: Lena is still waiting on the pricing copy. Longest free block: 8:00 to 10:00.",
  "2 meetings. The call with Dana needs the most prep: she asked for last year's receipts. Longest free block: 1:00 to 4:00.",
  "No meetings with other people today. Longest free block: 8:00 to 12:00.",
  "4 meetings. The planning session needs the most prep: Sam asked for the launch dates. Longest free block: 2:00 to 4:00.",
];
weekdayMornings(4, 7, 0).forEach((ago, i) => {
  run("tomay", { model: "gemini/gemini-3.5-flash-lite", trigger: "cron:0 7 * * 1-5", ...TOMAY_TOOLS, endMinutesAgo: ago - 0.2, secs: 11, steps: tomaySteps, summary: TOMAY_SUMMARIES[i] });
});

// Bea: files the last day's mail under four labels and drafts replies; every draft waits for you.
// Rule numbers are agents/bea/Garufile.yaml's, counted from 0.
const BEA_TOOLS = { offered: ["gmail.search_threads", "gmail.get_thread", "gmail.list_labels", "gmail.list_drafts", "gmail.label_thread", "gmail.create_draft"], hidden: [] };
const draft = (to, subject, body, threadId, extra = {}) => ({ tool: "gmail.create_draft", args: { to: [to], subject, body, threadId }, action: "ask", rule: 5, reason: "a draft reply in your name", ms: 460, result: '{"saved":"in Drafts, not sent"}', ...extra });
const JORDAN = draft("Jordan Lee <jordan@example.com>", "Re: Q4 plan", "Hi Jordan,\n\nThanks for sharing the Q4 plan. I'll send you my comments before our 1:1.\n\nHumberto", "18c2e7713b0c5a12");
const SAM = draft("Sam Park <sam@example.com>", "Re: Hero image", "Hi Sam,\n\nThanks for checking. I'll get back to you about the hero image before the design review.\n\nHumberto", "18c2c9b04d1e7a55");
const PRIYA = draft("Priya Nair <priya@example.com>", "Re: Lunch Monday?", "Hi Priya,\n\nMonday works. The Thai place on 3rd sounds good, see you at 12:30.\n\nHumberto", "18c2d1f65a2e9c40");
const label = (name, n) => ({ tool: "gmail.label_thread", args: { threadIds: Array.from({ length: n }, () => hex() + hex()), labelIds: [`Label_${name}`] }, action: "allow", rule: 4, ms: 380, result: `{"added":["Garu/${name}"],"filed":${n}}` });
const beaSteps = (counts, drafts) => [
  { turn: true, cost: 0.0001 },
  { tool: "gmail.list_labels", args: {}, action: "allow", rule: 2, ms: 210, result: '[{"name":"Garu/Needs reply"},{"name":"Garu/FYI"},{"name":"Garu/Receipts"},{"name":"Garu/Newsletters"}]' },
  { turn: true, cost: 0.0003 },
  { tool: "gmail.search_threads", args: { query: "in:inbox newer_than:1d -label:garu-needs-reply -label:garu-fyi -label:garu-receipts -label:garu-newsletters" }, action: "allow", rule: 0, ms: 640, result: '{"threads":[…18 threads…]}' },
  { turn: true, cost: 0.0006 },
  { tool: "gmail.get_thread", args: { threadId: "18c2f04a9e7b1d36" }, action: "allow", rule: 1, ms: 150, result: '{"subject":"Homepage draft"}' },
  { tool: "gmail.get_thread", args: { threadId: "18c2e7713b0c5a12" }, action: "allow", rule: 1, ms: 140, result: '{"subject":"Q4 plan"}' },
  { turn: true, cost: 0.0007 },
  ...Object.entries(counts).map(([name, n]) => label(name, n)),
  ...drafts.flatMap((d) => [{ turn: true, cost: 0.0006 }, d]),
  { turn: true, cost: 0.0004 },
];
// Approved drafts also stay in the inbox as decided requests: that history is what Garu's
// "stop asking?" suggestion learns from (three approvals of bea → gmail.create_draft).
const inbox = new Inbox({ root: join(root, "inbox") });
function approved(agent, runId, step, agoMinutes) {
  const at = minutesAgo(agoMinutes);
  const r = { id: hex().slice(0, 6), agent, runId, callId: crypto.randomUUID(), tool: step.tool, args: step.args, reason: step.reason,
    createdAt: new Date(at.getTime() - 40_000).toISOString(), expiresAt: new Date(at.getTime() + 29 * 60_000).toISOString(),
    decision: { approved: true, by: "Humberto (ui)", at: at.toISOString() } };
  writeFileSync(join(inbox.root, `${r.id}.json`), JSON.stringify(r, null, 2));
}

// Earlier mornings, each draft approved.
const [, ...earlier] = weekdayMornings(3, 7, 15);
const BEA_DAYS = [
  { summary: "9 new: 1 needs a reply (draft ready), 2 receipts, 5 newsletters, 1 FYI\nPriya Nair: asks if Monday lunch still works.", counts: { Newsletters: 5, Receipts: 2, FYI: 1, "Needs reply": 1 }, drafts: [PRIYA] },
  { summary: "11 new: 1 needs a reply (draft ready), 1 receipt, 7 newsletters, 2 FYI\nSam Park: asks whether the hero image slows the page.", counts: { Newsletters: 7, Receipts: 1, FYI: 2, "Needs reply": 1 }, drafts: [SAM] },
];
earlier.forEach((ago, i) => {
  const d = BEA_DAYS[i];
  const id = run("bea", { model: "gemini/gemini-3.5-flash-lite", trigger: "cron:15 7 * * 1-5", ...BEA_TOOLS, endMinutesAgo: ago - 0.25, secs: 14, steps: beaSteps(d.counts, d.drafts), summary: d.summary });
  for (const s of d.drafts) approved("bea", id, s, ago - 0.2);
});
// Right now: 18 new threads filed, Jordan's draft approved, paused on Lena's, waiting for you.
const pausedRun = run("bea", { model: "gemini/gemini-3.5-flash-lite", trigger: "ui", ...BEA_TOOLS, endMinutesAgo: 0.5, secs: 12,
  steps: beaSteps({ Newsletters: 11, Receipts: 3, FYI: 2, "Needs reply": 2 }, [JORDAN, { ...draft(DRAFT.to[0], DRAFT.subject, DRAFT.body, DRAFT.threadId), pending: true }]) });
approved("bea", pausedRun, JORDAN, 0.8);

// Two pip runs on a local model: one approved write, one declined.
const PIP_TOOLS = { offered: ["fs.read_text_file", "fs.list_directory", "fs.write_file"], hidden: ["fs.move_file", "fs.create_directory"] };
run("pip", { model: "ollama/qwen3:8b", trigger: "manual", ...PIP_TOOLS, endMinutesAgo: 95, secs: 14, cost: 0,
  summary: "Summarised the three notes in the workspace into SUMMARY.md.",
  steps: [{ turn: true, cost: 0 }, { tool: "fs.read_text_file", args: { path: "examples/pip/workspace/notes.md" }, action: "allow", ms: 3, result: "..." }, { turn: true, cost: 0 }, { tool: "fs.write_file", args: { path: "examples/pip/workspace/SUMMARY.md", content: "# Summary\n\n- …" }, action: "ask", rule: 2, reason: "writing outside the notes folder" }, { turn: true, cost: 0 }] });
run("pip", { model: "ollama/qwen3:8b", trigger: "manual", ...PIP_TOOLS, endMinutesAgo: 180, secs: 11, status: "ok", cost: 0,
  summary: "You declined the write, so I left the summary in this message instead.",
  steps: [{ turn: true, cost: 0 }, { tool: "fs.write_file", args: { path: "examples/pip/workspace/SUMMARY.md", content: "# Summary" }, action: "ask", rule: 2, approved: false, reason: "writing outside the notes folder" }, { turn: true, cost: 0 }] });
// Tick runs on the hour, as its schedule does (so `garu ui --up` on this data has nothing to catch up).
const sinceHour = new Date().getMinutes() + new Date().getSeconds() / 60;
for (let h = 1; h <= 6; h++) {
  run("tick", { model: "gemini/gemini-3.5-flash-lite", trigger: "cron:0 * * * *", offered: ["fs.list_directory", "fs.write_file"], hidden: [], endMinutesAgo: sinceHour + (h - 1) * 60 - 0.15, secs: 5, cost: 0.0016,
    summary: "Nothing new: 2 files.",
    steps: [{ turn: true, cost: 0.0003 }, { tool: "fs.list_directory", args: { path: "examples/tick/workspace" }, action: "allow", ms: 2, result: "[FILE] tick.log" }, { turn: true, cost: 0.0013 }, { tool: "fs.write_file", args: { path: "examples/tick/workspace/tick.log", content: "…" }, action: "allow", ms: 3 }] });
}

// The paused draft, waiting in the inbox.
const req = {
  id: hex().slice(0, 6), agent: "bea", runId: pausedRun, callId: crypto.randomUUID(), tool: "gmail.create_draft",
  args: DRAFT, reason: "a draft reply in your name",
  createdAt: minutesAgo(0.5).toISOString(), expiresAt: new Date(Date.now() + 29.5 * 60_000).toISOString(),
};
writeFileSync(join(inbox.root, `${req.id}.json`), JSON.stringify(req, null, 2));

// A temporary allow from yesterday.
appendFileSync(join(root, "grants.jsonl"), JSON.stringify({ id: hex().slice(0, 6), agent: "tick", tool: "fs.write_file", scope: { key: "path", value: "examples/tick/workspace/tick.log" }, createdBy: "Humberto (ui)", createdAt: minutesAgo(600).toISOString(), expiresAt: new Date(Date.now() + 14 * 3600_000).toISOString(), uses: 6 }) + "\n");

// Chat with tomay.
const chat = new ChatStore(join(root, "chat"));
chat.append("tomay", { role: "user", text: "what's on today?", kind: "chat", ts: minutesAgo(50).toISOString() });
chat.append("tomay", { role: "agent", text: "Three meetings: the design review at 10, lunch with Priya at 12:30 and your 1:1 with Jordan at 3. The review needs the most prep; it's all in today's brief.", kind: "chat", ts: minutesAgo(49.8).toISOString() });

console.log(`seeded ${root}`);
