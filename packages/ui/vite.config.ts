import { defineConfig } from "vite";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// GARU_APP=1 builds the copy the phone app ships (packages/app): same UI, pairs with a remote control room.
const app = process.env["GARU_APP"] === "1";

// A build stamp you can read in Settings, so "is this the new one?" has an answer: version · short commit · build time.
const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;
let commit = "local";
try { commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* no git */ }
const stamp = `${version} · ${commit} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    // The stamp also goes into index.html, so the control room can tell a browser page which build it serves.
    { name: "garu-build-meta", transformIndexHtml: (html) => html.replace("<title>Garu</title>", `<meta name="garu-build" content="${stamp}" />\n    <title>Garu</title>`) },
  ],
  define: { "import.meta.env.VITE_GARU_APP": JSON.stringify(app ? "1" : "0"), "import.meta.env.VITE_GARU_BUILD": JSON.stringify(stamp) },
  build: { outDir: app ? "dist-app" : "dist", emptyOutDir: true, target: "es2022" },
  server: { proxy: { "/api": "http://127.0.0.1:4000" } },
});
