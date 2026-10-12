/**
 * Dark or light. "auto" follows the device, and changes with it; Settings can pin either. The
 * tokens in app.css do the actual work: this sets `data-theme` on <html>, the browser chrome color,
 * and the app's status bar.
 */
import { prefs } from "./prefs.svelte";
import { isApp } from "./server.svelte";

const query = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null;
let deviceLight = $state(query?.matches ?? false);
query?.addEventListener("change", (e) => (deviceLight = e.matches));

export const BACKGROUND = { dark: "#0a0c0f", light: "#f5f4f0" } as const;

/** The theme in force right now. */
export function currentTheme(): "dark" | "light" {
  return prefs.theme === "auto" ? (deviceLight ? "light" : "dark") : prefs.theme;
}

export function applyTheme(): void {
  const t = currentTheme();
  document.documentElement.dataset["theme"] = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BACKGROUND[t]);
  if (!isApp) return;
  void import("@capacitor/status-bar")
    .then(async ({ StatusBar, Style }) => {
      await StatusBar.setStyle({ style: t === "light" ? Style.Light : Style.Dark });
      await StatusBar.setBackgroundColor({ color: BACKGROUND[t] }).catch(() => {});
    })
    .catch(() => { /* not on a phone */ });
}
