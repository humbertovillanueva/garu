/**
 * The app's words, in English or Spanish. Every sentence a person reads goes through `t()`, with
 * the English as the key; `i18n/es.ts` holds the Spanish, and a test fails when a sentence has none.
 * The language follows the device unless Settings pins one.
 */
import { prefs } from "./prefs.svelte";
import { es } from "./i18n/es";

export type Locale = "en" | "es";
const fromDevice = (): Locale => (typeof navigator !== "undefined" && /^es\b/i.test(navigator.language) ? "es" : "en");
let deviceLocale = $state(fromDevice());
if (typeof addEventListener === "function") addEventListener("languagechange", () => (deviceLocale = fromDevice()));

/** The language in force right now. */
export function locale(): Locale {
  return prefs.language === "auto" ? deviceLocale : prefs.language;
}

/** For the date and time formatters: an explicit tag when a language is pinned, else whatever the device uses. */
export function dateLocale(): string | undefined {
  return prefs.language === "auto" ? undefined : prefs.language;
}

/** The sentence in the current language. `{name}` placeholders are filled from `vars`. */
/** The website in the reader's language; the Spanish page sits beside the English one. */
export const siteUrl = (): string => (locale() === "es" ? "https://garuagents.com/index.es.html" : "https://garuagents.com/");

export function t(key: string, vars?: Record<string, string | number>): string {
  const text = locale() === "es" ? (es[key] ?? key) : key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/**
 * A whole sentence in pieces, for one that carries a path, a command, a link or a name that needs
 * its own markup: the plain text between placeholders, and each `{name}` placeholder as its own
 * piece carrying its name. The component wraps the named pieces and prints the rest, so the
 * sentence stays one key (the test next door collects these keys like the ones given to t) and
 * the Spanish keeps its own word order.
 */
export function parts(key: string, vars: Record<string, string | number>): { text: string; name?: string }[] {
  const text = locale() === "es" ? (es[key] ?? key) : key;
  const out: { text: string; name?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    const k = m[1]!;
    if (!(k in vars)) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: String(vars[k]), name: k });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
