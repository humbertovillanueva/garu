#!/usr/bin/env node
// The README's screenshots, retaken from a seeded control room: five desktop screens at 1456×829 in
// the dark theme, and the phone's Inbox at 375×812 (2×). Driven through Chrome's DevTools, the way
// play-shots.mjs is, because the page keeps a live stream open and a one-shot headless capture never
// sees it settle.
//
//   node scripts/readme-shots.mjs --server http://127.0.0.1:4199 --run tomay/20261113-140001-37d8cb7b
//
// The server is a seeded copy (scripts/demo-data.mjs) served by `garu ui --demo --as Humberto`, reached
// over loopback so no token is needed; run both it and this script under the same TZ (a morning one reads best). Nothing on the server is changed: the screens are only read.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SERVER = arg("server", "http://127.0.0.1:4199");
const RUN = arg("run", "");
const OUT = arg("out", "docs/screenshots");
const TZ = arg("tz", "");
const CHROME = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const PORT = 9335;
if (!RUN) {
  console.error("--run <agent>/<runId> is required (the run shown on run.png)");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiting = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.waiting.has(msg.id)) {
        const { resolve, reject } = this.waiting.get(msg.id);
        this.waiting.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? "evaluate failed");
    return r.result.value;
  }
  async settled(timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      // A run's page has no h1 (its header is the agent's name as a link), so readiness is: loaded, no skeleton, something on screen.
      const ok = await this.eval(`document.readyState === "complete" && !document.querySelector(".skel") && !/Loading/.test(document.body.innerText) && document.body.innerText.trim().length > 40`).catch(() => false);
      if (ok) { await sleep(1500); return; }
      await sleep(250);
    }
    throw new Error("the page did not settle");
  }
  async shot() {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(r.data, "base64");
  }
}

const SCREENS = [
  // Home is taller: the greeting, what needs you and the latest cards all fit.
  ["home", "#/home", { width: 1456, height: 1040, deviceScaleFactor: 1, mobile: false }],
  ["inbox", "#/inbox", { width: 1456, height: 829, deviceScaleFactor: 1, mobile: false }],
  ["agent", "#/agent/tomay", { width: 1456, height: 829, deviceScaleFactor: 1, mobile: false }],
  ["run", `#/run/${RUN}`, { width: 1456, height: 829, deviceScaleFactor: 1, mobile: false }],
  ["cost", "#/cost", { width: 1456, height: 829, deviceScaleFactor: 1, mobile: false }],
  ["phone-approve", "#/inbox", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }],
];

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "garu-readme-shots-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "about:blank"], { stdio: "ignore" });
  try {
    let wsUrl = "";
    for (let i = 0; i < 40 && !wsUrl; i++) {
      await sleep(250);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        wsUrl = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
      } catch { /* not up yet */ }
    }
    if (!wsUrl) throw new Error("Chrome did not open its debugging port");
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("could not reach Chrome")); });
    const page = new Page(ws);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    if (TZ) await page.send("Emulation.setTimezoneOverride", { timezoneId: TZ });
    await page.send("Emulation.setDeviceMetricsOverride", SCREENS[0][2]);
    await page.send("Page.navigate", { url: `${SERVER}/` });
    await sleep(2000);
    // Dark, intro seen, English: the README's language.
    await page.eval(`(() => {
      localStorage.setItem("garu.prefs", JSON.stringify({ haptics: true, landOnInbox: false, theme: "dark", language: "en" }));
      localStorage.setItem("garu.intro", "1");
      location.reload();
    })()`);
    await sleep(1500);
    await page.settled();
    for (const [name, hash, metrics] of SCREENS) {
      await page.send("Emulation.setDeviceMetricsOverride", metrics);
      await page.eval(`(() => { location.hash = ${JSON.stringify(hash)}; window.scrollTo(0, 0); })()`);
      await sleep(2000);
      await page.settled();
      if (name === "run") {
        // The run page leads with what the run produced; the README's picture is the timeline, so open it and scroll to it.
        await page.eval(`(() => { const d = document.querySelector("details"); if (d && !d.open) d.querySelector("summary")?.click(); d?.scrollIntoView({ block: "start" }); })()`).catch(() => {});
        await sleep(800);
      }
      // The demo banner is the demo's, not the app's; the server is run with --demo so nothing reads "needs setup".
      await page.eval(`document.querySelectorAll(".offline").forEach((e) => e.remove())`).catch(() => {});
      // The sidebar names the folder served; a seeded copy lives in a temp dir, and the README shows the usual one.
      await page.eval(`(() => { const el = document.querySelector("aside .mono[title]"); if (el) el.textContent = "~/garu"; })()`).catch(() => {});
      await sleep(500);
      writeFileSync(join(OUT, `${name}.png`), await page.shot());
      console.log(`captured ${name}`);
    }
    ws.close();
  } finally {
    chrome.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still be closing it */ }
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
