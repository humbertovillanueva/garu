// Mirrors the kernel's public types for the pieces the UI reads. Kept small on purpose.
export type RunStatus = "running" | "ok" | "error" | "blocked" | "max_turns" | "budget_exceeded";

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

export interface AgentSummary {
  name: string;
  runs: number;
  lastRun: RunSummary | null;
  costTodayUsd: number;
  runsToday: number;
  model: string | null;
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
  decision?: { approved: boolean; by: string; at: string };
}

export interface CostRow {
  day: string;
  agent: string;
  costUsd: number;
  runs: number;
}
