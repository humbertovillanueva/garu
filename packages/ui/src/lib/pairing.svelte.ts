/**
 * Pairing this phone with a control room: one action, whichever way the link
 * arrived (scanned, pasted, or opened from the phone's camera through the
 * `garu://pair` scheme). The Pair screen calls `pair` for what happens on it;
 * `openedLink` is for links handed to the app from outside, and leaves its
 * state here so the Pair screen can show it.
 */
import { connectLive, live } from "./api.svelte";
import { remember } from "./server.svelte";
import { parsePairing, pointsAtThisComputer } from "./pairlink";
import { href } from "./router.svelte";
import { haptic } from "./native";
import { t } from "./i18n.svelte";

export const pairing = $state({ busy: false, error: null as string | null });

/** Connect to the control room a link names. Resolves to null once paired, else the sentence to show. */
export async function pair(input: string, demo = false): Promise<string | null> {
  const p = parsePairing(input);
  if (!p) return t("That doesn't look like a Garu sign-in link. It should start with https:// and contain ?token=…");
  if (pointsAtThisComputer(p.base)) return t("This code points at the computer itself, which a phone can't reach. Garu has to be shared over Tailscale first; that needs setup on your computer (Settings → Your phone & other devices shows how).");
  pairing.busy = true;
  try {
    const res = await fetch(`${p.base}/api/agents`, { headers: { authorization: `Bearer ${p.token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (res.status === 401) return t("The control room answered, but the token is not right. Get a fresh code on your computer: Settings → Your phone & other devices.");
    if (!res.ok) return t("The control room had a problem answering. Try again in a moment.");
    remember(p.base, p.token);
    live.signIn = false;
    void connectLive(true).catch(() => {});
    void haptic("success");
    return null;
  } catch {
    return demo ? t("The demo isn't reachable right now. Try again in a little while.") : t("Couldn't reach {host}. Is Tailscale on for this phone, and is Garu running on your computer?", { host: p.base.replace(/^https?:\/\//, "") });
  } finally {
    pairing.busy = false;
  }
}

/** A link the phone handed to the app (the camera read a `garu://pair` code). Anything else is ignored. */
export async function openedLink(url: string): Promise<void> {
  if (!parsePairing(url)) return;
  pairing.error = null;
  pairing.error = await pair(url);
  if (!pairing.error) location.hash = href("home");
}
