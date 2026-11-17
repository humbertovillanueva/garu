import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backupName, peekBackup, planBackup, restoreBackup, writeBackup } from "./backup.js";

function seed(root: string): void {
  for (const d of ["runs/bea", "inbox", "memory", "auth"]) mkdirSync(join(root, ".garu", d), { recursive: true });
  writeFileSync(join(root, ".garu", "runs", "bea", "r1.jsonl"), "{}\n");
  writeFileSync(join(root, ".garu", "runs", "bea", "r2.jsonl"), "{}\n");
  writeFileSync(join(root, ".garu", "inbox", "a1.json"), "{}");
  writeFileSync(join(root, ".garu", "memory", "bea.md"), "- 2026-11-17 · a note\n");
  writeFileSync(join(root, ".garu", "auth", "x.json"), "{}");
  writeFileSync(join(root, ".garu", "ui-token"), "tok");
  writeFileSync(join(root, ".garu", "ui.log"), "lots of log\n");
}

describe("garu backup and restore", () => {
  it("plans what goes in, leaves the log out, and the way back is exact", async () => {
    const root = mkdtempSync(join(tmpdir(), "garu-bk-"));
    seed(root);
    const plan = planBackup(root);
    expect(plan).toMatchObject({ entries: ["auth", "inbox", "memory", "runs", "ui-token"], runs: 2, requests: 1, notebooks: 1, signIns: 1 });
    expect(plan.bytes).toBeGreaterThan(0);
    const file = join(root, backupName(new Date(2026, 10, 17, 15, 30)));
    expect(file.endsWith("garu-backup-2026-11-17-1530.tgz")).toBe(true);
    await writeBackup(plan, file);
    expect(await peekBackup(file)).toEqual(["auth", "inbox", "memory", "runs", "ui-token"]);

    const other = mkdtempSync(join(tmpdir(), "garu-rs-"));
    expect(await restoreBackup(file, other)).toEqual({ movedAside: null });
    expect(readFileSync(join(other, ".garu", "memory", "bea.md"), "utf8")).toBe("- 2026-11-17 · a note\n");
    expect(readFileSync(join(other, ".garu", "ui-token"), "utf8")).toBe("tok");
    expect(existsSync(join(other, ".garu", "ui.log"))).toBe(false);

    // Restoring over a .garu moves the old one aside instead of deleting it.
    writeFileSync(join(other, ".garu", "memory", "bea.md"), "changed since\n");
    const { movedAside } = await restoreBackup(file, other, new Date(2026, 10, 18, 9, 0));
    expect(movedAside?.endsWith(".garu.before-restore-2026-11-18-0900")).toBe(true);
    expect(readFileSync(join(movedAside!, "memory", "bea.md"), "utf8")).toBe("changed since\n");
    expect(readFileSync(join(other, ".garu", "memory", "bea.md"), "utf8")).toBe("- 2026-11-17 · a note\n");
  });

  it("refuses a tarball that isn't a Garu backup, and a folder with no .garu", async () => {
    const root = mkdtempSync(join(tmpdir(), "garu-bk-"));
    expect(() => planBackup(root)).toThrow(/no \.garu/);
    mkdirSync(join(root, "other"));
    writeFileSync(join(root, "other", "a.txt"), "x");
    const { execFileSync } = await import("node:child_process");
    execFileSync("tar", ["-czf", join(root, "not-garu.tgz"), "-C", root, "other"]);
    await expect(peekBackup(join(root, "not-garu.tgz"))).rejects.toThrow(/not a Garu backup/);
  });
});
