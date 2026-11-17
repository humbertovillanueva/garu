/**
 * garu backup and restore: one tarball of .garu (runs, inbox, grants, notebooks, sign-ins, the token)
 * and the way back, for the day the laptop is replaced. The run logs are the bulk of it and the
 * service's own log is left out; a restore never overwrites a .garu that is there without --yes, and
 * even then the old one is moved aside, not deleted.
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync, renameSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
/** Left out of a backup: the service's log (big, and about this machine) and an old snapshot. */
const SKIP = new Set(["ui.log", "runs-snapshot.tgz"]);

export interface BackupPlan {
  root: string;
  /** Top-level entries of .garu that go in. */
  entries: string[];
  runs: number;
  requests: number;
  notebooks: number;
  signIns: number;
  bytes: number;
}

function sizeOf(p: string): number {
  const st = statSync(p);
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((n, f) => n + sizeOf(join(p, f)), 0);
}
function count(dir: string, ext: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((n, f) => {
    const p = join(dir, f);
    return n + (statSync(p).isDirectory() ? count(p, ext) : f.endsWith(ext) ? 1 : 0);
  }, 0);
}

/** What a backup of `root/.garu` would hold. */
export function planBackup(root: string): BackupPlan {
  const garu = join(root, ".garu");
  if (!existsSync(garu)) throw new Error(`no .garu under ${root}: nothing to back up`);
  const entries = readdirSync(garu).filter((f) => !SKIP.has(f)).sort();
  return {
    root,
    entries,
    runs: count(join(garu, "runs"), ".jsonl"),
    requests: count(join(garu, "inbox"), ".json"),
    notebooks: count(join(garu, "memory"), ".md"),
    signIns: count(join(garu, "auth"), ".json"),
    bytes: entries.reduce((n, f) => n + sizeOf(join(garu, f)), 0),
  };
}

/** The default file name: garu-backup-2026-11-17-1530.tgz in the folder. */
export function backupName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `garu-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.tgz`;
}

/** Write the tarball; the paths inside start with `.garu/`. */
export async function writeBackup(plan: BackupPlan, file: string): Promise<void> {
  await run("tar", ["-czf", resolve(file), "-C", plan.root, ...plan.entries.map((e) => join(".garu", e))]);
}

/** The top-level .garu entries a tarball holds, so a restore can say what it brings before it does. */
export async function peekBackup(file: string): Promise<string[]> {
  const { stdout } = await run("tar", ["-tzf", resolve(file)]);
  const tops = new Set<string>();
  for (const line of stdout.split("\n")) {
    const m = /^\.garu\/([^/]+)/.exec(line.trim());
    if (m) tops.add(m[1]!);
  }
  if (!tops.size) throw new Error(`${basename(file)} holds no .garu/: not a Garu backup`);
  return [...tops].sort();
}

/**
 * Put a backup's .garu under `root`. A .garu already there is moved to .garu.before-restore-<stamp>
 * first, never deleted; the caller decides whether that is allowed.
 */
export async function restoreBackup(file: string, root: string, now = new Date()): Promise<{ movedAside: string | null }> {
  const garu = join(root, ".garu");
  let movedAside: string | null = null;
  if (existsSync(garu)) {
    movedAside = join(dirname(garu), `.garu.before-restore-${backupName(now).slice("garu-backup-".length, -".tgz".length)}`);
    renameSync(garu, movedAside);
  }
  await run("tar", ["-xzf", resolve(file), "-C", root]);
  return { movedAside };
}
