export type RunStatus = "running" | "parked" | "interrupted" | "ok" | "error" | "blocked" | "max_turns" | "budget_exceeded";

export interface RunSummary {
  agent: string;
  runId: string;
  startedAt: string;
  endedAt: string | null;
  status: RunStatus;
  /** Ended before the model answered because the network was down. */
  offline?: boolean;
  /** The offline run's reason was a busy model, not the network. */
  busy?: { model: string; reason: string };
  trigger: string;
  model: string;
  sandbox: { image: string; network: string } | null;
  turns: number;
  toolCalls: { allow: number; ask: number; block: number };
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  priced: boolean;
  summary: string | null;
}

export type AgentStatus = "idle" | "scheduled" | "working" | "waiting" | "needs-setup";

export interface Agent {
  name: string;
  description: string;
  persona: { kind: "owl" | "fox" | "turtle" | "bee" | "cat" | "octopus" | "rabbit" | "bear" | "frog" | "penguin" | "raccoon" | "whale"; tagline?: string } | null;
  model: string | null;
  source: string | null;
  configured: boolean;
  /** ${VAR}s its tool servers need that are not set in .env. */
  needs: string[];
  /** Remote servers with auth: oauth that have no saved sign-in yet. */
  signIn: string[];
  /** Google sign-ins six days old or more: Google ends them at seven while the OAuth app is in Testing. */
  signInExpiring?: { server: string; days: number }[];
  status: AgentStatus;
  /** The run in progress; its id is known once the recorder has written run.start. */
  inFlight: { runId: string | null; startedAt: string; turn: number; trigger: string } | null;
  pending: number;
  cron: string | null;
  nextRun: string | null;
  tools: string[];
  policy: { rules: number; allow: number; ask: number; block: number } | null;
  sandbox: { image: string; network: string } | null;
  budget: { maxCostUsd: number | null; free: boolean; maxRunsPerDay: number | null } | null;
  /** Today's runs have reached budget.maxRunsPerDay: nothing more starts until tomorrow. */
  capped: boolean;
  maxTurns: number | null;
  /** The Garufile gave it a notebook (memory: true). */
  memory: boolean;
  runs: number;
  runsToday: number;
  costTodayUsd: number;
  lastRun: RunSummary | null;
}

/** One line of an agent's notebook. */
export interface MemoryNote {
  text: string;
  /** The local day it was written (YYYY-MM-DD); absent when typed into the file by hand. */
  at?: string;
}

export interface AgentsResponse {
  agents: Agent[];
  problems: { source: string; error: string }[];
  up: boolean;
  root: string;
  /** A public demo with made-up data: look around, answer the sample asks, nothing else. */
  demo?: boolean;
}

export interface Envelope {
  seq: number;
  ts: string;
  runId: string;
  agent: string;
  event: Record<string, unknown> & { type: string };
}

export interface ApprovalRequest {
  id: string;
  agent: string;
  runId: string;
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  createdAt: string;
  expiresAt: string;
  decision?: { approved: boolean; by: string; at: string; note?: string };
}

export interface FeedItem {
  ts: string;
  kind: string;
  agent: string;
  runId: string;
  text: string;
  detail?: unknown;
}

export interface CostRow {
  day: string;
  agent: string;
  costUsd: number;
  runs: number;
}

export interface ChatMessage {
  id: string;
  ts: string;
  role: "user" | "agent";
  text: string;
  runId?: string;
  kind: "chat" | "run" | "error";
  /** The run stopped because the model's daily quota is used up. */
  quota?: { model: string; retryAt: string; limit?: number };
}

export interface Grant {
  id: string;
  agent: string;
  tool: string;
  scope?: { key: string; value: unknown };
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  revokedAt?: string;
  uses: number;
  label: string;
}

export interface Suggestion {
  id: string;
  agent: string;
  tool: string;
  approvals: number;
  lastApprovedAt: string;
  rule: { tool: string; action: "allow" | "ask" | "block"; when?: Record<string, unknown>; reason?: string };
  summary: string;
}

export interface InboxResponse {
  pending: ApprovalRequest[];
  recent: ApprovalRequest[];
  grants: Grant[];
  suggestions: Suggestion[];
}

/** The sign-in token plus the addresses a phone could use to reach this control room. */
export interface Pair {
  token: string;
  direct: boolean;
  addresses: { url: string; via: "tailscale" | "seen" }[];
}

/** What a pending file write would change. */
export interface WriteDiff {
  path?: string;
  isNew?: boolean;
  lines?: { t: "=" | "+" | "-"; s: string }[];
  added?: number;
  removed?: number;
  unchanged?: number;
  outside?: boolean;
  tooBig?: boolean;
  /** The file holds secrets (.env, .garu): the card shows no contents. */
  secret?: boolean;
  error?: string;
}

export interface Settings {
  version: string;
  root: string;
  up: boolean;
  user: string;
  host: string;
  port: number;
  providers: { gemini: boolean; anthropic: boolean; ollamaHost: boolean };
  env: { name: string; set: boolean }[];
  remotes: { agent: string; source: string; server: string; url: string; local?: boolean; auth: "none" | "oauth"; signedIn: boolean | null }[];
  notify: boolean;
  askTimeoutMin: number;
  askHoldMin: number;
  /** Run logs older than this many days are deleted once a day; null keeps everything. */
  pruneDays: number | null;
  /** The week in numbers goes to a channel on Sunday evening. */
  weekly: boolean;
  /** required: even this computer signs in. direct: this request came from a browser on the same computer. */
  login: { required: boolean; direct: boolean; tokenPath: string };
}

/** /api/today: each agent's newest good result from the last seven days, and the week in numbers. */
export interface TodayResponse {
  results: { agent: string; runId: string; endedAt: string; summary: string | null; costUsd: number; priced: boolean; doc: { path: string; content: string } | null }[];
  week: { runs: number; actions: number; asked: number; costUsd: number; priced: boolean; days: { day: string; runs: number; actions: number; asked: number; costUsd: number }[] };
}
