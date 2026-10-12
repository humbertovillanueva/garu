import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { es } from "./i18n/es";

/** Every `t("…")` in the app, so a sentence without Spanish fails here instead of showing up in English on a Spanish phone. */
function keysIn(dir: string, out = new Set<string>()): Set<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "i18n") keysIn(p, out); continue; }
    if (!/\.(svelte|ts)$/.test(name) || name.endsWith(".test.ts")) continue;
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) out.add(m[1]!.replace(/\\"/g, '"').replace(/\\n/g, "\n"));
  }
  return out;
}

describe("Spanish", () => {
  it("every sentence the app shows has a translation", () => {
    const keys = [...keysIn(join(import.meta.dirname, ".."))].sort();
    expect(keys.length).toBeGreaterThan(50);
    const missing = keys.filter((k) => !(k in es));
    expect(missing, `missing in es.ts:\n${missing.join("\n")}`).toEqual([]);
  });
  it("keeps every placeholder", () => {
    const bad = Object.entries(es).filter(([k, v]) => { const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(","); return ph(k) !== ph(v); }).map(([k]) => k);
    expect(bad).toEqual([]);
  });
  it("has no stale entries", () => {
    const keys = keysIn(join(import.meta.dirname, ".."));
    expect(Object.keys(es).filter((k) => !keys.has(k))).toEqual([]);
  });
});
