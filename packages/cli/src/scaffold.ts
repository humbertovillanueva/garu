/**
 * `garu new` — turn a few answers into a Garufile with a policy that starts
 * closed: only the tools you named, writes ask unless you said otherwise,
 * everything else blocked. Pure functions here; the questions live in the CLI.
 */

export type Schedule = "manual" | "weekday-morning" | "hourly" | "daily" | { cron: string };

export interface ScaffoldAnswers {
  name: string;
  /** What the agent does, in the user's words. First sentence becomes the description. */
  task: string;
  model: string;
  schedule: Schedule;
  /** Hosts the agent may fetch from. Empty array + web=true means "ask every time". */
  web: { hosts: string[] } | null;
  /** A folder the agent gets through the filesystem MCP server. */
  fs: { path: string; write: "ask" | "allow" } | null;
  /** Env var holding a Slack/Discord incoming webhook URL. */
  webhook: { envVar: string } | null;
  /** Per-run cap in USD; null for free/local models. */
  maxCostUsd: number | null;
  /** Repo-relative path to the fetch server, so the generated file works from the repo root. */
  fetchServerPath?: string;
}

export const SCHEDULES: Record<Exclude<Schedule, { cron: string }>, { cron: string | null; label: string }> = {
  manual: { cron: null, label: "when I tell it (Run job, a message, or garu run)" },
  "weekday-morning": { cron: "0 7 * * 1-5", label: "every weekday at 7:00" },
  hourly: { cron: "0 * * * *", label: "every hour" },
  daily: { cron: "0 9 * * *", label: "every day at 9:00" },
};

export function cronFor(s: Schedule): string | null {
  return typeof s === "string" ? SCHEDULES[s].cron : s.cron;
}

/** Default model for whichever provider the user has a key for. */
export function suggestModel(env: NodeJS.ProcessEnv): { model: string; why: string }[] {
  const out: { model: string; why: string }[] = [];
  if (env["GEMINI_API_KEY"]) out.push({ model: "gemini/gemini-3.5-flash-lite", why: "GEMINI_API_KEY is set · free tier" });
  if (env["ANTHROPIC_API_KEY"]) out.push({ model: "anthropic/claude-haiku-4-5", why: "ANTHROPIC_API_KEY is set" });
  out.push({ model: "ollama/qwen3:8b", why: env["OLLAMA_HOST"] ? "OLLAMA_HOST is set · local, $0" : "local via Ollama, $0 (needs `ollama pull qwen3:8b`)" });
  if (!env["GEMINI_API_KEY"]) out.push({ model: "gemini/gemini-3.5-flash-lite", why: "free tier · add GEMINI_API_KEY to .env" });
  return out;
}

export function isFreeModel(model: string): boolean {
  return model.startsWith("ollama/");
}

const q = (s: string) => JSON.stringify(s); // a JSON string is a valid YAML double-quoted scalar

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex source that matches https URLs on exactly these hosts (any path). */
export function hostsRegex(hosts: string[]): string {
  return `^https://(${hosts.map((h) => escapeRegex(h.trim().toLowerCase())).join("|")})(/|$)`;
}

function firstSentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  return (m ? m[1]! : t).slice(0, 140);
}

function titleCase(name: string): string {
  return name.split(/[-_]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function block(text: string, indent = "  "): string {
  return text.trimEnd().split("\n").map((l) => (l.trim() ? indent + l : "")).join("\n");
}

export function buildPrompt(a: ScaffoldAnswers): string {
  const who = titleCase(a.name);
  const lines = [`You are ${who}.`, "", a.task.trim(), ""];
  const abilities: string[] = [];
  if (a.web) abilities.push(a.web.hosts.length ? `read from ${a.web.hosts.join(", ")} with the web tools` : "read web pages and APIs with the web tools (each fetch may be reviewed first)");
  if (a.fs) abilities.push(`read${a.fs.write === "allow" ? " and write" : ""} files in your folder with the fs tools${a.fs.write === "ask" ? " (writes are reviewed first)" : ""}`);
  if (a.webhook) abilities.push("post a message to the channel with post_message (it is reviewed first)");
  if (abilities.length) lines.push("You can " + abilities.join("; ") + ".", "");
  lines.push(
    "Work only with the tools you are given. If a call is blocked or declined, say so briefly and continue without it; never retry the same blocked call.",
    "Use the current date and time from your context. Never invent facts, URLs or file contents; if you need a URL, repo, path or name that was not given to you, stop and ask for it in your reply instead of guessing.",
    "Keep replies short and concrete: what you did, what you found, anything that needs a human.",
  );
  return lines.join("\n");
}

/** The Garufile text. Comments explain each choice so the file teaches as it runs. */
export function renderGarufile(a: ScaffoldAnswers): string {
  const cron = cronFor(a.schedule);
  const fetchServer = a.fetchServerPath ?? "packages/mcp-fetch/dist/index.js";
  const out: string[] = [];
  out.push(`# ${titleCase(a.name)} — ${firstSentence(a.task)}`);
  out.push(`#`);
  out.push(`# Made with \`garu new\`. The policy starts closed: only the tools named below,`);
  out.push(`# ${a.fs?.write === "allow" ? "writes allowed inside its own folder" : "writes ask first"}, everything else blocked. Edit freely; \`garu validate\` checks it.`);
  out.push(``);
  out.push(`name: ${a.name}`);
  out.push(`description: ${q(firstSentence(a.task))}`);
  out.push(`model: ${a.model}`);
  out.push(``);
  if (cron) {
    out.push(`triggers:`);
    out.push(`  - cron: ${q(cron)}        # ${typeof a.schedule === "string" ? SCHEDULES[a.schedule].label : "custom"} · runs while \`garu ui --up\` is on`);
  } else {
    out.push(`triggers:`);
    out.push(`  - manual: true          # runs when you press Run job, send it a message, or \`garu run\``);
  }
  out.push(``);
  if (a.maxCostUsd !== null) {
    out.push(`budget:`);
    out.push(`  maxCostUsd: ${a.maxCostUsd}        # a run stops before it crosses this`);
    out.push(``);
  }
  out.push(`maxTurns: 10`);
  out.push(``);

  const tools: string[] = [];
  if (a.web || a.webhook) {
    tools.push(`  - name: web`);
    tools.push(`    command: node`);
    tools.push(`    args: [${q(fetchServer)}]`);
    if (a.webhook) {
      tools.push(`    env:`);
      tools.push(`      WEBHOOK_URL: ${q("${" + a.webhook.envVar + "}")}     # Slack or Discord incoming webhook, kept in .env`);
    }
  }
  if (a.fs) {
    tools.push(`  - name: fs`);
    tools.push(`    command: npx`);
    tools.push(`    args: ["-y", "@modelcontextprotocol/server-filesystem", ${q(a.fs.path)}]`);
  }
  if (tools.length) {
    out.push(`tools:`);
    out.push(...tools);
  } else {
    out.push(`tools: []                 # no tools: it can only think and reply`);
  }
  out.push(``);

  out.push(`policy:`);
  if (a.web) {
    if (a.web.hosts.length) {
      out.push(`  # Reading: only these hosts, by URL. Add a host here to widen it.`);
      out.push(`  - tool: "web.fetch_*"`);
      out.push(`    action: allow`);
      out.push(`    when:`);
      out.push(`      url: { matches: ${q(hostsRegex(a.web.hosts))} }`);
    } else {
      out.push(`  # Reading: no host list yet, so every fetch is reviewed. Approve a few and Garu`);
      out.push(`  # will propose the exact allow rule; or add a \`when: url: matches\` here.`);
      out.push(`  - tool: "web.fetch_*"`);
      out.push(`    action: ask`);
      out.push(`    reason: fetching a URL`);
    }
  }
  if (a.webhook) {
    out.push(`  # Posting to your channel: always ask. The model never sees or chooses the URL.`);
    out.push(`  - tool: "web.post_message"`);
    out.push(`    action: ask`);
    out.push(`    reason: posting to your channel`);
  }
  if (a.web || a.webhook) {
    out.push(`  - tool: "web.*"`);
    out.push(`    action: block`);
  }
  if (a.fs) {
    out.push(`  # Files: the server only sees ${a.fs.path}. Reads are fine; ${a.fs.write === "allow" ? "writes too, inside that folder." : "writes are reviewed."}`);
    out.push(`  - tool: "fs.list_*"`);
    out.push(`    action: allow`);
    out.push(`  - tool: "fs.read_*"`);
    out.push(`    action: allow`);
    out.push(`  - tool: "fs.get_file_info"`);
    out.push(`    action: allow`);
    out.push(`  - tool: "fs.search_files"`);
    out.push(`    action: allow`);
    out.push(`  - tool: "fs.write_file"`);
    out.push(`    action: ${a.fs.write}`);
    if (a.fs.write === "ask") out.push(`    reason: writing a file`);
    out.push(`  - tool: "fs.edit_file"`);
    out.push(`    action: ${a.fs.write}`);
    if (a.fs.write === "ask") out.push(`    reason: editing a file`);
    out.push(`  - tool: "fs.create_directory"`);
    out.push(`    action: ${a.fs.write}`);
    if (a.fs.write === "ask") out.push(`    reason: creating a folder`);
  }
  out.push(`  - tool: "*"`);
  out.push(`    action: block`);
  out.push(`    reason: not part of ${titleCase(a.name)}'s job`);
  out.push(``);
  out.push(`prompt: |`);
  out.push(block(buildPrompt(a)));
  out.push(``);
  return out.join("\n");
}
