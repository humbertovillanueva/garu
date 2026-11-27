/**
 * The Garufile as a JSON Schema, for editors: VS Code's YAML extension validates a file and completes its
 * keys from it, with each key's one line. Written by `garu schema` into docs/garufile.schema.json, which the
 * site serves; a Garufile points at it with `# yaml-language-server: $schema=…` on its first line.
 */
import { z } from "zod";
import { Garufile } from "./garufile.js";

export const SCHEMA_URL = "https://garuagents.com/garufile.schema.json";

export function garufileJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(Garufile, { io: "input", unrepresentable: "any", target: "draft-7" }) as Record<string, unknown>;
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: SCHEMA_URL,
    title: "Garufile",
    description: "One Garu agent: what it does, when it runs, which tools it gets and what it may do with them. https://garuagents.com",
    ...schema,
  };
}
