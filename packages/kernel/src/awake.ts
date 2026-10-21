import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";

/**
 * Keeps this machine from idling into sleep while a run is in progress. A laptop set to sleep after
 * a minute opens its eyes for a couple of seconds every quarter hour; a run that starts in one of
 * those windows would otherwise freeze mid-step and finish hours later, with its network calls timed
 * out and its hour-long access tokens gone stale. macOS only (`caffeinate`); elsewhere a no-op.
 * The hold ends with the run, and with this process if it dies first (`-w`).
 */
export function holdAwake(opts: { platform?: string; spawn?: typeof nodeSpawn } = {}): () => void {
  if ((opts.platform ?? process.platform) !== "darwin") return () => {};
  let child: ChildProcess | undefined;
  try {
    child = (opts.spawn ?? nodeSpawn)("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
    // No caffeinate (an unusual Mac): the run goes on without the hold.
    child.on("error", () => (child = undefined));
  } catch {
    return () => {};
  }
  return () => {
    try {
      child?.kill();
    } catch {
      /* already gone */
    }
  };
}
