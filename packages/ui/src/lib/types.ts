export type RunStatus = "running" | "interrupted" | "ok" | "error" | "blocked" | "max_turns" | "budget_exceeded";

export interface RunSummary {
  agent: string;
  runId: string;
  startedAt: string;
  endedAt: string | null;
  status: RunStatus;
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
  model: string | null;
  source: string | null;
  configured: boolean;
  /** ${VAR}s its tool servers need that are not set in .env. */
  needs: string[];
  status: AgentStatus;
  inFlight: { runId: string; startedAt: string; turn: number; trigger: string } | null;
  pending: number;
  cron: string | null;
  nextRun: string | null;
  tools: string[];
  policy: { rules: number; allow: number; ask: number; block: number } | null;
  sandbox: { image: string; network: string } | null;
  budget: { maxCostUsd: number | null; free: boolean } | null;
  maxTurns: number | null;
  runs: number;
  runsToday: number;
  costTodayUsd: number;
  lastRun: RunSummary | null;
}

export interface AgentsResponse {
  agents: Agent[];
  problems: { source: string; error: string }[];
  up: boolean;
  root: string;
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
