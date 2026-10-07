import type { Agent, AgentsResponse, ApprovalRequest, ChatMessage, CostRow, Envelope, FeedItem, InboxResponse, RunSummary } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const api = {
  agents: () => get<AgentsResponse>("/api/agents"),
  runs: (agent?: string) => get<RunSummary[]>(agent ? `/api/runs?agent=${encodeURIComponent(agent)}` : "/api/runs"),
  run: (agent: string, runId: string) => get<Envelope[]>(`/api/runs/${encodeURIComponent(agent)}/${encodeURIComponent(runId)}`),
  inbox: () => get<InboxResponse>("/api/inbox"),
  feed: (limit = 80) => get<FeedItem[]>(`/api/feed?limit=${limit}`),
  cost: (days = 14) => get<CostRow[]>(`/api/cost?days=${days}`),
  decide: (id: string, approve: boolean, forDuration?: string, note?: string) => post<ApprovalRequest>(`/api/inbox/${id}/${approve ? "approve" : "deny"}`, { ...(forDuration ? { for: forDuration } : {}), ...(note ? { note } : {}) }),
  batch: (ids: string[], approve: boolean) => post<{ results: { id: string; ok: boolean }[] }>(`/api/inbox/batch`, { ids, approve }),
  revokeGrant: (id: string) => post<unknown>(`/api/grants/${id}/revoke`),
  applySuggestion: (id: string) => post<{ applied: boolean; file: string }>(`/api/suggestions/${encodeURIComponent(id)}/apply`),
  dismissSuggestion: (id: string) => post<unknown>(`/api/suggestions/${encodeURIComponent(id)}/dismiss`),
  startRun: (agent: string, note?: string) => post<{ started: boolean; runId: string | null }>(`/api/agents/${encodeURIComponent(agent)}/run`, { note }),
  chat: (agent: string) => get<ChatMessage[]>(`/api/agents/${encodeURIComponent(agent)}/chat`),
  send: (agent: string, text: string) => post<{ started: boolean; runId: string | null }>(`/api/agents/${encodeURIComponent(agent)}/chat`, { text }),
};

/** Shared, live-refreshed state. Every view reads from here; the SSE "changed" event refreshes it. */
export const live = $state({
  tick: 0,
  connected: false,
  agents: [] as Agent[],
  up: false,
  root: "",
  problems: [] as { source: string; error: string }[],
  pending: [] as ApprovalRequest[],
  suggestions: [] as import("./types").Suggestion[],
  grants: [] as import("./types").Grant[],
  loaded: false,
});

export async function refreshCore(): Promise<void> {
  const [a, i] = await Promise.all([api.agents(), api.inbox()]);
  live.agents = a.agents;
  live.up = a.up;
  live.root = a.root;
  live.problems = a.problems;
  live.pending = i.pending;
  live.suggestions = i.suggestions ?? [];
  live.grants = i.grants ?? [];
  live.loaded = true;
}

let source: EventSource | undefined;
export function connectLive(): void {
  if (source) return;
  void refreshCore().catch(() => {});
  source = new EventSource("/api/events");
  source.addEventListener("hello", () => { live.connected = true; void refreshCore().catch(() => {}); });
  source.addEventListener("changed", () => { live.tick++; void refreshCore().catch(() => {}); });
  source.onerror = () => { live.connected = false; };
  // in-flight turn counters change without a file event sometimes; a slow heartbeat keeps "working" fresh
  setInterval(() => { if (live.agents.some((a) => a.status === "working")) void refreshCore().catch(() => {}); }, 2000);
}

export const agentByName = (name: string) => live.agents.find((a) => a.name === name);
