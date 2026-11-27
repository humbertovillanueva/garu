import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { garufileJsonSchema } from "./schema.js";

describe("the Garufile as a JSON Schema", () => {
  const s = garufileJsonSchema() as { properties: Record<string, { description?: string }>; required?: string[] };
  it("names every key with its line, and what a file must have", () => {
    for (const k of ["name", "description", "language", "memory", "paused", "persona", "model", "prompt", "tools", "triggers", "policy", "maxTurns", "budget", "modelOptions", "sandbox"]) {
      expect(s.properties[k]?.description, k).toBeTruthy();
    }
    expect(s.required).toEqual(["name", "model", "prompt"]);
    expect(JSON.stringify(s)).toContain('"enum":["allow","ask","block"]');
  });
  it("is what docs/garufile.schema.json holds (garu schema docs/garufile.schema.json rewrites it)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const published = JSON.parse(readFileSync(join(here, "..", "..", "..", "docs", "garufile.schema.json"), "utf8")) as unknown;
    expect(published).toEqual(garufileJsonSchema());
  });
});
