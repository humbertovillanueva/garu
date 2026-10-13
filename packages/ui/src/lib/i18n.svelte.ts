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
export const siteUrl = (): string => (locale() === "es" ? "https://humbertovillanueva.github.io/garu/index.es.html" : "https://humbertovillanueva.github.io/garu/");

export function t(key: string, vars?: Record<string, string | number>): string {
  const text = locale() === "es" ? (es[key] ?? key) : key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}
