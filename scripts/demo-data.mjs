#!/usr/bin/env node
// Seed .garu/ with realistic runs, a paused approval, a grant and some chat,
// so the control room has something to show without an API key or a model.
// For UI work and screenshots. Run from the repo root after `npm run build`:
//
//   node scripts/demo-data.mjs
//
// It only writes under .garu/ (gitignored) and never touches your Garufiles.

import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Recorder, Inbox, ChatStore } from "../packages/kernel/dist/index.js";

const root = resolve(process.cwd(), ".garu");
const runs = join(root, "runs");
mkdirSync(runs, { recursive: true });

const minutesAgo = (m) => new Date(Date.now() - m * 60_000);
const stamp = (d) => d.toISOString().replace(/[-:T]/g, "").slice(0, 15).replace(/^(\d{8})(\d{6}).*/, "$1-$2");
const hex = () => Math.random().toString(16).slice(2, 10);

const BRIEF = `# Morning brief — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
## Weather
High 71°F / Low 48°F, clear.
## Garu
3 stars, 1 fork, 0 open issues, pushed 2 hours ago.
## Writing
Make Document Pipelines Fail Loudly — 4 reactions, 1 comment.
## AI & agents on Hacker News
- Show HN: Durable Actors (212 pts) — a primitive for long-lived agents.
- Running agents inside Docker for dev workflows (96 pts).
- Agent.reviews — agents writing reviews for agents (41 pts).`;

/** Write one run as the kernel would, with timestamps spread over `secs` seconds ending `endMinutesAgo` ago. */
function run(agent, { model, trigger, steps, status = "ok", summary, cost, endMinutesAgo, secs = 6 }) {
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
  push({ type: "tools.offered", offered: ["web.fetch_json", "web.post_message", "fs.read_file", "fs.write_file"], hidden: ["fs.move_file", "fs.create_directory", "web.fetch_text"] });
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

const fetches = [
  { tool: "web.fetch_json", args: { url: "https://api.open-meteo.com/v1/forecast?latitude=40.76&longitude=-111.89&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit" }, action: "allow", ms: 412, result: '{"daily":{"temperature_2m_max":[71.2]}}' },
  { tool: "web.fetch_json", args: { url: "https://api.github.com/repos/humbertovillanueva/garu" }, action: "allow", ms: 288, result: '{"stargazers_count":3}' },
  { tool: "web.fetch_json", args: { url: "https://dev.to/api/articles?username=humbertovillanueva" }, action: "allow", ms: 190, result: "[...]" },
  { tool: "web.fetch_json", args: { url: "https://hn.algolia.com/api/v1/search?query=agents&tags=story" }, action: "allow", ms: 355, result: '{"hits":[...]}' },
];
const write = { tool: "fs.write_file", args: { path: `agents/tomay/briefs/${new Date().toISOString().slice(0, 10)}.md`, content: BRIEF }, action: "allow", rule: 4, ms: 4, result: "Successfully wrote file" };
const post = (extra) => ({ tool: "web.post_message", args: { text: BRIEF }, action: "ask", rule: 1, reason: "posting the brief to your channel", ms: 265, result: "posted 612 chars to hooks.slack.com", ...extra });

// Yesterday's and earlier briefs: the whole flow, approved.
for (const d of [1, 2, 3]) {
  run("tomay", { model: "gemini/gemini-3.5-flash-lite", trigger: "cron", endMinutesAgo: d * 1440 - 420, secs: 9, cost: 0.0029,
    summary: "I wrote today's brief and posted it to your channel.",
    steps: [{ turn: true, cost: 0.0003 }, ...fetches, { turn: true, cost: 0.0012, in: 11200, out: 510 }, write, { turn: true, cost: 0.0011, in: 11400, out: 223 }, post({})] });
}
// Right now: paused on the post.
const pausedRun = run("tomay", { model: "gemini/gemini-3.5-flash-lite", trigger: "chat", endMinutesAgo: 0.5, secs: 7,
  steps: [{ turn: true, cost: 0.0003 }, ...fetches, { turn: true, cost: 0.0012, in: 11200, out: 510 }, write, { turn: true, cost: 0.0011, in: 11400, out: 223 }, post({ pending: true })] });

// Two pip runs on a local model: one approved write, one declined.
run("pip", { model: "ollama/qwen3:8b", trigger: "manual", endMinutesAgo: 95, secs: 14, cost: 0,
  summary: "Summarised the three notes in the workspace into SUMMARY.md.",
  steps: [{ turn: true, cost: 0 }, { tool: "fs.read_file", args: { path: "examples/pip/workspace/notes.md" }, action: "allow", ms: 3, result: "..." }, { turn: true, cost: 0 }, { tool: "fs.write_file", args: { path: "examples/pip/workspace/SUMMARY.md", content: "# Summary\n\n- …" }, action: "ask", rule: 2, reason: "writing outside the notes folder" }, { turn: true, cost: 0 }] });
run("pip", { model: "ollama/qwen3:8b", trigger: "manual", endMinutesAgo: 180, secs: 11, status: "ok", cost: 0,
  summary: "You declined the write, so I left the summary in this message instead.",
  steps: [{ turn: true, cost: 0 }, { tool: "fs.write_file", args: { path: "examples/pip/workspace/SUMMARY.md", content: "# Summary" }, action: "ask", rule: 2, approved: false, reason: "writing outside the notes folder" }, { turn: true, cost: 0 }] });
for (let h = 1; h <= 6; h++) {
  run("tick", { model: "gemini/gemini-3.5-flash-lite", trigger: "cron", endMinutesAgo: h * 60, secs: 5, cost: 0.0016,
    summary: `${new Date(Date.now() - h * 3600_000).toISOString()} — 2 file(s): .gitkeep, tick.log`,
    steps: [{ turn: true, cost: 0.0003 }, { tool: "fs.list_directory", args: { path: "examples/tick/workspace" }, action: "allow", ms: 2, result: "[FILE] tick.log" }, { turn: true, cost: 0.0013 }, { tool: "fs.write_file", args: { path: "examples/tick/workspace/tick.log", content: "…" }, action: "allow", ms: 3 }] });
}

// The paused approval, waiting in the inbox.
const inbox = new Inbox({ root: join(root, "inbox") });
const req = {
  id: hex().slice(0, 6), agent: "tomay", runId: pausedRun, callId: crypto.randomUUID(), tool: "web.post_message",
  args: { text: BRIEF }, reason: "posting the brief to your channel",
  createdAt: minutesAgo(0.5).toISOString(), expiresAt: new Date(Date.now() + 29.5 * 60_000).toISOString(),
};
writeFileSync(join(inbox.root, `${req.id}.json`), JSON.stringify(req, null, 2));

// A temporary allow from yesterday.
appendFileSync(join(root, "grants.jsonl"), JSON.stringify({ id: hex().slice(0, 6), agent: "tick", tool: "fs.write_file", scope: { key: "path", value: "examples/tick/workspace/tick.log" }, createdBy: "Humberto (ui)", createdAt: minutesAgo(600).toISOString(), expiresAt: new Date(Date.now() + 14 * 3600_000).toISOString(), uses: 6 }) + "\n");

// Chat with tomay.
const chat = new ChatStore(join(root, "chat"));
chat.append("tomay", { role: "user", text: "hey", kind: "chat", ts: minutesAgo(130).toISOString() });
chat.append("tomay", { role: "agent", text: "Hey Humberto! Today's brief is in your briefs folder. Want me to post it?", kind: "chat", ts: minutesAgo(129.8).toISOString() });
chat.append("tomay", { role: "user", text: "write today's brief and post it", kind: "chat", ts: minutesAgo(0.6).toISOString(), runId: pausedRun });

console.log(`seeded ${root}`);
