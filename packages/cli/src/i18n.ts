/**
 * The terminal in the reader's language. The English sentence is the key; the Spanish lives in
 * i18n/es.ts, and i18n.test.ts fails on a sentence without it. The language comes from the
 * environment once per process (GARU_LANG, else the usual LC_ALL / LC_MESSAGES / LANG), so a
 * computer set to Spanish gets Spanish without a flag.
 */
import { es } from "./i18n/es.js";

export type Locale = "en" | "es";

export function detectLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  const raw = env["GARU_LANG"] || env["LC_ALL"] || env["LC_MESSAGES"] || env["LANG"] || "";
  return /^es(?![a-z])/i.test(raw) ? "es" : "en";
}

let current: Locale = detectLocale();
export const locale = (): Locale => current;
/** For tests, and for a flag some day. */
export const setLocale = (l: Locale): void => { current = l; };

/** The sentence as the reader should see it; `{name}` placeholders are filled from `vars`. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const text = current === "es" ? (es[key] ?? key) : key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}
