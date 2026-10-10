import type { Agent, AgentsResponse, ApprovalRequest, ChatMessage, CostRow, Envelope, FeedItem, InboxResponse, RunSummary } from "./types";
import { isApp, server } from "./server.svelte";

/** Every call goes to the control room this page is paired with (the serving host in a browser). */
const url = (path: string) => server.base + path;
const auth = (): Record<string, string> => (server.token ? { authorization: `Bearer ${server.token}` } : {});

/** A 401 means this browser has no session with the control room: show the sign-in screen and stop the live stream. */
function unauthorized(): void {
  if (live.signIn) return;
  live.signIn = true;
  live.connected = false;
  source?.close();
  source = undefined;
}
/** What a reader sees when the computer can't be reached: where to look, not what the network said. */
export const UNREACHABLE_HINT = isApp
  ? "Check that it's awake and that Tailscale is on, on both ends."
  : "Check that Garu is still running on this computer.";
export const UNREACHABLE = `Can't reach ${isApp ? "your computer" : "the control room"}. ${UNREACHABLE_HINT}`;
/** A request that reached Garu and got an error back. `status` lets a view tell "not found" from "broken". */
export class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
/** A stalled address (an unreachable Tailscale name, say) gives up after this long instead of spinning for minutes. */
const TIMEOUT_MS = 10_000;
async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url(path), { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    // fetch only throws for the network (offline, refused, timed out); HTTP errors come back as responses
    throw new Error(UNREACHABLE);
  }
}
async function get<T>(path: string): Promise<T> {
  const res = await request(path, { cache: "no-store", headers: auth() });
  if (res.status === 401) { unauthorized(); throw new HttpError("sign in", 401); }
  if (!res.ok) throw new HttpError(res.status === 404 ? "Not found." : `Garu couldn't answer that (error ${res.status}).`, res.status);
  return (await res.json()) as T;
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await request(path, { method: "POST", headers: { "content-type": "application/json", ...auth() }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { unauthorized(); throw new HttpError("sign in", 401); }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new HttpError(json.error ?? `Garu couldn't do that (error ${res.status}).`, res.status);
  return json;
}

/** An error as a sentence a reader can act on. */
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Loads for one view. Only the newest request may land: tapping 30d then 7d never leaves 30 days of
 * data behind a 7-day chart. Failures arrive as a readable sentence instead of an unhandled rejection.
 */
export function loader() {
  let seq = 0;
  return <T>(p: Promise<T>, ok: (v: T) => void, fail?: (message: string, e: unknown) => void): void => {
    const n = ++seq;
    p.then(
      (v) => { if (n === seq) ok(v); },
      (e) => { if (n === seq) fail?.(errorText(e), e); },
    );
  };
}

export const api = {
  agents: () => get<AgentsResponse>("/api/agents"),
  runs: (agent?: string) => get<RunSummary[]>(agent ? `/api/runs?agent=${encodeURIComponent(agent)}` : "/api/runs"),
  run: (agent: string, runId: string) => get<Envelope[]>(`/api/runs/${encodeURIComponent(agent)}/${encodeURIComponent(runId)}`),
  inbox: () => get<InboxResponse>("/api/inbox"),
  feed: (limit = 80) => get<FeedItem[]>(`/api/feed?limit=${limit}`),
  cost: (days = 14) => get<CostRow[]>(`/api/cost?days=${days}`),
  decide: (id: string, approve: boolean, forDuration?: string, note?: string) => post<ApprovalRequest>(`/api/inbox/${id}/${approve ? "approve" : "deny"}`, { ...(forDuration ? { for: forDuration } : {}), ...(note ? { note } : {}) }),
  diff: (id: string) => get<import("./types").WriteDiff>(`/api/inbox/${id}/diff`),
  batch: (ids: string[], approve: boolean) => post<{ results: { id: string; ok: boolean }[] }>(`/api/inbox/batch`, { ids, approve }),
  revokeGrant: (id: string) => post<unknown>(`/api/grants/${id}/revoke`),
  applySuggestion: (id: string) => post<{ applied: boolean; file: string }>(`/api/suggestions/${encodeURIComponent(id)}/apply`),
  dismissSuggestion: (id: string) => post<unknown>(`/api/suggestions/${encodeURIComponent(id)}/dismiss`),
  startRun: (agent: string, note?: string) => post<{ started: boolean; runId: string | null }>(`/api/agents/${encodeURIComponent(agent)}/run`, { note }),
  chat: (agent: string) => get<ChatMessage[]>(`/api/agents/${encodeURIComponent(agent)}/chat`),
  settings: () => get<import("./types").Settings>("/api/settings"),
  logs: (n = 200) => get<{ lines: string[]; path: string }>(`/api/logs?n=${n}`),
  pair: () => get<import("./types").Pair>("/api/pair"),
  rotateToken: () => post<import("./types").Pair>("/api/pair"),
  login: async (token: string) => { await post<{ ok: true }>("/api/login", { token }); live.signIn = false; connectLive(true); },
  logout: async () => { if (!server.token) await post<{ ok: true }>("/api/logout"); location.reload(); },
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
  /** Why the first load failed, until one succeeds. Views show this instead of an endless skeleton. */
  loadError: null as string | null,
  /** This browser needs the token before it can see anything. */
  signIn: false,
  /** When the live stream last dropped, or 0 while connected. The banner waits a moment before showing. */
  disconnectedAt: 0,
  /** A pull-to-refresh or manual refresh in flight. */
  refreshing: false,
});

/** Refresh everything now: what pull-to-refresh and coming back to the app do. */
export async function refreshNow(): Promise<void> {
  live.refreshing = true;
  try {
    if (!live.connected) connectLive(true);
    await refreshCore();
    live.tick++;
  } catch { /* the banner says it */ } finally {
    live.refreshing = false;
  }
}

let refreshSeq = 0;
export async function refreshCore(): Promise<void> {
  // The newest refresh wins: an older answer that lands late can't bring back a card you just decided.
  const mine = ++refreshSeq;
  let a: AgentsResponse, i: InboxResponse;
  try {
    [a, i] = await Promise.all([api.agents(), api.inbox()]);
  } catch (e) {
    if (!live.loaded) live.loadError = errorText(e);
    throw e;
  }
  if (mine !== refreshSeq) return;
  live.agents = a.agents;
  live.up = a.up;
  live.root = a.root;
  live.problems = a.problems;
  live.pending = i.pending;
  live.suggestions = i.suggestions ?? [];
  live.grants = i.grants ?? [];
  live.loaded = true;
  live.loadError = null;
}

let source: EventSource | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let listening = false;
// When the stream closes for good (a proxy answering 502 during a restart does that), try again on a widening interval.
let retry: ReturnType<typeof setTimeout> | undefined;
let backoff = 2000;
export function connectLive(again = false): void {
  if (source && !again) return;
  clearTimeout(retry);
  source?.close();
  void refreshCore().catch(() => {});
  // EventSource can't carry a header, so the app passes its token in the query; a browser session uses its cookie.
  source = new EventSource(url("/api/events") + (server.token ? `?token=${encodeURIComponent(server.token)}` : ""));
  source.addEventListener("hello", () => {
    const wasDown = live.disconnectedAt > 0;
    live.connected = true; live.disconnectedAt = 0; backoff = 2000;
    void refreshCore().catch(() => {});
    // Back after a drop: the open page may have missed changes, so it reloads too.
    if (wasDown) live.tick++;
  });
  source.addEventListener("changed", () => { live.tick++; void refreshCore().catch(() => {}); });
  const mine = source;
  source.onerror = () => {
    if (live.connected || !live.disconnectedAt) live.disconnectedAt = Date.now();
    live.connected = false;
    // The browser retries a dropped stream by itself, but not one that was refused; that one is ours to retry.
    if (mine.readyState === EventSource.CLOSED && !live.signIn) {
      clearTimeout(retry);
      retry = setTimeout(() => connectLive(true), backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  };
  if (!listening) {
    listening = true;
    // Coming back from the background, or the network returning, is the moment to try again rather than waiting for the browser's backoff.
    addEventListener("online", () => connectLive(true));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !live.connected) connectLive(true); });
  }
  // in-flight turn counters change without a file event sometimes; a slow heartbeat keeps "working" fresh
  heartbeat ??= setInterval(() => { if (!live.signIn && live.agents.some((a) => a.status === "working")) void refreshCore().catch(() => {}); }, 2000);
}

export const agentByName = (name: string) => live.agents.find((a) => a.name === name);
