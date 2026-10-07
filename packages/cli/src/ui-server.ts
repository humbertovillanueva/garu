/**
 * The control room's server. Plain Node http: it's localhost, it serves a
 * folder of static files and a handful of JSON endpoints over the same
 * flight-recorder and inbox files the CLI uses. Changes on disk are pushed to
 * the browser over Server-Sent Events, so the page is live without polling.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Inbox, RunStore } from "@garu/kernel";

export interface UiServerOptions {
  port: number;
  host: string;
  logRoot: string;
  inboxRoot: string;
  staticDir: string;
  /** Who approvals are recorded as. */
  decider: string;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

export function startUiServer(opts: UiServerOptions): { close: () => void; url: string } {
  const store = new RunStore(opts.logRoot);
  const inbox = new Inbox({ root: opts.inboxRoot });
  const clients = new Set<ServerResponse>();

  // --- live updates: debounce fs events into one "changed" ping ---
  let timer: NodeJS.Timeout | undefined;
  const ping = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const res of clients) res.write(`event: changed\ndata: ${Date.now()}\n\n`);
    }, 150);
  };
  const watchers: FSWatcher[] = [];
  for (const dir of [opts.logRoot, opts.inboxRoot]) {
    if (!existsSync(dir)) continue;
    try {
      watchers.push(watch(dir, { recursive: true }, ping));
    } catch {
      /* recursive watch unsupported on some platforms; the UI still works, just not live */
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    try {
      if (path === "/api/events") return sse(res, clients);
      if (path === "/api/agents") return json(res, store.agentSummaries());
      if (path === "/api/runs") {
        const agent = url.searchParams.get("agent");
        return json(res, agent ? store.runs(agent) : store.allRuns().slice(0, 200));
      }
      const m = /^\/api\/runs\/([^/]+)\/([^/]+)$/.exec(path);
      if (m) {
        const events = store.run(decodeURIComponent(m[1]!), decodeURIComponent(m[2]!));
        return events ? json(res, events) : json(res, { error: "no such run" }, 404);
      }
      if (path === "/api/inbox") return json(res, { pending: inbox.pending(), recent: inbox.all().slice(-50).reverse() });
      const d = /^\/api\/inbox\/([a-z0-9]+)\/(approve|deny)$/.exec(path);
      if (d && req.method === "POST") {
        try {
          const r = inbox.decide(d[1]!, d[2] === "approve", opts.decider);
          ping();
          return json(res, r);
        } catch (e) {
          return json(res, { error: (e as Error).message }, 409);
        }
      }
      if (path === "/api/cost") return json(res, store.costByDay(Number(url.searchParams.get("days") ?? 14)));
      if (path.startsWith("/api/")) return json(res, { error: "not found" }, 404);
      return serveStatic(res, opts.staticDir, path);
    } catch (e) {
      return json(res, { error: (e as Error).message }, 500);
    }
  });

  server.listen(opts.port, opts.host);
  const url = `http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${opts.port}`;
  return {
    url,
    close: () => {
      for (const w of watchers) w.close();
      for (const c of clients) c.end();
      server.close();
    },
  };
}

function json(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sse(res: ServerResponse, clients: Set<ServerResponse>): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  res.write(`event: hello\ndata: ok\n\n`);
  clients.add(res);
  const keepalive = setInterval(() => res.write(`: ping\n\n`), 25_000);
  res.on("close", () => {
    clearInterval(keepalive);
    clients.delete(res);
  });
}

function serveStatic(res: ServerResponse, dir: string, urlPath: string): void {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  let file = join(dir, rel);
  if (!file.startsWith(dir)) return void json(res, { error: "forbidden" }, 403);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html"); // SPA fallback
  if (!existsSync(file)) {
    res.writeHead(503, { "content-type": "text/plain" });
    return void res.end("control room UI is not built. Run: npm run build\n");
  }
  const type = MIME[extname(file)] ?? "application/octet-stream";
  const immutable = /\/assets\//.test(file);
  res.writeHead(200, { "content-type": type, "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
  res.end(readFileSync(file));
}

export function notFound(_req: IncomingMessage, res: ServerResponse): void {
  json(res, { error: "not found" }, 404);
}
