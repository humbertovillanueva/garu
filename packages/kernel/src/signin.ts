/**
 * The browser sign-in for a tool server with `auth: oauth`, as a flow a caller can drive: it gets the
 * authorization URL to open (the terminal opens a browser; the control room hands it to the page, which
 * opens a tab), and a promise that settles once the browser came back to the loopback callback and the
 * tokens are saved. The callback listener lives on AUTH_CALLBACK_PORT, the port registered with the
 * issuer as the redirect, so only one sign-in can wait at a time: a second one is a SignInBusyError.
 */
import { createServer, type Server } from "node:http";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { isRemoteServer, type McpServerSpec } from "./garufile.js";
import { AUTH_CALLBACK_PORT, signInFor } from "./oauth.js";

export interface SignInFlow {
  /** Where the browser goes: the issuer's authorization page. */
  url: URL;
  /** Settles once the browser came back and the tokens are saved; rejects on a refusal, a cancel or the timeout. */
  done: Promise<void>;
  /** Give up: the listener closes and `done` rejects. */
  cancel: () => void;
}

/** What the browser tab shows when it comes back; the caller words it (the kernel has no language). */
export interface SignInPage {
  signedIn: string;
  failed: string;
  /** The line under "Signed in"; `{server}` is the tool server's name. */
  close: string;
}

const PAGE: SignInPage = { signedIn: "Signed in", failed: "Sign-in failed", close: "{server} can now be used by your agents. You can close this tab." };

export class SignInBusyError extends Error {
  constructor(public readonly port: number) {
    super(`port ${port} is in use: another sign-in is waiting for a browser, or something else holds it`);
    this.name = "SignInBusyError";
  }
}

export interface SignInOptions {
  /** The loopback port the browser comes back to; AUTH_CALLBACK_PORT unless a test says otherwise. */
  port?: number;
  /** How long to wait for the browser; five minutes. */
  timeoutMs?: number;
  page?: Partial<SignInPage>;
}

const html = (title: string, detail: string) =>
  `<!doctype html><meta charset="utf-8"><title>Garu</title><body style="font-family:system-ui;background:#0a0c0f;color:#e6eaf0;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:22px;font-weight:600">${title}</div><div style="color:#aeb6c2;margin-top:8px">${detail}</div></div>`;

/**
 * Start the sign-in: the listener is up and the authorization URL is ready when this resolves. A saved
 * sign-in is replaced, not refreshed: that is what signing in again is for (Google ends a Testing-mode
 * sign-in after seven days).
 */
export async function startSignIn(spec: McpServerSpec, authRoot: string, opts: SignInOptions = {}): Promise<SignInFlow> {
  if (spec.auth !== "oauth") throw new Error(`tool server "${spec.name}" doesn't sign in (no auth: oauth)`);
  const where = isRemoteServer(spec) ? spec.url : spec.oauth?.issuer;
  if (!where) throw new Error(`tool server "${spec.name}" has auth: oauth but no oauth.issuer to sign in with`);
  const port = opts.port ?? AUTH_CALLBACK_PORT;
  const redirectUrl = `http://127.0.0.1:${port}/callback`;
  const page = { ...PAGE, ...(opts.page ?? {}) };

  let gotCode!: (code: string) => void;
  let gotError!: (e: Error) => void;
  const code = new Promise<string>((res, rej) => { gotCode = res; gotError = rej; });
  const listener: Server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", redirectUrl);
    if (u.pathname !== "/callback") { res.writeHead(404); res.end(); return; }
    const err = u.searchParams.get("error");
    const c = u.searchParams.get("code");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(err || !c ? html(page.failed, `${err ?? "no code"}: ${u.searchParams.get("error_description") ?? ""}`) : html(page.signedIn, page.close.replace("{server}", spec.name)));
    if (err || !c) gotError(new Error(`authorization server answered: ${err ?? "no code"} ${u.searchParams.get("error_description") ?? ""}`.trim()));
    else gotCode(c);
  });
  await new Promise<void>((res, rej) => {
    listener.once("error", (e: NodeJS.ErrnoException) => rej(e.code === "EADDRINUSE" ? new SignInBusyError(port) : e));
    listener.listen(port, "127.0.0.1", () => res());
  });
  const close = () => { listener.close(); listener.closeAllConnections?.(); };

  let url: URL | undefined;
  const provider = signInFor(spec, authRoot, { redirectUrl, onAuthorize: (u) => { url = u; } });
  try {
    // With tokens in place the flow would only refresh them; signing in again means a new consent.
    if (provider.signedIn()) provider.invalidateCredentials("tokens");
    const r = await auth(provider, { serverUrl: where });
    if (r !== "REDIRECT" || !url) throw new Error(`the issuer at ${where} did not ask for a sign-in`);
  } catch (e) {
    close();
    throw e;
  }

  const timer = setTimeout(() => gotError(new Error("timed out waiting for the browser")), opts.timeoutMs ?? 5 * 60_000);
  timer.unref();
  const done = (async () => {
    try {
      const c = await code;
      const r = await auth(provider, { serverUrl: where, authorizationCode: c });
      if (r !== "AUTHORIZED" || !provider.signedIn()) throw new Error(`the sign-in for "${spec.name}" didn't finish`);
    } finally {
      clearTimeout(timer);
      // Let the browser's page land before the socket goes; `done` settles with the port free again.
      await new Promise((r) => setTimeout(r, 150));
      close();
    }
  })();
  done.catch(() => { /* the caller awaits `done` itself; this keeps an abandoned flow from being an unhandled rejection */ });
  return { url, done, cancel: () => gotError(new Error("the sign-in was cancelled")) };
}
