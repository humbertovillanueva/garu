import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGarufile } from "@garu/kernel";

/** Every Garufile the repo ships, both editions: a typo fails the build here instead of the 8 AM run. */
const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function garufiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== "node_modules" && !f.startsWith(".")) garufiles(p, out); }
    else if (/^Garufile(\.[a-z]{2})?\.yaml$/.test(f)) out.push(p);
  }
  return out;
}

describe("the Garufiles the repo ships", () => {
  const files = [...garufiles(join(repo, "agents")), ...garufiles(join(repo, "examples"))];
  it("are there, in both editions", () => {
    expect(files.length).toBeGreaterThanOrEqual(16);
    const names = new Set(files.map((f) => f.split("/").at(-1)));
    expect(names.has("Garufile.yaml") && names.has("Garufile.es.yaml")).toBe(true);
  });
  for (const f of files) {
    it(`parses ${f.slice(repo.length + 1)}`, () => {
      const g = parseGarufile(readFileSync(f, "utf8"), f);
      expect(g.name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(g.policy.length).toBeGreaterThan(0);
      // the Spanish edition is the same agent in the same folder
      if (f.endsWith(".es.yaml")) expect(parseGarufile(readFileSync(f.replace(".es.yaml", ".yaml"), "utf8")).name).toBe(g.name);
    });
  }
});
