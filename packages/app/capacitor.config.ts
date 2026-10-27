import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Garu for your phone. The web UI is built with GARU_APP=1 (packages/ui/dist-app)
 * so it pairs with a control room instead of assuming it was served by one.
 */
const config: CapacitorConfig = {
  appId: "io.github.humbertovillanueva.garu",
  appName: "Garu",
  webDir: "../ui/dist-app",
  // The app's own origin is https://localhost; the control room allows exactly that for CORS.
  server: { androidScheme: "https" },
  // The bridge would print every event it hands the page, and the pairing link arrives as one with the
  // token in it; so no bridge logging, in debug builds too. Chrome's and Safari's inspectors still work.
  loggingBehavior: "none",
  android: { allowMixedContent: false, backgroundColor: "#0a0c0f" },
};

export default config;
