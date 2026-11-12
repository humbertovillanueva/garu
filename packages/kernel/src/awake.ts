import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";

/**
 * Keeps this machine from idling into sleep while a run is in progress. A laptop set to sleep after
 * a minute opens its eyes for a couple of seconds every quarter hour; a run that starts in one of
 * those windows would otherwise freeze mid-step and finish hours later, with its network calls timed
 * out and its hour-long access tokens gone stale. macOS only (`caffeinate`); elsewhere a no-op.
 * `-i` holds off idle sleep; `-s` also holds a dark wake open, which macOS honours on power only,
 * so a run that fires while a plugged-in Mac is napping keeps it up. The hold ends with the run,
 * and with this process if it dies first (`-w`).
 */
export function holdAwake(opts: { platform?: string; spawn?: typeof nodeSpawn } = {}): () => void {
  if ((opts.platform ?? process.platform) !== "darwin") return () => {};
  let child: ChildProcess | undefined;
  try {
    child = (opts.spawn ?? nodeSpawn)("caffeinate", ["-i", "-s", "-w", String(process.pid)], { stdio: "ignore" });
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

/**
 * Notices when this machine sleeps during a run. A timer can't fire while the machine is asleep, so a
 * tick that arrives long after it was due means the time in between was spent asleep: a closed lid, a
 * battery nap. `onSlept` gets each such stretch once it's over, with when it began and how long it
 * lasted, so the flight recorder can say why a step took an hour. Hiccups shorter than `thresholdMs`
 * (a busy machine, a slow disk) are ignored.
 */
export function watchSleep(
  onSlept: (slept: { since: Date; ms: number }) => void,
  opts: { tickMs?: number; thresholdMs?: number; now?: () => number } = {},
): () => void {
  const tickMs = opts.tickMs ?? 5_000;
  const thresholdMs = opts.thresholdMs ?? 30_000;
  const now = opts.now ?? Date.now;
  let last = now();
  let timer: NodeJS.Timeout | undefined;
  const tick = () => {
    const t = now();
    const lost = t - last - tickMs;
    if (lost >= thresholdMs) onSlept({ since: new Date(last), ms: lost });
    last = t;
    timer = setTimeout(tick, tickMs);
    timer.unref();
  };
  timer = setTimeout(tick, tickMs);
  timer.unref();
  return () => clearTimeout(timer);
}
