import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { garufileJsonSchema } from "@garu/kernel";
import { garufileMarkdown } from "./garufile-doc.js";
import { setLocale } from "./i18n.js";
import { es } from "./i18n/es.js";

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, "..", "..", "..", "docs");

describe("the Garufile reference", () => {
  afterEach(() => setLocale("en"));

  it("every key's line in the schema has its Spanish, so the twin says the same", () => {
    const missing: string[] = [];
    const walk = (n: Record<string, unknown>, path: string) => {
      if (typeof n["description"] === "string" && path && !(n["description"] in es)) missing.push(`${path}: ${n["description"].slice(0, 50)}`);
      for (const [k, v] of Object.entries(n)) if (v && typeof v === "object") walk(v as Record<string, unknown>, path ? `${path}.${k}` : k);
    };
    walk(garufileJsonSchema() as Record<string, unknown>, "");
    expect(missing).toEqual([]);
  });

  it("is what docs/garufile.md and docs/garufile.es.md hold (garu schema --markdown rewrites them)", () => {
    expect(readFileSync(join(docs, "garufile.md"), "utf8")).toBe(garufileMarkdown({ label: "En español", file: "garufile.es.md" }));
    setLocale("es");
    const esDoc = garufileMarkdown({ label: "In English", file: "garufile.md" });
    expect(esDoc).toContain("# El Garufile");
    expect(esDoc).not.toMatch(/\| `name` \| text \|/);
    expect(readFileSync(join(docs, "garufile.es.md"), "utf8")).toBe(esDoc);
  });
});
