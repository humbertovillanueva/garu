import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Inbox, Recorder, readRun, suggestRules, writeParked, readParked } from "@garu/kernel";
import { startUiServer, askRefusal, MAX_ASK_HOPS } from "./ui-server.js";

/**
 * The control room, booted for real on a free port over a temporary folder with one agent,
 * and asked the questions a browser, a phone, or something less friendly would ask.
 */

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const { port } = s.address() as { port: number }; s.close(() => resolve(port)); });
  });
}

const GARUFILE = `
name: pip
model: fake/any
prompt: p
triggers:
  - manual: true
  - webhook: nudge
tools:
  - name: fs
    command: node
    args: ["-e", "0"]
policy:
  - tool: "fs.write_file"
    action: ask
    reason: writing
  - tool: "*"
    action: block
`;

let root = "", inboxRoot = "", base = "", token = "";
let srv: ReturnType<typeof startUiServer>;
const logLines: string[] = [];
/** Looks like a proxy is in front: the server must then insist on the token. */
const viaProxy = { "x-forwarded-for": "100.64.0.9" };
const bearer = () => ({ authorization: `Bearer ${token}` });
const get = (path: string, init: RequestInit = {}) => fetch(base + path, init);
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
let n = 0;
/** A paused tool call, as the kernel's inbox writes it. */
function pending(tool: string, args: Record<string, unknown>, agent = "pip"): string {
  const id = `t${String(++n).padStart(5, "0")}`;
  const now = new Date();
  writeFileSync(join(inboxRoot, `${id}.json`), JSON.stringify({ id, agent, runId: "r1", callId: id, tool, args, reason: "writing", createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60_000).toISOString() }));
  return id;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "garu-ui-"));
  mkdirSync(join(root, "agents", "pip"), { recursive: true });
  writeFileSync(join(root, "agents", "pip", "Garufile.yaml"), GARUFILE);
  // A sandboxed agent: its tool server sees ./ws as /workspace.
  mkdirSync(join(root, "agents", "vault"), { recursive: true });
  writeFileSync(join(root, "agents", "vault", "Garufile.yaml"), GARUFILE.replace("name: pip", "name: vault\nsandbox:\n  workspace: ./ws"));
  mkdirSync(join(root, "ws"));
  writeFileSync(join(root, "ws", "SUMMARY.md"), "old summary\n");
  // An agent whose run takes a moment to fail: a known provider, and a tool server that sits silent for
  // half a second before exiting (the bus gives it one more try after three seconds, then the run fails).
  mkdirSync(join(root, "agents", "slow"), { recursive: true });
  writeFileSync(join(root, "agents", "slow", "Garufile.yaml"), GARUFILE.replace("name: pip", "name: slow").replace("model: fake/any", "model: ollama/test").replace('args: ["-e", "0"]', 'args: ["-e", "setTimeout(() => {}, 500)"]'));
  // An agent allowed one run a day.
  mkdirSync(join(root, "agents", "once"), { recursive: true });
  writeFileSync(join(root, "agents", "once", "Garufile.yaml"), GARUFILE.replace("name: pip", "name: once\nbudget:\n  maxRunsPerDay: 1"));
  mkdirSync(join(root, "ui"));
  writeFileSync(join(root, "ui", "index.html"), "<!doctype html><title>Garu test</title>");
  writeFileSync(join(root, "notes.md"), "old\n");
  writeFileSync(join(root, ".env"), "SECRET=hunter2\n");
  inboxRoot = join(root, ".garu", "inbox");
  for (const d of ["runs", "inbox", "chat"]) mkdirSync(join(root, ".garu", d), { recursive: true });
  const port = await freePort();
  srv = startUiServer({
    port, host: "127.0.0.1", root, logRoot: join(root, ".garu", "runs"), inboxRoot, chatRoot: join(root, ".garu", "chat"), memoryRoot: join(root, ".garu", "memory"),
    grantsPath: join(root, ".garu", "grants.jsonl"), dismissedPath: join(root, ".garu", "dismissed.json"), staticDir: join(root, "ui"),
    userName: "Test", decider: "Test (ui)", up: false, askTimeoutMs: 60_000, tokenPath: join(root, ".garu", "ui-token"), log: (l) => logLines.push(l),
  });
  base = `http://127.0.0.1:${port}`;
  token = srv.token;
  for (let i = 0; i < 40; i++) {
    try { if ((await get("/api/settings")).ok) break; } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
});
afterAll(async () => { await srv.close(); });

describe("who gets in", () => {
  it("a browser on this computer is let in; a page from another local origin, or anything behind a proxy, is not", async () => {
    const mine = await get("/api/agents");
    expect(mine.status).toBe(200);
    expect(((await mine.json()) as { agents: { name: string }[] }).agents.map((a) => a.name)).toEqual(["once", "pip", "slow", "vault"]);
    const other = await get("/api/pair", { headers: { origin: "http://localhost:5173" } });
    expect(other.status).toBe(401);
    expect(await other.json()).toMatchObject({ signIn: true });
    expect((await get("/api/agents", { headers: viaProxy })).status).toBe(401);
    expect((await get("/api/agents", { headers: { ...viaProxy, ...bearer() } })).status).toBe(200);
  });

  it("login refuses a wrong token and sets the cookie for the right one; the sign-in link does the same", async () => {
    expect((await post("/api/login", { token: "nope" }, viaProxy)).status).toBe(403);
    const ok = await post("/api/login", { token }, viaProxy);
    expect(ok.status).toBe(200);
    const cookie = /garu_session=[^;]+/.exec(ok.headers.get("set-cookie") ?? "")?.[0];
    expect(cookie).toBeTruthy();
    expect((await get("/api/agents", { headers: { ...viaProxy, cookie: cookie! } })).status).toBe(200);
    const link = await get(`/?token=${token}`, { redirect: "manual", headers: viaProxy });
    expect(link.status).toBe(302);
    expect(link.headers.get("set-cookie")).toContain("garu_session=");
    expect(link.headers.get("location")).toBe("/");
  });

  it("the token in a URL works for the live stream and the sign-in link, nowhere else", async () => {
    expect((await get(`/api/agents?token=${token}`, { headers: viaProxy })).status).toBe(401);
    const ctrl = new AbortController();
    const stream = await get(`/api/events?token=${token}`, { headers: viaProxy, signal: ctrl.signal });
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    ctrl.abort();
  });

  it("a body over a megabyte is refused, and a path-shaped agent name too", async () => {
    const big = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: `{"token":"${"a".repeat(1_100_000)}"}` });
    expect(big.status).toBe(413);
    expect((await get("/api/runs?agent=../../x")).status).toBe(400);
    expect(Array.isArray(await (await get("/api/runs")).json())).toBe(true);
  }, 15_000);

  it("runs come a page at a time: a limit caps the page and an offset skips the newest; nonsense means the defaults", async () => {
    for (const q of ["?limit=1", "?limit=1&offset=1", "?limit=abc&offset=-3", "?agent=pip&limit=2"]) {
      const r = await get(`/api/runs${q}`);
      expect(r.status, q).toBe(200);
      const body = (await r.json()) as unknown[];
      expect(Array.isArray(body), q).toBe(true);
      if (/limit=\d/.test(q)) expect(body.length, q).toBeLessThanOrEqual(2);
    }
  });

  it("a traversal path serves the app, never a file outside it", async () => {
    const res = await get("/%2e%2e/%2e%2e/etc/passwd");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Garu test");
  });
});

describe("approvals", () => {
  it("approve for 24h makes a grant and answers what it already covers; a bad duration changes nothing", async () => {
    const a = pending("fs.write_file", { path: "notes.md", content: "new\n" });
    const same = pending("fs.write_file", { path: "notes.md", content: "newer\n" });
    const other = pending("fs.write_file", { path: "other.md", content: "x" });
    expect((await post(`/api/inbox/${a}/approve`, { for: "bogus" })).status).toBe(409);
    expect(((await (await get("/api/inbox")).json()) as { pending: { id: string }[] }).pending.map((p) => p.id)).toContain(a);
    const ok = await post(`/api/inbox/${a}/approve`, { for: "24h" });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { decision: { approved: boolean; by: string }; grant: { tool: string; scope?: { key: string; value: unknown } } };
    expect(body.decision).toMatchObject({ approved: true, by: "Test (ui)" });
    expect(body.grant).toMatchObject({ tool: "fs.write_file", scope: { key: "path", value: "notes.md" } });
    const inbox = new Inbox({ root: inboxRoot });
    expect(inbox.get(same)?.decision).toMatchObject({ approved: true });
    expect(inbox.get(same)?.decision?.by).toMatch(/^grant /);
    expect(inbox.get(other)?.decision).toBeUndefined();
    expect((await post(`/api/inbox/${a}/approve`, {})).status).toBe(409); // already decided
  });

  it("the diff preview shows a change, but never a secret file or one outside the project", async () => {
    const notes = pending("fs.write_file", { path: "notes.md", content: "new\n" });
    const d = (await (await get(`/api/inbox/${notes}/diff`)).json()) as { isNew: boolean; lines: { t: string; s: string }[] };
    expect(d.isNew).toBe(false);
    expect(d.lines).toEqual(expect.arrayContaining([{ t: "-", s: "old" }, { t: "+", s: "new" }]));
    const env = pending("fs.write_file", { path: ".env", content: "SECRET=changed" });
    expect(await (await get(`/api/inbox/${env}/diff`)).json()).toEqual({ secret: true });
    const outside = pending("fs.write_file", { path: "../outside.txt", content: "x" });
    expect(await (await get(`/api/inbox/${outside}/diff`)).json()).toEqual({ outside: true });
    expect((await get("/api/inbox/nope99/diff")).status).toBe(404);
  });

  it("a sandboxed agent's /workspace path is shown from the folder mounted there", async () => {
    const summary = pending("fs.write_file", { path: "/workspace/SUMMARY.md", content: "new summary\n" }, "vault");
    const d = (await (await get(`/api/inbox/${summary}/diff`)).json()) as { path: string; isNew: boolean; lines: { t: string; s: string }[] };
    expect(d.path.endsWith(join("ws", "SUMMARY.md"))).toBe(true);
    expect(d.isNew).toBe(false);
    expect(d.lines.some((l) => l.t === "-" && l.s === "old summary")).toBe(true);
    // The mapping never reaches past the project folder or into a secret.
    const sneaky = pending("fs.write_file", { path: "/workspace/../.env", content: "x" }, "vault");
    expect(await (await get(`/api/inbox/${sneaky}/diff`)).json()).toEqual({ secret: true });
  });

  it("a batch decides many at once, and a malformed one decides nothing", async () => {
    const x = pending("fs.write_file", { path: "docs/x.md", content: "x" });
    const r = (await (await post("/api/inbox/batch", { ids: [x, "nope99"], approve: true })).json()) as { results: { id: string; ok: boolean }[] };
    expect(r.results).toEqual([{ id: x, ok: true }, { id: "nope99", ok: false, error: expect.stringMatching(/no approval request/) }]);
    const bad = await post("/api/inbox/batch", { ids: "x,y", approve: true });
    expect(bad.status).toBe(200);
    expect(await bad.json()).toEqual({ results: [] });
  });

  it("approvals become a suggestion, and applying it writes the rule into the Garufile", async () => {
    const inbox = new Inbox({ root: inboxRoot });
    const before = suggestRules(inbox.all(), { dismissed: new Set() }).length;
    for (const path of ["docs/a.md", "docs/b.md", "docs/c.md"]) expect((await post(`/api/inbox/${pending("fs.write_file", { path, content: "x" })}/approve`, {})).status).toBe(200);
    const sug = suggestRules(inbox.all(), { dismissed: new Set() }).find((s) => s.agent === "pip" && s.rule.tool === "fs.write_file");
    expect(sug).toBeTruthy();
    expect(suggestRules(inbox.all(), { dismissed: new Set() }).length).toBeGreaterThanOrEqual(before);
    const res = await post(`/api/suggestions/${encodeURIComponent(sug!.id)}/apply`, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: true, inserted: 0 });
    const file = readFileSync(join(root, "agents", "pip", "Garufile.yaml"), "utf8");
    expect(file).toContain("learned: approved");
    expect(file.indexOf("action: allow")).toBeLessThan(file.indexOf("action: ask"));
    expect((await post(`/api/suggestions/${encodeURIComponent(sug!.id)}/apply`, {})).status).toBe(404); // applied once
  });
});

describe("one agent asking another", () => {
  it("the rules: not itself, only through a door, not past two hops, not while busy", () => {
    const agents = [{ name: "tomay", door: false }, { name: "bea", door: true }, { name: "rook", door: true }];
    const q = (o: Partial<Parameters<typeof askRefusal>[0]>) => askRefusal({ asker: "tomay", target: "bea", hop: 0, agents, busy: false, ...o });
    expect(q({})).toBeNull();
    expect(q({ target: "tomay" })).toMatch(/can't ask itself/);
    expect(q({ target: "nook" })).toMatch(/no agent named "nook"; the agents that can be asked are: bea, rook/);
    expect(q({ asker: "bea", target: "tomay" })).toMatch(/tomay has no door/);
    expect(q({ hop: MAX_ASK_HOPS })).toMatch(/too many agents in a row/);
    expect(q({ hop: MAX_ASK_HOPS - 1 })).toBeNull();
    expect(q({ busy: true })).toMatch(/bea is busy/);
  });
});

describe("the daily cap", () => {
  it("once today's runs reach the cap, nothing starts it until tomorrow: not Run now, not its door, not a message", async () => {
    const agent = async () => ((await (await get("/api/agents")).json()) as { agents: { name: string; capped: boolean; budget: { maxRunsPerDay: number | null } }[] }).agents.find((a) => a.name === "once")!;
    expect(await agent()).toMatchObject({ capped: false, budget: { maxRunsPerDay: 1 } });
    // One run today, as the recorder leaves it.
    const r = new Recorder({ root: join(root, ".garu", "runs"), agent: "once" });
    r.record({ type: "run.start", agent: "once", model: "fake/any", trigger: "ui" });
    r.record({ type: "run.end", status: "ok" });
    expect((await agent()).capped).toBe(true);
    const again = await post("/api/agents/once/run", {});
    expect(again.status).toBe(429);
    expect(((await again.json()) as { error: string }).error).toContain("once has already run 1 times today");
    expect((await post("/api/agents/once/hooks/nudge", { message: "hi" })).status).toBe(429);
    expect((await post("/api/agents/once/chat", { text: "hi" })).status).toBe(429);
  }, 15_000);
});

describe("the notebook", () => {
  it("the owner reads, adds and drops notes from the agent's page; a bad name or an empty note is refused", async () => {
    expect((await get("/api/agents/..%2Fx/memory")).status).toBe(400);
    const empty = await (await get("/api/agents/pip/memory")).json() as { enabled: boolean; notes: unknown[] };
    expect(empty).toMatchObject({ enabled: false, notes: [] });
    expect((await post("/api/agents/pip/memory", { note: "  " })).status).toBe(400);
    const added = await (await post("/api/agents/pip/memory", { note: "Maria is out on Fridays" })).json() as { notes: { text: string; at?: string }[] };
    expect(added.notes).toEqual([{ text: "Maria is out on Fridays", at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }]);
    expect((await post("/api/agents/pip/memory", { note: "Maria is out on Fridays" })).status).toBe(400);
    expect((await post("/api/agents/pip/memory/forget", { note: "nothing like it" })).status).toBe(404);
    const gone = await (await post("/api/agents/pip/memory/forget", { note: "Maria is out on Fridays" })).json() as { notes: unknown[] };
    expect(gone.notes).toEqual([]);
  });
});

describe("the rest", () => {
  it("Run now on a Garufile the loop refuses is logged, and the server lives on", async () => {
    const res = await post("/api/agents/pip/run", {});
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 300));
    expect((await get("/api/agents")).status).toBe(200);
    expect(logLines.some((l) => /✖ pip: unknown model provider "fake"/.test(l))).toBe(true);
  });

  it("the webhook door starts a run with the message as its input, and only through a declared hook", async () => {
    expect((await post("/api/agents/pip/hooks/nope", { message: "hi" })).status).toBe(404);
    expect((await post("/api/agents/nobody/hooks/nudge", {})).status).toBe(404);
    expect((await post("/api/agents/pip/hooks/nudge", { message: 42 })).status).toBe(400);
    expect((await post("/api/agents/pip/hooks/nudge", { message: "x".repeat(8001) })).status).toBe(400);
    // slow's model passes the provider check (pip's "fake" fails before anything is recorded), so its run is on the books.
    const res = await post("/api/agents/slow/hooks/nudge", { message: "Lena asked about the homepage" });
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 300));
    expect(logLines.some((l) => /▶ slow \(webhook nudge, with a message\)/.test(l))).toBe(true);
    for (let i = 0; i < 100; i++) {
      const now = (await (await get("/api/agents")).json()) as { agents: { name: string; status: string }[] };
      if (now.agents.find((x) => x.name === "slow")?.status !== "working") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    // The run is on the books with its trigger, like a cron fire would be.
    const runs = (await (await get("/api/runs?agent=slow")).json()) as { trigger: string }[];
    expect(runs.some((r) => r.trigger === "webhook:nudge")).toBe(true);
  }, 15_000);

  it("a parked run comes back on its own once its ask is answered, in the same log", async () => {
    const logRoot = join(root, ".garu", "runs");
    // A run of slow that parked on a write, as the kernel leaves it: a log ending in run.parked and the state beside it.
    const rec = new Recorder({ root: logRoot, agent: "slow" });
    rec.record({ type: "run.start", agent: "slow", model: "ollama/test", trigger: "cron:0 8 * * *" });
    rec.record({ type: "tool.request", callId: "c-park", request: { server: "fs", tool: "write_file", args: { path: "notes.md", content: "new" } } });
    rec.record({ type: "policy.decision", callId: "c-park", decision: { action: "ask", ruleIndex: 0, matched: "fs.write_file", reason: "writing" } });
    rec.record({ type: "approval.requested", callId: "c-park" });
    const id = pending("fs.write_file", { path: "notes.md", content: "new" }, "slow");
    rec.record({ type: "run.parked", requests: [id] });
    writeParked(logRoot, {
      version: 1, agent: "slow", runId: rec.runId, trigger: "cron:0 8 * * *", parkedAt: new Date().toISOString(), host: { hop: 0 },
      messages: [{ role: "user", content: [{ type: "text", text: "Carry out your standing instructions now." }] }, { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "fs__write_file", input: { path: "notes.md", content: "new" } }] }],
      step: [{ kind: "waiting", call: { toolUseId: "t1", name: "fs__write_file", qualified: "fs.write_file", args: { path: "notes.md", content: "new" }, callId: "c-park", requestId: id, decision: { action: "ask", ruleIndex: 0, matched: "fs.write_file", reason: "writing" } } }],
      turn: 1, completed: 1, totalCost: 0, inputTokens: 10, outputTokens: 5, unmetered: false, sent: { calls: 0, writes: 0 },
    });
    // Nothing happens while the ask is open.
    await new Promise((r) => setTimeout(r, 500));
    expect(readParked(logRoot, "slow", rec.runId)).not.toBeNull();
    expect((await (await get("/api/runs?agent=slow")).json() as { runId: string; status: string }[]).find((r) => r.runId === rec.runId)?.status).toBe("parked");

    expect((await post(`/api/inbox/${id}/approve`, {})).status).toBe(200);
    for (let i = 0; i < 100 && readParked(logRoot, "slow", rec.runId); i++) await new Promise((r) => setTimeout(r, 100));
    expect(readParked(logRoot, "slow", rec.runId)).toBeNull();
    expect(logLines.some((l) => l.includes(`▶ slow (resuming ${rec.runId}`))).toBe(true);
    for (let i = 0; i < 100; i++) {
      const now = (await (await get("/api/agents")).json()) as { agents: { name: string; status: string }[] };
      if (now.agents.find((x) => x.name === "slow")?.status !== "working") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    // Same log: the resume follows the park; slow's tool server isn't a real one, so the run then ends in error, with run.end on the books.
    const types = readRun(rec.path).map((e) => e.event.type);
    expect(types.slice(types.indexOf("run.parked"), types.indexOf("run.parked") + 2)).toEqual(["run.parked", "run.resumed"]);
    expect(types.at(-1)).toBe("run.end");
    expect(types.filter((t) => t === "run.start")).toHaveLength(1);
  }, 20_000);

  it("two Run now taps in the same instant start one run; the other is refused", async () => {
    const [a, b] = await Promise.all([post("/api/agents/slow/run", {}), post("/api/agents/slow/run", {})]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    const agents = (await (await get("/api/agents")).json()) as { agents: { name: string; status: string }[] };
    expect(agents.agents.find((x) => x.name === "slow")?.status).toBe("working");
    // The tool server exits and the run fails; wait for it so nothing is left running at the end.
    for (let i = 0; i < 100; i++) {
      const now = (await (await get("/api/agents")).json()) as { agents: { name: string; status: string }[] };
      if (now.agents.find((x) => x.name === "slow")?.status !== "working") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect((await get("/api/agents")).status).toBe(200);
  }, 15_000);

  it("feed, cost and settings answer, and settings never carries a value", async () => {
    expect(Array.isArray(await (await get("/api/feed")).json())).toBe(true);
    expect(Array.isArray(await (await get("/api/cost")).json())).toBe(true);
    const s = (await (await get("/api/settings")).json()) as { version: string; login: { required: boolean; direct: boolean }; env: unknown[] };
    expect(s.login).toMatchObject({ required: false, direct: true });
    expect(s.version).toBe((JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version);
    expect(JSON.stringify(s)).not.toContain("hunter2");
    expect((await get("/api/nothing-here")).status).toBe(404);
  });

  it("rotating the token keeps the caller signed in and signs everyone else out", async () => {
    const old = token;
    const res = await post("/api/pair", {}, { ...viaProxy, ...bearer() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).not.toBe(old);
    expect(res.headers.get("set-cookie")).toContain(`garu_session=${body.token}`);
    expect((await get("/api/agents", { headers: { ...viaProxy, authorization: `Bearer ${old}` } })).status).toBe(401);
    token = body.token;
    expect((await get("/api/agents", { headers: { ...viaProxy, ...bearer() } })).status).toBe(200);
  });
});

describe("the public demo", () => {
  it("lets people look around and answer asks, but nothing else writes: no runs, edits, grants, dismissals or new key", async () => {
    const port = await freePort();
    const demo = startUiServer({
      port, host: "127.0.0.1", root, logRoot: join(root, ".garu", "runs"), inboxRoot, chatRoot: join(root, ".garu", "chat"), memoryRoot: join(root, ".garu", "memory"),
      grantsPath: join(root, ".garu", "grants.jsonl"), dismissedPath: join(root, ".garu", "dismissed.json"), staticDir: join(root, "ui"),
      userName: "Test", decider: "Test (ui)", up: false, demo: true, askTimeoutMs: 60_000, tokenPath: join(root, ".garu", "ui-token"), log: () => {},
    });
    const b = `http://127.0.0.1:${port}`;
    const h = { authorization: `Bearer ${demo.token}`, "content-type": "application/json" };
    try {
      for (let i = 0; i < 40; i++) { try { if ((await fetch(`${b}/api/settings`, { headers: h })).ok) break; } catch { /* not listening yet */ } await new Promise((r) => setTimeout(r, 50)); }
      const agents = (await (await fetch(`${b}/api/agents`, { headers: h })).json()) as { demo: boolean; up: boolean; agents: { status: string }[] };
      expect(agents.demo).toBe(true);
      expect(agents.up).toBe(true); // the demo looks alive, though nothing runs
      expect(agents.agents.every((a) => a.status !== "needs-setup")).toBe(true);
      for (const path of ["/api/agents/pip/run", "/api/agents/pip/chat", "/api/suggestions/x/apply", "/api/suggestions/x/dismiss", "/api/grants/x/revoke", "/api/inbox/batch", "/api/pair"]) {
        const r = await fetch(`${b}${path}`, { method: "POST", headers: h, body: JSON.stringify({ text: "hi", ids: [], approve: true }) });
        expect(r.status, path).toBe(403);
      }
      // A plain answer to a sample ask is the one write a visitor may make; a 24h approve would leave a grant, so it isn't.
      const plain = pending("fs.write_file", { path: "docs/demo.md", content: "x" });
      const timed = pending("fs.write_file", { path: "docs/demo2.md", content: "x" });
      expect((await fetch(`${b}/api/inbox/${timed}/approve`, { method: "POST", headers: h, body: JSON.stringify({ for: "24h" }) })).status).toBe(403);
      expect((await fetch(`${b}/api/inbox/${plain}/approve`, { method: "POST", headers: h, body: JSON.stringify({}) })).status).toBe(200);
      expect((await fetch(`${b}/api/inbox/${timed}/deny`, { method: "POST", headers: h, body: JSON.stringify({ note: "no" }) })).status).toBe(200);
      expect(readFileSync(join(root, ".garu", "ui-token"), "utf8").trim()).toBe(demo.token);
    } finally { await demo.close(); }
  });
});
