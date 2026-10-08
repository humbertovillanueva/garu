import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// GARU_APP=1 builds the copy the phone app ships (packages/app): same UI, pairs with a remote control room.
const app = process.env["GARU_APP"] === "1";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  define: { "import.meta.env.VITE_GARU_APP": JSON.stringify(app ? "1" : "0") },
  build: { outDir: app ? "dist-app" : "dist", emptyOutDir: true, target: "es2022" },
  server: { proxy: { "/api": "http://127.0.0.1:4000" } },
});
