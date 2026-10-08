<script lang="ts">
  /** What this control room is running on: keys present (never their values), sign-ins, schedules, links. */
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import Icon from "../lib/components/Icon.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import type { Settings } from "../lib/types";
  import QRCode from "qrcode";
  import { build, forget, isApp, markIntroSeen, server } from "../lib/server.svelte";
  function unpair() {
    if (!confirm("Forget this control room? You'll pair again by scanning a code on your computer.")) return;
    forget(); location.reload();
  }

  let s = $state<Settings | null>(null);
  let error = $state<string | null>(null);
  $effect(() => { live.tick; api.settings().then((v) => (s = v)).catch((e) => (error = (e as Error).message)); });
  const shortRoot = (p: string) => p.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");

  // Pairing: a sign-in link for this same address, as a QR code. Shown only when asked, since it is a key.
  let pairOpen = $state(false);
  let pairSvg = $state<string | null>(null);
  let pairLink = $state<string | null>(null);
  let showToken = $state(false);
  let copied = $state(false);
  const isLocalhost = $derived(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
  let rotated = $state(false);
  let pairToken = $state<string | null>(null);
  // Where the code points. Tailscale's address first when it is serving us; this page's own address is always an option.
  let options = $state<{ url: string; label: string }[]>([]);
  let chosen = $state<string>("");
  function setOptions(p: import("../lib/types").Pair) {
    const here = `${location.origin}/`;
    const list = p.addresses.map((a) => ({ url: a.url, label: a.via === "tailscale" ? "Tailscale" : new URL(a.url).host }));
    if (!list.some((o) => o.url === here)) list.push({ url: here, label: isLocalhost ? "this computer only" : "this address" });
    options = list;
    if (!options.some((o) => o.url === chosen)) chosen = options[0]!.url;
  }
  async function render() {
    if (!pairToken) return;
    pairLink = `${chosen}?token=${pairToken}`;
    pairSvg = await QRCode.toString(pairLink, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0c0f", light: "#f4f1ea" } });
  }
  async function openPair() {
    pairOpen = true;
    if (pairSvg) return;
    const p = await api.pair();
    pairToken = p.token; setOptions(p);
    await render();
  }
  async function choose(url: string) { chosen = url; await render(); }
  async function rotate() {
    if (!confirm("Make a new token? Every phone or computer signed in with the current one will have to scan again.")) return;
    showToken = false;
    const p = await api.rotateToken();
    pairToken = p.token; setOptions(p);
    await render();
    rotated = true; setTimeout(() => (rotated = false), 4000);
  }
  const chosenIsLocal = $derived(/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(chosen));
  async function copyLink() {
    if (!pairLink) return;
    try { await navigator.clipboard.writeText(pairLink); copied = true; setTimeout(() => (copied = false), 1500); } catch { showToken = true; }
  }
</script>

<section class="space-y-8">
  <div class="rise">
    <h1 class="text-[26px] font-semibold tracking-tight">Settings</h1>
    <p class="mt-1 text-[14px] text-fg-2">Everything here is read from your machine. Garu has no account and no cloud; the control room is a view over the files in <span class="mono">{s ? shortRoot(s.root) : "…"}</span>.</p>
  </div>

  {#if error}
    <div class="panel p-4 text-[13.5px]" style="color: var(--color-bad)">{error}</div>
  {:else if !s}
    <Skeleton rows={4} h={72} />
  {:else}
    <div class="grid gap-4 lg:grid-cols-2">
      <!-- This control room -->
      <div class="panel rise p-5">
        <div class="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-mute"><Icon name="spark" size={14} /> This control room</div>
        <dl class="grid grid-cols-[120px_1fr] gap-y-2 text-[13.5px]">
          <dt class="text-mute">Version</dt><dd class="mono">garu {s.version}</dd>
          <dt class="text-mute">{isApp ? "This app" : "This page"}</dt><dd class="mono text-[12.5px]">{build}</dd>
          <dt class="text-mute">Deciding as</dt><dd>{s.user} <span class="text-mute">· <span class="mono">--as</span> to change</span></dd>
          <dt class="text-mute">Schedules</dt>
          <dd class="flex items-center gap-2"><span class="dot" style="background: {s.up ? 'var(--color-ok)' : 'var(--color-mute)'}"></span>{s.up ? "running in this process" : "not running"}{#if !s.up}<span class="text-mute"> · start with <span class="mono">garu ui --up</span></span>{/if}</dd>
          <dt class="text-mute">Listening on</dt><dd class="mono">{s.host}:{s.port}{#if s.host !== "127.0.0.1" && s.host !== "localhost"}<span class="ml-2 text-[12px] text-mute">reachable on this network · token required</span>{/if}</dd>
          <dt class="text-mute">Unanswered asks</dt><dd>denied after {s.askTimeoutMin} min <span class="text-mute">· <span class="mono">--ask-timeout</span></span></dd>
          <dt class="text-mute">Push</dt><dd>{s.notify ? "on (ntfy)" : "off"} <span class="text-mute">· <span class="mono">--notify https://ntfy.sh/your-topic</span></span></dd>
          <dt class="text-mute">Folder</dt><dd class="mono break-all">{s.root}</dd>
        </dl>
      </div>

      <!-- Your phone -->
      <div class="panel rise p-5">
        <div class="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-mute"><Icon name="key" size={14} /> Your phone &amp; other devices</div>
        {#if isApp}
          <p class="text-[13px] text-fg-2">This phone is paired with <span class="mono">{server.base.replace(/^https?:\/\//, "")}</span>. <button class="text-fg-2 underline hover:text-fg" onclick={unpair}>Forget it</button></p>
          <p class="mt-2 text-[12.5px] text-mute">To pair another device, open Garu on your computer and show the sign-in code there. <button class="underline hover:text-fg" onclick={() => { markIntroSeen(false); location.hash = ""; location.reload(); }}>Show the intro again</button></p>
        {:else if s.login.direct}
          <p class="text-[13px] text-fg-2">This browser is on the same computer as Garu, so it is signed in automatically. Anything else needs the token.</p>
        {:else}
          <p class="text-[13px] text-fg-2">This device is signed in with the token. <button class="text-fg-2 underline hover:text-fg" onclick={() => api.logout()}>Sign out</button></p>
        {/if}
        {#if isApp}
          <!-- pairing happens from the computer -->
        {:else if !pairOpen}
          <button class="btn mt-3" onclick={openPair}>Show sign-in code</button>
        {:else if !pairSvg}
          <Skeleton rows={1} h={180} />
        {:else}
          {#if options.length > 1}
            <div class="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
              <span class="text-mute">Code points to</span>
              {#each options as o (o.url)}
                <button class="rounded-full border px-2.5 py-0.5 transition-colors" class:border-accent={chosen === o.url} class:text-fg={chosen === o.url} class:hairline={chosen !== o.url} class:text-mute={chosen !== o.url} onclick={() => choose(o.url)} title={o.url}>{o.label}</button>
              {/each}
            </div>
          {/if}
          <div class="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div class="qr w-[180px] flex-none rounded-xl p-2" style="background:#f4f1ea">{@html pairSvg}</div>
            <div class="min-w-0 flex-1 text-[13px] text-fg-2">
              {#if chosenIsLocal}
                <p style="color: var(--color-ask)">This code points at <span class="mono">{new URL(chosen).host}</span>, which a phone can't reach. Put the control room on your private network first: <span class="mono">tailscale serve --bg {s.port}</span> on this computer, then come back here and the code will point there by itself.</p>
              {:else}
                <p>Scan with your phone's camera. It opens <span class="mono">{new URL(chosen).host}</span> signed in — then <em>Add to Home Screen</em> to make it an app.</p>
              {/if}
              <p class="mt-2 text-[12px] text-mute">This code is a key. Anyone who scans it can approve actions as you.</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button class="btn" onclick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
                <button class="btn" onclick={() => (showToken = !showToken)}>{showToken ? "Hide token" : "Show token"}</button>
              </div>
              {#if showToken}<div class="mono mt-2 break-all rounded-lg border hairline bg-bg px-2.5 py-2 text-[12px] select-all">{pairLink?.split("token=")[1]}</div>{/if}
              <p class="mt-2 text-[12px] text-mute">Someone else saw it? <button class="underline hover:text-fg" onclick={rotate}>Make a new token</button>{#if rotated}<span class="ml-2" style="color: var(--color-ok)">done — other devices are signed out</span>{/if}. It lives in <span class="mono">{shortRoot(s.login.tokenPath)}</span>.</p>
            </div>
          </div>
        {/if}
      </div>

      <!-- Models -->
      <div class="panel rise p-5">
        <div class="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-mute"><Icon name="key" size={14} /> Models</div>
        <p class="mb-3 text-[13px] text-fg-2">Keys live in <span class="mono">.env</span>. Garu only reports whether each is set.</p>
        <ul class="space-y-2 text-[13.5px]">
          <li class="flex items-center gap-2"><span class="dot" style="background: {s.providers.gemini ? 'var(--color-ok)' : 'var(--color-line-2)'}"></span><span class="mono">GEMINI_API_KEY</span><span class="text-mute">{s.providers.gemini ? "set · gemini/*" : "not set · free at aistudio.google.com"}</span></li>
          <li class="flex items-center gap-2"><span class="dot" style="background: {s.providers.anthropic ? 'var(--color-ok)' : 'var(--color-line-2)'}"></span><span class="mono">ANTHROPIC_API_KEY</span><span class="text-mute">{s.providers.anthropic ? "set · anthropic/*" : "not set"}</span></li>
          <li class="flex items-center gap-2"><span class="dot" style="background: var(--color-ok)"></span><span class="mono">ollama/*</span><span class="text-mute">{s.providers.ollamaHost ? "custom OLLAMA_HOST" : "localhost:11434 · $0, needs Ollama running"}</span></li>
        </ul>
      </div>

      <!-- Variables agents need -->
      <div class="panel rise p-5">
        <div class="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-mute"><Icon name="shield" size={14} /> Variables your agents reference</div>
        {#if s.env.length === 0}
          <p class="text-[13px] text-mute">None. Agents reference secrets as <span class="mono">${"{VAR}"}</span> in their Garufile and Garu fills them from <span class="mono">.env</span> at run time.</p>
        {:else}
          <ul class="space-y-2 text-[13.5px]">
            {#each s.env as v (v.name)}
              <li class="flex items-center gap-2"><span class="dot" style="background: {v.set ? 'var(--color-ok)' : 'var(--color-ask)'}"></span><span class="mono">{v.name}</span><span class="text-mute">{v.set ? "set" : "missing — add it to .env"}</span></li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Remote servers -->
      <div class="panel rise p-5">
        <div class="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-mute"><Icon name="globe" size={14} /> Remote tool servers</div>
        {#if s.remotes.length === 0}
          <p class="text-[13px] text-mute">None yet. A tool server can be a <span class="mono">url:</span> instead of a <span class="mono">command:</span>; servers that want a login use <span class="mono">auth: oauth</span> and <span class="mono">garu auth</span>.</p>
        {:else}
          <ul class="space-y-2.5 text-[13.5px]">
            {#each s.remotes as r (r.agent + r.server)}
              <li>
                <div class="flex items-center gap-2">
                  <span class="dot" style="background: {r.signedIn === false ? 'var(--color-ask)' : 'var(--color-ok)'}"></span>
                  <a href={href("agent", r.agent)} class="font-medium hover:underline">{r.agent}</a><span class="text-mute">→</span><span class="mono">{r.server}</span>
                  <span class="ml-auto text-[12px] text-mute">{r.auth === "oauth" ? (r.signedIn ? "signed in" : "not signed in") : "headers from .env"}</span>
                </div>
                <div class="mono ml-4 truncate text-[11.5px] text-mute" title={r.url}>{r.url}</div>
                {#if r.signedIn === false}<div class="mono ml-4 mt-1 text-[12px]" style="color: var(--color-ask)">garu auth {r.source} {r.server}</div>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <div class="panel rise p-5">
      <div class="mb-3 text-[11px] uppercase tracking-wider text-mute">Learn more</div>
      <div class="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
        <a class="text-fg-2 hover:text-fg" href="https://humbertovillanueva.github.io/garu/" target="_blank" rel="noreferrer">Website ↗</a>
        <a class="text-fg-2 hover:text-fg" href="https://github.com/humbertovillanueva/garu#readme" target="_blank" rel="noreferrer">README ↗</a>
        <a class="text-fg-2 hover:text-fg" href="https://github.com/humbertovillanueva/garu/blob/main/docs/why.md" target="_blank" rel="noreferrer">Why Garu ↗</a>
        <a class="text-fg-2 hover:text-fg" href="https://github.com/humbertovillanueva/garu/blob/main/docs/phone.md" target="_blank" rel="noreferrer">On your phone ↗</a>
        <a class="text-fg-2 hover:text-fg" href="https://github.com/humbertovillanueva/garu/issues" target="_blank" rel="noreferrer">Report a problem ↗</a>
      </div>
    </div>
  {/if}
</section>

<style>
  .qr :global(svg) { display: block; width: 100%; height: auto; }
</style>
