#!/usr/bin/env node
// Store screenshots: the six phone screens, captured from the phone build of the UI paired to a
// seeded Garu, each framed under its caption. `--frame play` (the default) makes Google Play's
// 1080×1920 cards; `--frame ios` makes the App Store's 1320×2868 ones (the 6.9-inch iPhone size,
// which App Store Connect scales down for every smaller iPhone).
//
//   GARU_APP=1 npm run dev -w @garu/ui -- --port 5174          # the phone build, in a browser
//   node scripts/play-shots.mjs --server http://127.0.0.1:4101 --token … --lang es --out docs/launch/play/es
//   node scripts/play-shots.mjs --server http://127.0.0.1:4100 --token … --frame ios
//
// Needs Google Chrome. The server is a seeded control room (scripts/demo-data.mjs); reseed it first so
// the inbox has a fresh ask. Nothing on the server is changed: the screens are only read.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const APP = arg("app", "http://localhost:5174");
const SERVER = arg("server", "http://127.0.0.1:4101");
const TOKEN = arg("token", "");
const LANG = arg("lang", "en");
const FRAME = {
  // The card, and the phone it shows: Play's is a 390×844 phone at 3× in a 894-px frame; the App
  // Store's is the 6.9-inch iPhone (440×956 at 3× is exactly 1320×2868) in a 1094-px frame.
  play: { w: 1080, h: 1920, phone: [390, 844], title: [96, 88], sub: [300, 38, 60], frame: [93, 400, 894, 1560] },
  ios: { w: 1320, h: 2868, phone: [440, 956], title: [120, 108], sub: [372, 46, 80], frame: [113, 500, 1094, 2248] },
}[arg("frame", "play")];
if (!FRAME) {
  console.error("--frame must be play or ios");
  process.exit(2);
}
const OUT = arg("out", FRAME.w === 1080 ? `docs/launch/play/${LANG}` : `docs/launch/app-store/${LANG}`);
const CHROME = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const PORT = 9333;
if (!TOKEN) {
  console.error("--token is required (the control room's sign-in token)");
  process.exit(2);
}

const CAPTIONS = {
  en: {
    home: ["Your agents,\nat a glance", "What's waiting on you, what they did, what's next."],
    inbox: ["Approve\nwith one tap", "Every ask shows exactly what it is before you decide."],
    agent: ["Talk to\nan agent", "Its runs, its rules, and a thread with it."],
    agents: ["Each one is a file\nyou can read", "Who it is, when it runs, what it may touch."],
    cost: ["Every run has\na price tag", "To the fraction of a cent, with a cap per run."],
    pair: ["Pairs with your\nown computer", "No cloud, no account. It talks to the Garu you run."],
  },
  es: {
    home: ["Tus agentes,\nde un vistazo", "Qué espera por ti, qué hicieron, qué sigue."],
    inbox: ["Aprueba\ncon un toque", "Cada solicitud muestra qué es antes de que decidas."],
    agent: ["Habla\ncon un agente", "Sus ejecuciones, sus reglas y un hilo con él."],
    agents: ["Cada uno es un archivo\nque puedes leer", "Quién es, cuándo corre, qué puede tocar."],
    cost: ["Cada ejecución\ntiene su precio", "Al centavo exacto, con un tope por ejecución."],
    pair: ["Se empareja con\ntu propia computadora", "Sin nube ni cuenta. Habla con el Garu que tú ejecutas."],
  },
}[LANG];
if (!CAPTIONS) {
  console.error(`no captions for --lang ${LANG}`);
  process.exit(2);
}
const SCREENS = [
  ["home", "#/"],
  ["inbox", "#/inbox"],
  ["agent", "#/agent/tomay"],
  ["agents", "#/agents"],
  ["cost", "#/cost"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The smallest DevTools client that does the job: one page, numbered commands, events ignored. */
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
  /** Waits until the page says it is ready: an h1 on screen and nothing still loading. */
  async settled(timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const ok = await this.eval(`document.readyState === "complete" && !!document.querySelector("h1") && !/Cargando|Loading/.test(document.body.innerText)`).catch(() => false);
      if (ok) {
        await sleep(1500);
        return;
      }
      await sleep(250);
    }
    throw new Error("the page did not settle");
  }
  async shot() {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(r.data, "base64");
  }
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "garu-shots-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "about:blank"], { stdio: "ignore" });
  try {
    let wsUrl = "";
    for (let i = 0; i < 40 && !wsUrl; i++) {
      await sleep(250);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        wsUrl = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
      } catch {
        /* not up yet */
      }
    }
    if (!wsUrl) throw new Error("Chrome did not open its debugging port");
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("could not reach Chrome"));
    });
    const page = new Page(ws);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    if (FRAME.w === 1320) {
      // An iPhone's web view: no scanner of its own, so the pairing screen says to use the camera.
      await page.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "delete window.BarcodeDetector;" });
    }

    // A phone at 3×: sharper than, or exactly, the frame it ends up in.
    const phone = () => page.send("Emulation.setDeviceMetricsOverride", { width: FRAME.phone[0], height: FRAME.phone[1], deviceScaleFactor: 3, mobile: true });
    await phone();
    await page.send("Page.navigate", { url: `${APP}/` });
    await sleep(2000);
    // Paired to the server, Spanish or English pinned, dark, intro seen, home first.
    await page.eval(`(() => {
      localStorage.setItem("garu.server", JSON.stringify({ base: ${JSON.stringify(SERVER)}, token: ${JSON.stringify(TOKEN)} }));
      localStorage.setItem("garu.prefs", JSON.stringify({ haptics: true, landOnInbox: false, theme: "dark", language: ${JSON.stringify(LANG)} }));
      localStorage.setItem("garu.intro", "1");
      location.hash = "#/";
      location.reload();
    })()`);
    await sleep(1500);
    await page.settled();

    mkdirSync(OUT, { recursive: true });
    const raw = {};
    for (const [name, hash] of SCREENS) {
      await page.eval(`(() => { location.hash = ${JSON.stringify(hash)}; window.scrollTo(0, 0); })()`);
      await sleep(1800);
      // The demo banner is the demo's, not the app's.
      await page.eval(`document.querySelectorAll(".offline").forEach((e) => e.remove())`);
      raw[name] = await page.shot();
      console.log(`captured ${name}`);
    }
    // The pairing screen: what the app shows before it is paired.
    await page.eval(`(() => { localStorage.removeItem("garu.server"); location.hash = "#/"; location.reload(); })()`);
    await sleep(1500);
    await page.settled();
    raw.pair = await page.shot();
    console.log("captured pair");

    // The cards: caption on top, the phone screen in a rounded frame.
    const { w: W, h: H, title: [tTop, tSize], sub: [sTop, sSize, sSide], frame: [fLeft, fTop, fW, fH] } = FRAME;
    await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await page.send("Page.navigate", { url: "about:blank" });
    await sleep(500);
    const { frameTree } = await page.send("Page.getFrameTree");
    for (const name of Object.keys(raw)) {
      const [title, sub] = CAPTIONS[name];
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;width:${W}px;height:${H}px;background:#0b0d12;overflow:hidden;font-family:-apple-system,"SF Pro Display","Inter","Helvetica Neue",sans-serif;color:#e9edf3}
        .t{position:absolute;left:0;right:0;top:${tTop}px;text-align:center;font-size:${tSize}px;line-height:1.02;font-weight:700;letter-spacing:-0.025em;white-space:pre-line}
        .s{position:absolute;left:${sSide}px;right:${sSide}px;top:${sTop}px;text-align:center;font-size:${sSize}px;line-height:1.25;color:#aeb6c2}
        .f{position:absolute;left:${fLeft}px;top:${fTop}px;width:${fW}px;height:${fH}px;border-radius:${Math.round(fW * 0.05)}px;border:2px solid #2b303b;overflow:hidden;background:#0b0d12}
        .f img{display:block;width:100%}
      </style></head><body><div class="t">${title}</div><div class="s">${sub}</div><div class="f"><img src="data:image/png;base64,${raw[name].toString("base64")}"></div></body></html>`;
      await page.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
      for (let i = 0; i < 40 && !(await page.eval(`document.images[0]?.complete && document.fonts.status === "loaded"`)); i++) await sleep(100);
      await sleep(200);
      writeFileSync(join(OUT, `${name}.png`), await page.shot());
      console.log(`wrote ${join(OUT, `${name}.png`)}`);
    }
    ws.close();
  } finally {
    chrome.kill();
    // Chrome writes to its profile while it closes; the folder goes once it has gone.
    await new Promise((r) => chrome.once("exit", r));
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
