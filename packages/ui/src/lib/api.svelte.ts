import type { AgentSummary, ApprovalRequest, CostRow, Envelope, RunSummary } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  agents: () => get<AgentSummary[]>("/api/agents"),
  runs: (agent?: string) => get<RunSummary[]>(agent ? `/api/runs?agent=${encodeURIComponent(agent)}` : "/api/runs"),
  run: (agent: string, runId: string) => get<Envelope[]>(`/api/runs/${encodeURIComponent(agent)}/${encodeURIComponent(runId)}`),
  inbox: () => get<{ pending: ApprovalRequest[]; recent: ApprovalRequest[] }>("/api/inbox"),
  cost: (days = 14) => get<CostRow[]>(`/api/cost?days=${days}`),
  decide: async (id: string, approve: boolean) => {
    const res = await fetch(`/api/inbox/${id}/${approve ? "approve" : "deny"}`, { method: "POST" });
    const body = (await res.json()) as ApprovalRequest | { error: string };
    if (!res.ok) throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
    return body as ApprovalRequest;
  },
};

/** A counter that ticks whenever the server says something on disk changed. Views re-fetch on it. */
export const live = $state({ tick: 0, connected: false });

let source: EventSource | undefined;
export function connectLive(): void {
  if (source) return;
  source = new EventSource("/api/events");
  source.addEventListener("hello", () => (live.connected = true));
  source.addEventListener("changed", () => live.tick++);
  source.onerror = () => {
    live.connected = false; // EventSource reconnects by itself
  };
}
