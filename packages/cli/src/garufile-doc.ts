/**
 * The Garufile reference, written from the JSON Schema so it can't drift: every key, its type, its default
 * and its one line, section by section. `garu schema --markdown docs/garufile.md` writes it; under
 * GARU_LANG=es the same walk writes the Spanish twin, every sentence through the Spanish table.
 */
import { garufileJsonSchema, SCHEMA_URL } from "@garu/kernel";
import { t } from "./i18n.js";

interface Node {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, Node>;
  required?: string[];
  items?: Node;
  anyOf?: Node[];
  additionalProperties?: Node | Record<string, never>;
  pattern?: string;
  minimum?: number;
}

const typeOf = (n: Node): string => {
  if (n.enum) return n.enum.map((v) => `\`${String(v)}\``).join(" · ");
  if (n.type === "array") return n.items?.anyOf ? t("list") : n.items?.type === "object" ? t("list") : t("list of {kind}", { kind: typeOf(n.items ?? {}) });
  if (n.type === "object") return n.properties ? t("object") : t("map");
  if (n.type === "integer") return t("whole number");
  if (n.type === "number") return t("number");
  if (n.type === "boolean") return t("true / false");
  if (n.type === "string") return t("text");
  return t("any value");
};

const defaultOf = (n: Node, required: boolean): string => {
  if (required) return t("required");
  if (n.default === undefined) return "";
  const d = JSON.stringify(n.default);
  return d === "[]" || d === "{}" ? t("none") : `\`${d}\``;
};

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function table(node: Node): string[] {
  const out = [`| ${t("Key")} | ${t("Type")} | ${t("Default")} | ${t("What it is")} |`, "|---|---|---|---|"];
  const req = new Set(node.required ?? []);
  for (const [key, n] of Object.entries(node.properties ?? {})) {
    out.push(`| \`${key}\` | ${typeOf(n)} | ${defaultOf(n, req.has(key))} | ${esc(n.description ? t(n.description) : "")} |`);
  }
  return out;
}

export function garufileMarkdown(other: { label: string; file: string }): string {
  const s = garufileJsonSchema() as unknown as Node;
  const p = s.properties!;
  const tools = p["tools"]!.items!.anyOf!;
  const sections: { title: string; intro?: string; node: Node }[] = [
    { title: t("Top level"), intro: t("What every Garufile has. `name`, `model` and `prompt` are required; everything else has a default."), node: s },
    { title: "`persona`", intro: t("Its face and one line of character. What it may do is the policy, not the persona."), node: p["persona"]! },
    { title: t("`tools`: a server that runs on your computer"), intro: t("A program Garu starts (and can sandbox). With `auth: oauth`, Garu signs in for it once and hands it a short-lived access token at the start of each run; the server never sees the secret."), node: tools[0]! },
    { title: t("`tools`: a server you connect to"), intro: t("A URL that speaks MCP over Streamable HTTP. Headers carry keys from `.env`; `auth: oauth` keeps the sign-in from `garu auth`. Nothing runs locally, so the sandbox does not apply."), node: tools[1]! },
    { title: "`oauth`", intro: t("Your own OAuth client, for a server that does not hand one out (Google, for one). Values may be `${VAR}` from `.env`, so no secret sits in the file."), node: tools[0]!.properties!["oauth"]! },
    { title: t("`triggers`: one of"), intro: t("When it runs. A trigger has one of these; an agent can have several."), node: p["triggers"]!.items! },
    { title: t("`policy`: a rule"), intro: t("Rules are read top to bottom; the first whose tool glob and conditions match a call decides it. A call no rule matches asks you. A tool no rule can ever allow is not shown to the model."), node: p["policy"]!.items! },
    { title: t("`when`: a condition"), intro: t("Keyed by a dotted path into the call's arguments (`to`, `recipients.length`); every condition must hold for the rule to match."), node: (p["policy"]!.items!.properties!["when"]!.additionalProperties as Node) },
    { title: "`budget`", intro: t("The money guard. Every always-on agent should have a cap per run."), node: p["budget"]! },
    { title: "`budget.pricing`", node: p["budget"]!.properties!["pricing"]! },
    { title: "`sandbox`", intro: t("Set it (even to `{}`) to run every tool server inside its own Docker container. `garu sandbox build` makes the default image."), node: p["sandbox"]! },
    { title: "`sandbox.mounts`", node: p["sandbox"]!.properties!["mounts"]!.items! },
  ];
  const out: string[] = [];
  out.push(`*${other.label}: [${other.file}](${other.file})*`, "");
  out.push(`# ${t("The Garufile")}`, "");
  out.push(t("One agent is one YAML file: what it does, when it runs, which tools it gets and what it may do with them. This page is written from the schema itself, so it says exactly what Garu accepts. An editor can check a file as you type: the schema is at {url}, and a Garufile points at it with this first line:", { url: SCHEMA_URL }), "");
  out.push("```yaml", `# yaml-language-server: $schema=${SCHEMA_URL}`, "```", "");
  out.push(t("A `${VAR}` anywhere in `tools` is read from `.env` at run time, so keys never sit in the file."), "");
  for (const sec of sections) {
    out.push(`## ${sec.title}`, "");
    if (sec.intro) out.push(sec.intro, "");
    out.push(...table(sec.node), "");
  }
  out.push(t("`garu validate <Garufile>` lints a file; `garu try <agent> <server.tool>` says what its rules would do with a call; `garu new` writes one from a few questions, and so does \"New agent\" in the control room."));
  return out.join("\n") + "\n";
}
