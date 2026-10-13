import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { es } from "./i18n/es.js";
import { detectLocale, setLocale, t } from "./i18n.js";

/** Every `t("…")` in the CLI, so a sentence without Spanish fails here instead of showing up in English on a Spanish computer. */
function keysIn(dir: string, out = new Set<string>()): Set<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "i18n") keysIn(p, out); continue; }
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) out.add(m[1]!.replace(/\\"/g, '"').replace(/\\n/g, "\n"));
  }
  return out;
}

describe("the terminal in Spanish", () => {
  it("every sentence the CLI prints has a translation", () => {
    const keys = [...keysIn(import.meta.dirname)].sort();
    expect(keys.length).toBeGreaterThan(50);
    const missing = keys.filter((k) => !(k in es));
    expect(missing, `missing in es.ts:\n${missing.join("\n")}`).toEqual([]);
  });
  it("keeps every placeholder", () => {
    const bad = Object.entries(es).filter(([k, v]) => { const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(","); return ph(k) !== ph(v); }).map(([k]) => k);
    expect(bad).toEqual([]);
  });
  it("has no stale entries", () => {
    const keys = keysIn(import.meta.dirname);
    expect(Object.keys(es).filter((k) => !keys.has(k))).toEqual([]);
  });
  it("follows the computer's language, GARU_LANG first", () => {
    expect(detectLocale({})).toBe("en");
    expect(detectLocale({ LANG: "en_US.UTF-8" })).toBe("en");
    expect(detectLocale({ LANG: "es_MX.UTF-8" })).toBe("es");
    expect(detectLocale({ LANG: "es" })).toBe("es");
    expect(detectLocale({ LC_ALL: "es_ES.UTF-8", LANG: "en_US.UTF-8" })).toBe("es");
    expect(detectLocale({ GARU_LANG: "en", LANG: "es_MX.UTF-8" })).toBe("en");
    expect(detectLocale({ LANG: "estonian" })).toBe("en");
  });
  it("fills placeholders and falls back to the English key", () => {
    setLocale("en");
    expect(t("hello {name}", { name: "Ana" })).toBe("hello Ana");
    setLocale("es");
    expect(t("not a real key {n}", { n: 2 })).toBe("not a real key 2");
    setLocale("en");
  });
});
