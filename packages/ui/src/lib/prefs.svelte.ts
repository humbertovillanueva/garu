/** Phone-side preferences. They live on the phone, not on the control room, so each device keeps its own. */
const KEY = "garu.prefs";
export interface Prefs {
  /** A small vibration on approve, decline and send. */
  haptics: boolean;
  /** Opening the app with a decision waiting lands on the inbox. */
  landOnInbox: boolean;
}
const defaults: Prefs = { haptics: true, landOnInbox: true };
function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...defaults };
  } catch { return { ...defaults }; }
}
export const prefs = $state<Prefs>(load());
export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void {
  prefs[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage off */ }
}
