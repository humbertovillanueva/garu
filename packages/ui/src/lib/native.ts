/**
 * The native side of the phone app, behind one small door. In a browser every
 * function here is a no-op; in the app (Capacitor) they load the plugin on first
 * use, so the browser build never ships native code.
 */
import { isApp } from "./server.svelte";
import { prefs } from "./prefs.svelte";

/** Whether this webview can scan a QR code itself: Android's can (BarcodeDetector), an iPhone's can't. */
export const canScan = typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);
/** An iPhone or iPad: the app can't scan there, so the screens say to scan with the phone's own camera (the code made for the app opens it) or paste the link. */
export const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

type Hap = typeof import("@capacitor/haptics");
let haptics: Promise<Hap> | null = null;
const loadHaptics = () => (haptics ??= import("@capacitor/haptics"));

/** A small physical confirmation. success = approve, warning = decline, light = a tap that did something. */
export async function haptic(kind: "success" | "warning" | "light" = "light"): Promise<void> {
  if (!isApp || !prefs.haptics) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await loadHaptics();
    if (kind === "light") await Haptics.impact({ style: ImpactStyle.Light });
    else await Haptics.notification({ type: kind === "success" ? NotificationType.Success : NotificationType.Warning });
  } catch { /* no vibrator, or a browser pretending */ }
}

/**
 * Wire the app to the phone: status bar in our colours, the back gesture walks
 * our own history instead of closing the app, `onResume` fires when the app
 * comes back to the front (to reconnect and refresh), and `onLink` gets every
 * link the phone opens the app with (a `garu://pair` code read by the camera),
 * whether the app was running or the link started it.
 */
/** Screens that handle Android's back gesture themselves (the intro steps back a slide). Return true when handled. */
export const backHandlers: (() => boolean)[] = [];

export async function setupNative(onResume: () => void, onLink: (url: string) => void): Promise<void> {
  if (!isApp) return;
  // The status bar's style and color follow the theme: lib/theme.svelte.ts sets them.
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", ({ canGoBack }) => {
      for (let k = backHandlers.length - 1; k >= 0; k--) if (backHandlers[k]!()) return;
      const atRoot = !location.hash || location.hash === "#/" || location.hash === "#/home";
      if (!atRoot && canGoBack) history.back();
      else void App.minimizeApp();
    });
    await App.addListener("appStateChange", ({ isActive }) => { if (isActive) onResume(); });
    // The link carries the token: it goes to the handler and nowhere else (not the location, not a log).
    await App.addListener("appUrlOpen", ({ url }) => onLink(url));
  } catch { /* plugin missing */ }
}
