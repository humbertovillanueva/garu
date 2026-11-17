/**
 * A notification on the computer's own screen when an ask lands, for the owner who is at the Mac
 * and not on the phone: macOS through osascript, Linux through notify-send when it is there. Best
 * effort, never throws, never in the demo; GARU_DESKTOP_NOTIFY=0 turns it off.
 */
import { execFile } from "node:child_process";

/** The command that shows one notification on this platform, or null where there is none. */
export function notificationCommand(title: string, body: string, platform: NodeJS.Platform = process.platform): { cmd: string; args: string[] } | null {
  // AppleScript strings take double quotes; a quote or a backslash inside is escaped, a newline becomes a space.
  const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r?\n/g, " ");
  if (platform === "darwin") return { cmd: "osascript", args: ["-e", `display notification "${q(body)}" with title "${q(title)}"`] };
  if (platform === "linux") return { cmd: "notify-send", args: ["--app-name=Garu", title, body] };
  return null;
}

export function desktopNotifyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["GARU_DESKTOP_NOTIFY"] !== "0";
}

/** Show it, and forget about the outcome: a missing notify-send or a declined permission must never touch a run. */
export function desktopNotify(title: string, body: string, run: typeof execFile = execFile): void {
  const c = notificationCommand(title, body);
  if (!c) return;
  try {
    run(c.cmd, c.args, { timeout: 5000 }, () => {});
  } catch {
    /* no such command */
  }
}
