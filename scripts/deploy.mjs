#!/usr/bin/env node
// One command after a change: build everything, then restart every Garu on this Mac that runs the
// repo's code: the login service for this folder, and each public demo (a sibling folder named
// garu-demo* with a .garu inside; they run packages/ through a symlink, so a build changes them too).
// A Garu that isn't installed as a service is skipped with a line, never an error: `npm run deploy`
// works on a fresh checkout as well as here.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(process.cwd());
const run = (cwd, args) => spawnSync("npm", args, { cwd, stdio: "inherit", env: process.env });

console.log("▶ build");
if (run(root, ["run", "build", "-s"]).status !== 0) {
  console.error("✖ build failed; nothing restarted");
  process.exit(1);
}

const restart = (cwd, what) => {
  const r = spawnSync("npm", ["run", "garu", "-s", "--", "service", "restart"], { cwd, encoding: "utf8", env: process.env });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  // `service restart` says "not installed" and exits 0 where there is no service: that is a skip, not a restart.
  if (r.status === 0 && !/not installed/.test(text)) console.log(`✔ ${what}: restarted`);
  else console.log(`· ${what}: not restarted (${text.split("\n").pop() || "no service here"})`);
};

restart(root, `this folder (${basename(root)})`);
// The demos live beside the real Garu, as docs/demo.md lays them out.
const home = homedir();
for (const name of readdirSync(home).filter((n) => /^garu-demo/.test(n)).sort()) {
  const dir = join(home, name);
  if (dir === root || !existsSync(join(dir, ".garu"))) continue;
  restart(dir, `the public demo (${name})`);
}
