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

export const McpServerSpec = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_-]*$/, "server name: lowercase, digits, - or _"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
    cwd: z.string().optional(),
  })
  .strict();
export type McpServerSpec = z.infer<typeof McpServerSpec>;

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

export const Garufile = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/, "agent name: lowercase, digits, hyphens"),
    description: z.string().default(""),
    /** "<provider>/<model>" e.g. "anthropic/claude-sonnet-4-5". */
    model: z.string().regex(/^[a-z0-9-]+\/.+$/, "model must look like provider/model-id"),
    prompt: z.string().min(1, "prompt is required"),
    tools: z.array(McpServerSpec).default([]),
    triggers: z.array(Trigger).default([{ manual: true }]),
    policy: z.array(PolicyRule).default([{ tool: "*", action: "ask" }]),
    /** Hard cap on model turns per run. Agents must not loop forever. */
    maxTurns: z.number().int().positive().default(25),
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
