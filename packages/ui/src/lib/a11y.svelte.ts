/** One polite live region for the whole app (App.svelte renders it): say it, and a screen reader reads it. */
export const announcer = $state({ text: "" });
let timer: ReturnType<typeof setTimeout> | undefined;
export function announce(text: string): void {
  announcer.text = "";
  clearTimeout(timer);
  timer = setTimeout(() => (announcer.text = text), 60);
}

/** Smooth scrolling, unless the person asked their device for less motion. */
export const scrollBehavior = (): ScrollBehavior =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
