/**
 * Whether a phone can still reach this control room through Tailscale.
 *
 * Tailscale can stop on the Mac (an update, a crash, a sleep gone wrong) and nothing says so: the
 * phone shows a spinner, the demos go dark, and the owner finds out days later. The control room
 * remembers the address Tailscale served it on, in a small file beside the token, and the moment
 * that address is gone it counts as lost: a line in the log, one push, a notice on Home. When the
 * address is back, the notice goes. A computer that never had Tailscale has nothing to lose, and
 * never warns.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface ReachState {
  /** The last address Tailscale served this control room on. */
  url: string;
  lastSeenAt: string;
  /** When the address went missing; null while it is there. */
  lostAt: string | null;
}

export class Reach {
  private cached: ReachState | null | undefined;
  constructor(readonly file: string) {}

  state(): ReachState | null {
    if (this.cached !== undefined) return this.cached;
    try { this.cached = JSON.parse(readFileSync(this.file, "utf8")) as ReachState; } catch { this.cached = null; }
    return this.cached;
  }

  /** The outage in progress, if any. */
  lost(): { since: string; url: string } | null {
    const s = this.state();
    return s?.lostAt ? { since: s.lostAt, url: s.url } : null;
  }

  /**
   * Note what Tailscale answers right now. "lost" the first time a known address is gone, "back" when
   * it returns, null otherwise. The file is written only when something changed.
   */
  note(urls: readonly string[], now = new Date()): "lost" | "back" | null {
    const s = this.state();
    const url = urls[0];
    if (url) {
      const was = s?.lostAt ? "back" : null;
      // Seen again: remember it, but don't rewrite the file every half minute for the same address.
      if (!s || s.url !== url || s.lostAt || Date.parse(now.toISOString()) - Date.parse(s.lastSeenAt) > 10 * 60_000) this.write({ url, lastSeenAt: now.toISOString(), lostAt: null });
      return was;
    }
    if (!s || s.lostAt) return null;
    this.write({ ...s, lostAt: now.toISOString() });
    return "lost";
  }

  private write(s: ReachState): void {
    this.cached = s;
    try {
      if (!existsSync(dirname(this.file))) mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(s, null, 2) + "\n");
    } catch { /* best effort: the warning still works for this process */ }
  }
}
