/**
 * OAuth for remote MCP servers, kept in files.
 *
 * The MCP SDK drives the protocol (discovery, dynamic client registration,
 * PKCE, refresh). This provider gives it somewhere to keep what it learns —
 * one JSON file per server URL under .garu/auth/ — and decides what happens
 * when a server wants a human in a browser: during `garu auth` we open one;
 * during an unattended run we stop with a message that says to run `garu auth`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * One fixed loopback redirect for every sign-in. Authorization servers bind the
 * registered client to its redirect URI, so it must be the same during `garu auth`
 * (where a local listener catches the code) and during runs (where only the
 * saved tokens are used). Override with GARU_AUTH_PORT if the port is taken.
 */
export const AUTH_CALLBACK_PORT = Number(process.env["GARU_AUTH_PORT"] ?? 47831);
export const AUTH_REDIRECT_URL = `http://127.0.0.1:${AUTH_CALLBACK_PORT}/callback`;

export class NeedsSignInError extends Error {
  constructor(readonly server: string, readonly url: string) {
    super(`tool server "${server}" (${url}) needs you to sign in first: run \`garu auth <Garufile> ${server}\``);
    this.name = "NeedsSignInError";
  }
}

interface Stored {
  url: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  updatedAt: string;
}

export interface FileOAuthProviderOptions {
  /** Directory for the per-server JSON files, e.g. .garu/auth */
  root: string;
  /** Server name from the Garufile, for messages. */
  server: string;
  /** The MCP server URL. Tokens are keyed by it, so two agents using one server share a sign-in. */
  url: string;
  /** Where the authorization server sends the browser back. Set by `garu auth`; absent during runs. */
  redirectUrl?: string;
  /** Called with the authorization URL when a human must sign in. Absent = unattended = fail clearly. */
  onAuthorize?: (url: URL) => void | Promise<void>;
  /**
   * Your own OAuth client, for servers that don't register one for us (no dynamic client
   * registration). Values are already expanded from .env.
   */
  client?: { clientId: string; clientSecret?: string | undefined; scopes?: string[] | undefined; authorizationParams?: Record<string, string> | undefined };
}

export function authFileFor(root: string, url: string): string {
  const key = createHash("sha256").update(new URL(url).href).digest("hex").slice(0, 16);
  return join(root, `${key}.json`);
}

export class FileOAuthProvider implements OAuthClientProvider {
  private readonly file: string;

  constructor(private readonly opts: FileOAuthProviderOptions) {
    this.file = authFileFor(opts.root, opts.url);
  }

  get redirectUrl(): string {
    // Always present: without it the SDK assumes a machine-to-machine flow. A
    // run that lacks tokens then reaches redirectToAuthorization, which fails clearly.
    return this.opts.redirectUrl ?? AUTH_REDIRECT_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    const c = this.opts.client;
    return {
      client_name: "Garu",
      client_uri: "https://github.com/humbertovillanueva/garu",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: c?.clientSecret ? "client_secret_post" : "none",
      ...(c?.scopes?.length ? { scope: c.scopes.join(" ") } : {}),
    };
  }

  private read(): Stored {
    if (!existsSync(this.file)) return { url: this.opts.url, updatedAt: new Date(0).toISOString() };
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as Stored;
    } catch {
      return { url: this.opts.url, updatedAt: new Date(0).toISOString() };
    }
  }

  private write(patch: Partial<Stored>): void {
    mkdirSync(this.opts.root, { recursive: true });
    const next: Stored = { ...this.read(), ...patch, url: this.opts.url, updatedAt: new Date().toISOString() };
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    // A client named in the Garufile wins over anything registered earlier, so changing it takes effect.
    const c = this.opts.client;
    if (c) return { client_id: c.clientId, ...(c.clientSecret ? { client_secret: c.clientSecret } : {}) };
    return this.read().client;
  }
  saveClientInformation(client: OAuthClientInformationMixed): void {
    this.write({ client });
  }
  tokens(): OAuthTokens | undefined {
    return this.read().tokens;
  }
  saveTokens(tokens: OAuthTokens): void {
    this.write({ tokens });
  }
  saveCodeVerifier(codeVerifier: string): void {
    this.write({ codeVerifier });
  }
  codeVerifier(): string {
    const v = this.read().codeVerifier;
    if (!v) throw new Error(`no PKCE verifier saved for ${this.opts.url}; start the sign-in again with garu auth`);
    return v;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (!this.opts.onAuthorize) throw new NeedsSignInError(this.opts.server, this.opts.url);
    await this.opts.onAuthorize(this.withClientParams(authorizationUrl));
  }

  /**
   * The sign-in URL with what the Garufile asks for: exactly its scopes (not whatever the server
   * advertises), plus extra parameters such as Google's access_type=offline, without which no
   * refresh token is issued and every scheduled run would need you at the browser again.
   */
  withClientParams(authorizationUrl: URL): URL {
    const c = this.opts.client;
    if (!c) return authorizationUrl;
    const url = new URL(authorizationUrl.href);
    if (c.scopes?.length) url.searchParams.set("scope", c.scopes.join(" "));
    for (const [k, v] of Object.entries(c.authorizationParams ?? {})) url.searchParams.set(k, v);
    return url;
  }

  /** True when a sign-in has been completed for this server (tokens on disk). */
  signedIn(): boolean {
    return Boolean(this.read().tokens?.access_token);
  }

  /** Remove the stored sign-in. */
  forget(): void {
    if (existsSync(this.file)) unlinkSync(this.file);
  }
}
