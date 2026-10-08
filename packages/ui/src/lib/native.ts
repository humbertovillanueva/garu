/**
 * The native side of the phone app, behind one small door. In a browser every
 * function here is a no-op; in the app (Capacitor) they load the plugin on first
 * use, so the browser build never ships native code.
 */
import { isApp } from "./server.svelte";

type Hap = typeof import("@capacitor/haptics");
let haptics: Promise<Hap> | null = null;
const loadHaptics = () => (haptics ??= import("@capacitor/haptics"));

/** A small physical confirmation. success = approve, warning = decline, light = a tap that did something. */
export async function haptic(kind: "success" | "warning" | "light" = "light"): Promise<void> {
  if (!isApp) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await loadHaptics();
    if (kind === "light") await Haptics.impact({ style: ImpactStyle.Light });
    else await Haptics.notification({ type: kind === "success" ? NotificationType.Success : NotificationType.Warning });
  } catch { /* no vibrator, or a browser pretending */ }
}

/**
 * Wire the app to the phone: status bar in our colours, the back gesture walks
 * our own history instead of closing the app, and `onResume` fires when the app
 * comes back to the front (to reconnect and refresh).
 */
export async function setupNative(onResume: () => void): Promise<void> {
  if (!isApp) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0a0c0f" }).catch(() => {});
  } catch { /* not on Android */ }
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", ({ canGoBack }) => {
      const atRoot = !location.hash || location.hash === "#/" || location.hash === "#/home";
      if (!atRoot && canGoBack) history.back();
      else void App.minimizeApp();
    });
    await App.addListener("appStateChange", ({ isActive }) => { if (isActive) onResume(); });
  } catch { /* plugin missing */ }
}
