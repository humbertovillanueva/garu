import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Inbox, suggestRules } from "@garu/kernel";
import { startUiServer } from "./ui-server.js";

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
  mkdirSync(join(root, "ui"));
  writeFileSync(join(root, "ui", "index.html"), "<!doctype html><title>Garu test</title>");
  writeFileSync(join(root, "notes.md"), "old\n");
  writeFileSync(join(root, ".env"), "SECRET=hunter2\n");
  inboxRoot = join(root, ".garu", "inbox");
  for (const d of ["runs", "inbox", "chat"]) mkdirSync(join(root, ".garu", d), { recursive: true });
  const port = await freePort();
  srv = startUiServer({
    port, host: "127.0.0.1", root, logRoot: join(root, ".garu", "runs"), inboxRoot, chatRoot: join(root, ".garu", "chat"),
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
    expect(((await mine.json()) as { agents: { name: string }[] }).agents.map((a) => a.name)).toEqual(["pip", "vault"]);
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
  });

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

describe("the rest", () => {
  it("Run now on a Garufile the loop refuses is logged, and the server lives on", async () => {
    const res = await post("/api/agents/pip/run", {});
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 300));
    expect((await get("/api/agents")).status).toBe(200);
    expect(logLines.some((l) => /✖ pip: unknown model provider "fake"/.test(l))).toBe(true);
  });

  it("feed, cost and settings answer, and settings never carries a value", async () => {
    expect(Array.isArray(await (await get("/api/feed")).json())).toBe(true);
    expect(Array.isArray(await (await get("/api/cost")).json())).toBe(true);
    const s = (await (await get("/api/settings")).json()) as { login: { required: boolean; direct: boolean }; env: unknown[] };
    expect(s.login).toMatchObject({ required: false, direct: true });
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
  it("lets people look around and answer asks, but nothing runs, nothing is edited, and the key stays", async () => {
    const port = await freePort();
    const demo = startUiServer({
      port, host: "127.0.0.1", root, logRoot: join(root, ".garu", "runs"), inboxRoot, chatRoot: join(root, ".garu", "chat"),
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
      for (const path of ["/api/agents/pip/run", "/api/agents/pip/chat", "/api/suggestions/x/apply", "/api/pair"]) {
        const r = await fetch(`${b}${path}`, { method: "POST", headers: h, body: JSON.stringify({ text: "hi" }) });
        expect(r.status, path).toBe(403);
      }
      const batch = await fetch(`${b}/api/inbox/batch`, { method: "POST", headers: h, body: JSON.stringify({ ids: [], approve: true }) });
      expect(batch.status).toBe(200);
      expect(readFileSync(join(root, ".garu", "ui-token"), "utf8").trim()).toBe(demo.token);
    } finally { await demo.close(); }
  });
});
