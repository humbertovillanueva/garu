import type { Agent, AgentsResponse, ApprovalRequest, ChatMessage, CostRow, Envelope, FeedItem, InboxResponse, RunSummary, TodayResponse } from "./types";
import { isApp, server } from "./server.svelte";
import { t } from "./i18n.svelte";

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
/** What a reader sees when the computer can't be reached: where to look, not what the network said. Functions, so they speak the current language. */
export const unreachableHint = (): string => (isApp ? t("Check that it's awake and that Tailscale is on, on both ends.") : t("Check that Garu is still running on this computer."));
export const unreachable = (): string => `${isApp ? t("Can't reach your computer.") : t("Can't reach the control room.")} ${unreachableHint()}`;
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
    throw new Error(unreachable());
  }
}
async function get<T>(path: string): Promise<T> {
  const res = await request(path, { cache: "no-store", headers: auth() });
  if (res.status === 401) { unauthorized(); throw new HttpError("sign in", 401); }
  if (!res.ok) throw new HttpError(res.status === 404 ? t("Not found.") : t("Garu couldn't answer that (error {status}).", { status: res.status }), res.status);
  return (await res.json()) as T;
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await request(path, { method: "POST", headers: { "content-type": "application/json", ...auth() }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { unauthorized(); throw new HttpError("sign in", 401); }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new HttpError(json.error ?? t("Garu couldn't do that (error {status}).", { status: res.status }), res.status);
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
  /** Newest first. `limit` caps the page (the server's own cap is 200 across agents); `offset` skips the newest, for older pages. */
  runs: (agent?: string, page: { limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (agent) q.set("agent", agent);
    if (page.limit) q.set("limit", String(page.limit));
    if (page.offset) q.set("offset", String(page.offset));
    const s = q.toString();
    return get<RunSummary[]>(s ? `/api/runs?${s}` : "/api/runs");
  },
  run: (agent: string, runId: string) => get<Envelope[]>(`/api/runs/${encodeURIComponent(agent)}/${encodeURIComponent(runId)}`),
  inbox: () => get<InboxResponse>("/api/inbox"),
  feed: (limit = 80) => get<FeedItem[]>(`/api/feed?limit=${limit}`),
  cost: (days = 14) => get<CostRow[]>(`/api/cost?days=${days}`),
  today: () => get<TodayResponse>("/api/today"),
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
  login: async (token: string) => { await post<{ ok: true }>("/api/login", { token }); live.signIn = false; void connectLive(true).catch(() => {}); },
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
  demo: false,
  problems: [] as { source: string; error: string }[],
  pending: [] as ApprovalRequest[],
  suggestions: [] as import("./types").Suggestion[],
  grants: [] as import("./types").Grant[],
  /** The asks already decided, newest first, as the inbox answers them: the Inbox page reads these instead of asking again. */
  recent: [] as ApprovalRequest[],
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

/** Refresh everything now: what pull-to-refresh and coming back to the app do. One round of requests, whoever asks. */
export async function refreshNow(): Promise<void> {
  live.refreshing = true;
  try {
    // Reconnecting refreshes on its own; connected, one refresh is all it takes.
    await (live.connected ? refreshCore() : connectLive(true));
    live.tick++;
  } catch { /* the banner says it */ } finally {
    live.refreshing = false;
  }
}

/**
 * The two requests behind every view. Callers that overlap share one round: while a refresh is on
 * its way, an ask means something changed since it left, so its answer is dropped and one more
 * goes out after it, shared by everyone who asked meanwhile. A pull-to-refresh is one round, and a
 * card you just decided can't come back from an answer that left before you decided.
 */
let gen = 0;
let running: Promise<void> | null = null;
let queued: Promise<void> | null = null;
export function refreshCore(): Promise<void> {
  if (!running) {
    const mine = ++gen;
    running = fetchCore(() => mine === gen).finally(() => { running = null; });
    return running;
  }
  gen++;
  return (queued ??= running.catch(() => {}).then(() => { queued = null; return refreshCore(); }));
}
async function fetchCore(current: () => boolean): Promise<void> {
  let a: AgentsResponse, i: InboxResponse;
  try {
    [a, i] = await Promise.all([api.agents(), api.inbox()]);
  } catch (e) {
    if (!live.loaded) live.loadError = errorText(e);
    throw e;
  }
  if (!current()) return;
  live.agents = a.agents;
  live.up = a.up;
  live.root = a.root;
  live.demo = Boolean(a.demo);
  live.problems = a.problems;
  live.pending = i.pending;
  live.suggestions = i.suggestions ?? [];
  live.grants = i.grants ?? [];
  live.recent = i.recent ?? [];
  live.loaded = true;
  live.loadError = null;
}

let source: EventSource | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let listening = false;
// When the stream closes for good (a proxy answering 502 during a restart does that), try again on a widening interval.
let retry: ReturnType<typeof setTimeout> | undefined;
let backoff = 2000;
/** Open (or reopen) the live stream. Owns the refresh that goes with it; the promise is that refresh, for a caller that wants to wait. */
export function connectLive(again = false): Promise<void> {
  if (source && !again) return Promise.resolve();
  clearTimeout(retry);
  source?.close();
  // The refresh that comes with connecting: it is also what tells a browser with no session to sign in.
  const refreshed = refreshCore();
  // EventSource can't carry a header, so the app passes its token in the query; a browser session uses its cookie.
  source = new EventSource(url("/api/events") + (server.token ? `?token=${encodeURIComponent(server.token)}` : ""));
  source.addEventListener("hello", () => {
    const wasDown = live.disconnectedAt > 0;
    live.connected = true; live.disconnectedAt = 0; backoff = 2000;
    // Back after a drop (the browser reconnects a dropped stream by itself): what changed meanwhile was
    // missed, so everything reloads. A first hello comes right after the refresh above and needs nothing.
    if (wasDown) { void refreshCore().catch(() => {}); live.tick++; }
  });
  source.addEventListener("changed", () => { live.tick++; void refreshCore().catch(() => {}); });
  const mine = source;
  source.onerror = () => {
    if (live.connected || !live.disconnectedAt) live.disconnectedAt = Date.now();
    live.connected = false;
    // The browser retries a dropped stream by itself, but not one that was refused; that one is ours to retry.
    if (mine.readyState === EventSource.CLOSED && !live.signIn) {
      clearTimeout(retry);
      retry = setTimeout(() => { void connectLive(true).catch(() => {}); }, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  };
  if (!listening) {
    listening = true;
    // Coming back from the background, or the network returning, is the moment to try again rather than waiting for the browser's backoff.
    addEventListener("online", () => { void connectLive(true).catch(() => {}); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !live.connected) void connectLive(true).catch(() => {}); });
  }
  // in-flight turn counters change without a file event sometimes; a slow heartbeat keeps "working" fresh
  heartbeat ??= setInterval(() => { if (!live.signIn && live.agents.some((a) => a.status === "working")) void refreshCore().catch(() => {}); }, 2000);
  return refreshed;
}

export const agentByName = (name: string) => live.agents.find((a) => a.name === name);
