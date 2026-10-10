/**
 * Garufile — the portable manifest that describes one agent.
 *
 * Everything an agent is lives here: what model it thinks with, which MCP
 * servers it may talk to, when it wakes up, and — most importantly — the
 * policy that decides what it is allowed to do.
 */
import { z } from "zod";
import { parse as parseYaml } from "yaml";

export const PolicyAction = z.enum(["allow", "ask", "block"]);
export type PolicyAction = z.infer<typeof PolicyAction>;

/**
 * A predicate on one tool-call argument. Keys are JSON-pointer-ish dotted
 * paths into the arguments object (e.g. "to", "recipients.length").
 */
export const ArgPredicate = z
  .object({
    eq: z.unknown().optional(),
    neq: z.unknown().optional(),
    gt: z.number().optional(),
    gte: z.number().optional(),
    lt: z.number().optional(),
    lte: z.number().optional(),
    matches: z.string().optional(), // regex source
    in: z.array(z.unknown()).optional(),
    exists: z.boolean().optional(),
  })
  .strict();
export type ArgPredicate = z.infer<typeof ArgPredicate>;

export const PolicyRule = z
  .object({
    /** Glob over "<server>.<tool>" e.g. "gmail.send", "fs.*", "*". */
    tool: z.string().min(1),
    action: PolicyAction,
    /** Optional argument conditions. All must hold for the rule to match. */
    when: z.record(z.string(), ArgPredicate).optional(),
    /** Human reason shown in the approval inbox and the log. */
    reason: z.string().optional(),
  })
  .strict();
export type PolicyRule = z.infer<typeof PolicyRule>;

const serverName = z.string().regex(/^[a-z][a-z0-9_-]*$/, "server name: lowercase, digits, - or _");

/**
 * Your own OAuth client, for servers that don't hand one out (Google's MCP servers, for one).
 * Values may be ${VAR}s from .env, so the secret never sits in the Garufile.
 */
export const OAuthClientSpec = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().optional(),
    /** The permissions to ask for, sent as the `scope` of the sign-in. */
    scopes: z.array(z.string().min(1)).optional(),
    /** Extra sign-in parameters, e.g. Google's access_type: offline so runs can refresh without you. */
    authorizationParams: z.record(z.string(), z.string()).default({}),
    /**
     * Who you sign in with, e.g. https://accounts.google.com. Needed for a local server, which has
     * no URL to discover it from; a remote server finds it on its own.
     */
    issuer: z.string().url().refine((u) => /^https:\/\//.test(u), "oauth.issuer must be https://").optional(),
  })
  .strict();
export type OAuthClientSpec = z.infer<typeof OAuthClientSpec>;

/**
 * A local MCP server: a process Garu starts (and can sandbox). With `auth: oauth`, Garu signs in
 * for it (`garu auth`) and hands it a short-lived access token in GARU_OAUTH_ACCESS_TOKEN at start;
 * the server never sees the client secret or the refresh token.
 */
export const StdioServerSpec = z
  .object({
    name: serverName,
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
    cwd: z.string().optional(),
    auth: z.enum(["none", "oauth"]).optional(),
    oauth: OAuthClientSpec.optional(),
  })
  .strict()
  .refine((s) => !s.oauth || s.auth === "oauth", { message: "an oauth: client only applies with auth: oauth", path: ["oauth"] })
  .refine((s) => s.auth !== "oauth" || Boolean(s.oauth?.issuer), { message: "a local server with auth: oauth needs oauth: with an issuer (who to sign in with) and a clientId", path: ["oauth"] });
export type StdioServerSpec = z.infer<typeof StdioServerSpec>;

/**
 * A remote MCP server over Streamable HTTP: a URL Garu connects to. Static
 * headers carry API keys from .env via ${VAR}; `auth: oauth` uses tokens from
 * `garu auth`, with `oauth:` naming your own client when the server needs one.
 * Nothing runs locally, so the sandbox does not apply.
 */
export const HttpServerSpec = z
  .object({
    name: serverName,
    url: z
      .string()
      .url()
      .refine((u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u), "remote server url must be https:// (http:// only for localhost)"),
    headers: z.record(z.string(), z.string()).default({}),
    auth: z.enum(["none", "oauth"]).default("none"),
    oauth: OAuthClientSpec.optional(),
  })
  .strict()
  .refine((s) => !s.oauth || s.auth === "oauth", { message: "an oauth: client only applies with auth: oauth", path: ["oauth"] });
export type HttpServerSpec = z.infer<typeof HttpServerSpec>;

export const McpServerSpec = z.union([StdioServerSpec, HttpServerSpec]);

/** The agent's face and one-line character. Purely presentational; the policy is what it can do. */
export const PERSONA_KINDS = ["owl", "fox", "turtle", "bee", "cat", "octopus"] as const;
export const Persona = z
  .object({
    /** owl: watcher · fox: messenger · turtle: keeper · bee: worker · cat: reader · octopus: planner */
    kind: z.enum(PERSONA_KINDS),
    tagline: z.string().max(80).optional(),
  })
  .strict();
export type Persona = z.infer<typeof Persona>;
export type McpServerSpec = z.infer<typeof McpServerSpec>;

export function isRemoteServer(spec: McpServerSpec): spec is HttpServerSpec {
  return "url" in spec;
}

export const Trigger = z
  .object({
    cron: z.string().optional(),
    webhook: z.string().optional(),
    manual: z.boolean().optional(),
  })
  .strict()
  .refine((t) => t.cron || t.webhook || t.manual, {
    message: "a trigger needs one of: cron, webhook, manual",
  });
export type Trigger = z.infer<typeof Trigger>;

export const Budget = z
  .object({
    /** Stop the run as soon as its estimated cost reaches this many USD. */
    maxCostUsd: z.number().nonnegative().optional(),
    /** Override the built-in price table for this agent's model (set both to 0 on a free tier). */
    pricing: z
      .object({ inputPerMTok: z.number().nonnegative(), outputPerMTok: z.number().nonnegative() })
      .strict()
      .optional(),
  })
  .strict();
export type Budget = z.infer<typeof Budget>;

export const SandboxMount = z
  .object({
    host: z.string().min(1),
    container: z.string().regex(/^\//, "container path must be absolute"),
    readonly: z.boolean().default(false),
  })
  .strict();

/** Run every tool server of this agent inside its own Docker container. */
export const Sandbox = z
  .object({
    /** Image with the tool servers installed. `garu sandbox build` makes the default one. */
    image: z.string().min(1).default("garu-sandbox"),
    /** "none" = no network at all (default). "bridge" = normal outbound internet. */
    network: z.enum(["none", "bridge"]).default("none"),
    /** Host directory mounted read-write at /workspace inside the container. */
    workspace: z.string().min(1).optional(),
    mounts: z.array(SandboxMount).default([]),
    memory: z.string().regex(/^\d+[kmg]$/i, 'memory like "512m" or "2g"').default("512m"),
    cpus: z.number().positive().default(1),
  })
  .strict();
export type Sandbox = z.infer<typeof Sandbox>;

export const Garufile = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/, "agent name: lowercase, digits, hyphens"),
    description: z.string().default(""),
    persona: Persona.optional(),
    /** "<provider>/<model>" e.g. "anthropic/claude-sonnet-4-5". */
    model: z.string().regex(/^[a-z0-9-]+\/.+$/, "model must look like provider/model-id"),
    prompt: z.string().min(1, "prompt is required"),
    tools: z.array(McpServerSpec).default([]),
    triggers: z.array(Trigger).default([{ manual: true }]),
    policy: z.array(PolicyRule).default([{ tool: "*", action: "ask" }]),
    /** Hard cap on model turns per run. Agents must not loop forever. */
    maxTurns: z.number().int().positive().default(25),
    /** Money guard. Optional, but every always-on agent should have one. */
    budget: Budget.default({}),
    /** Provider-specific knobs passed through untouched (e.g. Ollama: { think: false, temperature: 0.2 }). */
    modelOptions: z.record(z.string(), z.unknown()).default({}),
    /** Omit to run tool servers directly on the host. Set (even `{}`) to containerise them. */
    sandbox: Sandbox.optional(),
  })
  .strict();
export type Garufile = z.infer<typeof Garufile>;

export class GarufileError extends Error {
  constructor(message: string, public readonly issues: string[] = []) {
    super(message);
    this.name = "GarufileError";
  }
}

/** Parse YAML text into a validated Garufile, or throw a GarufileError. */
export function parseGarufile(yamlText: string, source = "Garufile.yaml"): Garufile {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (e) {
    throw new GarufileError(`${source}: invalid YAML — ${(e as Error).message}`);
  }
  const result = Garufile.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      const path = i.path.length ? i.path.join(".") : "(root)";
      return `${path}: ${i.message}`;
    });
    throw new GarufileError(`${source}: ${issues.length} problem(s)\n  - ${issues.join("\n  - ")}`, issues);
  }
  // Duplicate server names would make "<server>.<tool>" ambiguous.
  const seen = new Set<string>();
  for (const t of result.data.tools) {
    if (seen.has(t.name)) throw new GarufileError(`${source}: duplicate tool server name "${t.name}"`);
    seen.add(t.name);
  }
  return result.data;
}
