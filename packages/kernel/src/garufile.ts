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
    eq: z.unknown().optional().describe("The argument equals this value (deep equality for lists and objects)."),
    neq: z.unknown().optional().describe("The argument differs from this value."),
    gt: z.number().optional().describe("The argument is a number greater than this."),
    gte: z.number().optional().describe("The argument is a number greater than or equal to this."),
    lt: z.number().optional().describe("The argument is a number less than this."),
    lte: z.number().optional().describe("The argument is a number less than or equal to this."),
    matches: z.string().optional().describe("The argument, as text, matches this regular expression (JavaScript syntax; no inline modifiers)."),
    ignoreCase: z.boolean().optional().describe("For matches: upper and lower case count the same."),
    in: z.array(z.unknown()).optional().describe("The argument is one of these values."),
    exists: z.boolean().optional().describe("true: the argument is present; false: it is absent."),
  })
  .strict()
  // Compiled here, so `garu validate` catches a bad pattern instead of the run dying at its first tool call.
  .superRefine((p, ctx) => {
    if (p.matches === undefined) return;
    try {
      new RegExp(p.matches, p.ignoreCase ? "i" : "");
    } catch (e) {
      ctx.addIssue({ code: "custom", path: ["matches"], message: `not a valid pattern: ${(e as Error).message}` });
    }
  });
export type ArgPredicate = z.infer<typeof ArgPredicate>;

export const PolicyRule = z
  .object({
    /** Glob over "<server>.<tool>" e.g. "gmail.send", "fs.*", "*". */
    tool: z.string().min(1).describe("A glob over \"<server>.<tool>\": \"gmail.send\", \"fs.*\", \"*\". The first rule whose glob and conditions match a call decides it."),
    action: PolicyAction.describe("allow: the call goes through on its own. ask: it waits for your approval in the inbox. block: it is refused, and a tool no rule can ever allow is not shown to the model."),
    /** Optional argument conditions. All must hold for the rule to match. */
    when: z.record(z.string(), ArgPredicate).optional().describe("Conditions on the call's arguments, by dotted path (\"to\", \"recipients.length\"); every one must hold for the rule to match."),
    /** Human reason shown in the approval inbox and the log. */
    reason: z.string().optional().describe("Why, in your words: shown on the review card, in the log and in the push."),
  })
  .strict();
export type PolicyRule = z.infer<typeof PolicyRule>;

const serverName = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/, "server name: lowercase, digits, - or _")
  .refine((s) => !s.includes("__"), "server name: no double underscore (it separates server and tool in the model's view)");

/**
 * Your own OAuth client, for servers that don't hand one out (Google's MCP servers, for one).
 * Values may be ${VAR}s from .env, so the secret never sits in the Garufile.
 */
export const OAuthClientSpec = z
  .object({
    clientId: z.string().min(1).describe("Your OAuth client id; ${VAR} reads it from .env."),
    clientSecret: z.string().optional().describe("Your OAuth client secret, as ${VAR} from .env; never written here."),
    /** The permissions to ask for, sent as the `scope` of the sign-in. */
    scopes: z.array(z.string().min(1)).optional().describe("The permissions the sign-in asks for (the scope)."),
    /** Extra sign-in parameters, e.g. Google's access_type: offline so runs can refresh without you. */
    authorizationParams: z.record(z.string(), z.string()).default({}).describe("Extra sign-in parameters, like Google's access_type: offline so runs can refresh the token without you."),
    /**
     * Who you sign in with, e.g. https://accounts.google.com. Needed for a local server, which has
     * no URL to discover it from; a remote server finds it on its own.
     */
    issuer: z.string().url().refine((u) => /^https:\/\//.test(u), "oauth.issuer must be https://").optional().describe("Who you sign in with, like https://accounts.google.com. A local server needs it; a remote one finds it on its own."),
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
    name: serverName.describe("The server's name in rules and in the log: lowercase, digits, - or _. Tools are \"<name>.<tool>\"."),
    command: z.string().min(1).describe("The program that runs the MCP server (node, npx, python…)."),
    args: z.array(z.string()).default([]).describe("Its arguments; ${VAR} reads a value from .env."),
    env: z.record(z.string(), z.string()).default({}).describe("Environment variables for the server; ${VAR} reads a value from .env, so secrets never sit here."),
    cwd: z.string().optional().describe("The folder it starts in."),
    auth: z.enum(["none", "oauth"]).optional().describe("oauth: Garu signs in for it once (garu auth, or the agent's page) and hands it a short-lived access token at the start of each run."),
    oauth: OAuthClientSpec.optional().describe("Your own OAuth client, for a server that does not hand one out."),
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
    headers: z.record(z.string(), z.string()).default({}).describe("Static headers, like an API key as ${VAR} from .env."),
    auth: z.enum(["none", "oauth"]).default("none").describe("oauth: Garu signs in to it once (garu auth) and keeps the tokens."),
    oauth: OAuthClientSpec.optional().describe("Your own OAuth client, when the server needs one."),
  })
  .strict()
  .refine((s) => !s.oauth || s.auth === "oauth", { message: "an oauth: client only applies with auth: oauth", path: ["oauth"] });
export type HttpServerSpec = z.infer<typeof HttpServerSpec>;

export const McpServerSpec = z.union([StdioServerSpec, HttpServerSpec]);

/** The agent's face and one-line character. Purely presentational; the policy is what it can do. */
export const PERSONA_KINDS = ["owl", "fox", "turtle", "bee", "cat", "octopus", "rabbit", "bear", "frog", "penguin", "raccoon", "whale"] as const;
export const Persona = z
  .object({
    /** owl: watcher · fox: messenger · turtle: keeper · bee: worker · cat: reader · octopus: planner ·
     *  rabbit: runner · bear: guardian · frog: connector · penguin: organizer · raccoon: tinkerer · whale: deep reader */
    kind: z.enum(PERSONA_KINDS).describe("Its face in the control room: owl (watcher), fox (messenger), turtle (keeper), bee (worker), cat (reader), octopus (planner), rabbit (runner), bear (guardian), frog (connector), penguin (organizer), raccoon (tinkerer), whale (deep reader)."),
    tagline: z.string().max(80).optional().describe("One line of character, shown under its name."),
  })
  .strict();
export type Persona = z.infer<typeof Persona>;
export type McpServerSpec = z.infer<typeof McpServerSpec>;

export function isRemoteServer(spec: McpServerSpec): spec is HttpServerSpec {
  return "url" in spec;
}

export const Trigger = z
  .object({
    cron: z.string().optional().describe("A schedule (minute hour day month weekday), in this computer's time zone; runs while the control room is up with --up or as the login service."),
    /** A door: POST /api/agents/<agent>/hooks/<name> on the control room starts a run, with the body's message as its input. */
    webhook: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "a webhook name is lowercase letters, digits and dashes, up to 40").optional().describe("A door: POST /api/agents/<agent>/hooks/<name> on the control room starts a run, with the body's message as its input."),
    manual: z.boolean().optional().describe("Runs when told: Run now, a message, garu run."),
  })
  .strict()
  .refine((t) => t.cron || t.webhook || t.manual, {
    message: "a trigger needs one of: cron, webhook, manual",
  });
export type Trigger = z.infer<typeof Trigger>;

export const Budget = z
  .object({
    /** Stop the run as soon as its estimated cost reaches this many USD. */
    maxCostUsd: z.number().nonnegative().optional().describe("A run stops before its estimated cost crosses this many dollars."),
    /** At most this many runs a day (this computer's day), whatever starts them: a schedule, a webhook, another agent, a message. A run the network cut off doesn't count. */
    maxRunsPerDay: z.number().int().positive().optional().describe("At most this many runs a day, whatever starts them; a run the network cut off does not count."),
    /** Override the built-in price table for this agent's model (set both to 0 on a free tier). */
    pricing: z
      .object({ inputPerMTok: z.number().nonnegative().describe("Dollars per million input tokens."), outputPerMTok: z.number().nonnegative().describe("Dollars per million output tokens.") })
      .strict()
      .optional()
      .describe("Your own price for this model, in dollars per million tokens (both 0 on a free tier); otherwise Garu's table."),
  })
  .strict();
export type Budget = z.infer<typeof Budget>;

export const SandboxMount = z
  .object({
    host: z.string().min(1).describe("A folder on this computer."),
    container: z.string().regex(/^\//, "container path must be absolute").describe("Where it appears inside the container (an absolute path)."),
    readonly: z.boolean().default(false).describe("Mount it read-only."),
  })
  .strict();

/** Run every tool server of this agent inside its own Docker container. */
export const Sandbox = z
  .object({
    /** Image with the tool servers installed. `garu sandbox build` makes the default one. */
    image: z.string().min(1).default("garu-sandbox").describe("The Docker image with the tool servers in it; garu sandbox build makes the default one."),
    /** "none" = no network at all (default). "bridge" = normal outbound internet. */
    network: z.enum(["none", "bridge"]).default("none").describe("none: no network at all. bridge: normal outbound internet."),
    /** Host directory mounted read-write at /workspace inside the container. */
    workspace: z.string().min(1).optional().describe("A folder on this computer mounted read-write at /workspace inside the container."),
    mounts: z.array(SandboxMount).default([]).describe("More folders to mount."),
    memory: z.string().regex(/^\d+[kmg]$/i, 'memory like "512m" or "2g"').default("512m").describe("Memory for the container, like 512m or 2g."),
    cpus: z.number().positive().default(1).describe("CPUs for the container."),
  })
  .strict();
export type Sandbox = z.infer<typeof Sandbox>;

export const Garufile = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/, "agent name: lowercase, digits, hyphens").describe("The agent's name: lowercase letters, digits and hyphens. It is what you call it, and its folder under agents/."),
    description: z.string().default("").describe("What it does, in one line; shown under its name."),
    /** What the agent writes to its owner in, as a code ("es", "pt-BR"). Garu hands it the date in that language and tells it to write in it. Unset: English. */
    language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "language must be a code like es or pt-BR").optional().describe("What it writes to you in, as a code (es, pt-BR); it gets the date in that language too. Unset: English."),
    /** A small notebook the agent keeps between runs (garu.remember / garu.forget, policed like any tool; the owner edits it on the agent's page). Off unless asked for. */
    memory: z.boolean().default(false).describe("A small notebook it keeps between runs (garu.remember and garu.forget, policed like any tool; you read and edit it on its page)."),
    /** Kept on the schedule but skipped: a vacation, a week you don't want it touching anything. */
    paused: z.boolean().default(false).describe("Kept on the schedule but skipped, until you resume it."),
    persona: Persona.optional().describe("Its face and one line of character; what it may do is the policy."),
    /** "<provider>/<model>" e.g. "anthropic/claude-sonnet-4-5". */
    model: z.string().regex(/^[a-z0-9-]+\/.+$/, "model must look like provider/model-id").describe("provider/model, like gemini/gemini-2.5-flash-lite, anthropic/claude-haiku-4-5, openai/gpt-5-mini or ollama/qwen3:8b."),
    prompt: z.string().min(1, "prompt is required").describe("The job, as the model reads it. Garu adds the date, your name and the tools on its own."),
    tools: z.array(McpServerSpec).default([]).describe("The MCP tool servers it may use: a command Garu runs, or a URL it connects to. Empty: it can only think and reply."),
    triggers: z.array(Trigger).default([{ manual: true }]).describe("When it runs: a cron schedule, a webhook door, or only when told."),
    policy: z.array(PolicyRule).default([{ tool: "*", action: "ask" }]).describe("The rules in front of every tool call, read top to bottom; the first match wins, and a call no rule matches asks you."),
    /** Hard cap on model turns per run. Agents must not loop forever. */
    maxTurns: z.number().int().positive().default(25).describe("At most this many model turns in a run, so it can never loop forever."),
    /** Money guard. Optional, but every always-on agent should have one. */
    budget: Budget.default({}).describe("The money guard: a cap per run, a cap on runs a day, your own prices."),
    /**
     * Knobs for the model. temperature, maxOutputTokens (or max_tokens) and thinkingBudget (or budget_tokens)
     * reach every provider under its own name; Ollama also takes its own options (think, num_ctx, top_p…)
     * as they are. A key a provider has no place for is left out of its request.
     */
    modelOptions: z.record(z.string(), z.unknown()).default({}).describe("Knobs for the model: temperature, maxOutputTokens, thinkingBudget, and Ollama's own options as they are. A key a provider has no place for is left out."),
    /** Omit to run tool servers directly on the host. Set (even `{}`) to containerise them. */
    sandbox: Sandbox.optional().describe("Run every tool server inside its own Docker container. Omit to run them on this computer; set (even {}) to contain them."),
  })
  .strict();
export type Garufile = z.infer<typeof Garufile>;

/**
 * "es" → "Spanish", "pt-BR" → "Brazilian Portuguese"; null for a code this computer has no name for.
 * The schema only checks the shape of a code, and Intl falls back to English for one it doesn't know
 * without saying so, so `garu validate` warns on a null here.
 */
export function knownLanguage(code: string, inLanguage = "en"): string | null {
  try {
    const name = new Intl.DisplayNames([inLanguage], { type: "language", fallback: "none" }).of(code);
    return name && name.toLowerCase() !== code.toLowerCase() ? name : null;
  } catch {
    return null;
  }
}

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
