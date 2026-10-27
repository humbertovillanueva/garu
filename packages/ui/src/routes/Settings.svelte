<script lang="ts">
  /** What this control room is running on: keys present (never their values), sign-ins, schedules, links. */
  import { api, live, loader, errorText } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import Icon from "../lib/components/Icon.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import type { Settings } from "../lib/types";
  import QRCode from "qrcode";
  import { build, forget, isApp, markIntroSeen, server } from "../lib/server.svelte";
  import { prefs, setPref } from "../lib/prefs.svelte";
  import { buildText } from "../lib/format";
  import { haptic } from "../lib/native";
  import { t, parts } from "../lib/i18n.svelte";
  function unpair() {
    if (!confirm(t("Forget this control room? You'll pair again by scanning a code on your computer."))) return;
    forget(); location.reload();
  }

  let s = $state<Settings | null>(null);
  let error = $state<string | null>(null);
  const load = loader();
  $effect(() => { live.tick; load(api.settings(), (v) => { s = v; error = null; }, (m) => (error = m)); });
  const shortRoot = (p: string) => p.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");

  // Pairing: a sign-in link for this same address, as a QR code. Shown only when asked, since it is a key.
  let pairOpen = $state(false);
  let pairSvg = $state<string | null>(null);
  let pairError = $state<string | null>(null);
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
    if (!list.some((o) => o.url === here)) list.push({ url: here, label: isLocalhost ? t("this computer only") : t("this address") });
    options = list;
    if (!options.some((o) => o.url === chosen)) chosen = options[0]!.url;
  }
  async function render() {
    if (!pairToken) return;
    pairLink = `${chosen}?token=${pairToken}`;
    // A camera needs fixed contrast, so the code is always ink on paper whatever the theme; the two values come from the tokens.
    const css = getComputedStyle(document.documentElement);
    pairSvg = await QRCode.toString(pairLink, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: css.getPropertyValue("--color-ink").trim(), light: css.getPropertyValue("--color-paper").trim() } });
  }
  async function openPair() {
    pairOpen = true; pairError = null;
    if (pairSvg) return;
    try {
      const p = await api.pair();
      pairToken = p.token; setOptions(p);
      await render();
    } catch (e) { pairError = t("Couldn't make a pairing code: {error}", { error: errorText(e) }); pairOpen = false; }
  }
  async function choose(url: string) { chosen = url; await render(); }
  async function rotate() {
    if (!confirm(t("Make a new token? Every phone or computer signed in with the current one will have to scan again."))) return;
    showToken = false; pairError = null;
    try {
      const p = await api.rotateToken();
      pairToken = p.token; setOptions(p);
      await render();
      rotated = true; setTimeout(() => (rotated = false), 4000);
    } catch (e) { pairError = t("Couldn't make a new token: {error}. The old one still works.", { error: errorText(e) }); }
  }
  const chosenIsLocal = $derived(/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(chosen));
  async function copyLink() {
    if (!pairLink) return;
    try { await navigator.clipboard.writeText(pairLink); copied = true; setTimeout(() => (copied = false), 1500); } catch { showToken = true; }
  }
</script>

<section class="space-y-6">
  <div class="rise"><h1 class="title">{t("Settings")}</h1></div>

  <!-- This device, preferences and help render without the computer: a phone paired to an address that
       no longer answers must still be able to forget it, read Help or report the problem. -->
    <!-- This device: how it reaches Garu -->
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{isApp ? t("This phone") : t("This browser")}</h2>
      <div class="panel rise divide-y divide-line text-[14px]">
        {#if isApp}
          <div class="flex items-center gap-3 px-4 py-3"><span class="text-mute">{t("Paired with")}</span><span class="min-w-0 flex-1 truncate text-right">{server.base.replace(/^https?:\/\//, "")}</span></div>
        {:else if s?.login.direct}
          <div class="px-4 py-3 text-fg-2">{t("On the same computer as Garu, so it's signed in automatically. Anything else needs the pairing code.")}</div>
        {:else if s}
          <div class="flex items-center gap-3 px-4 py-3"><span class="text-mute">{t("Signed in")}</span><span class="flex-1 text-right">{t("with the pairing token")}</span></div>
        {/if}
        <div class="flex items-center gap-3 px-4 py-3"><span class="text-mute">{t("Connection")}</span><span class="flex flex-1 items-center justify-end gap-2"><span class="dot" style="background: {live.connected ? 'var(--color-ok)' : live.disconnectedAt ? 'var(--color-ask)' : 'var(--color-mute)'}"></span>{live.connected ? t("live") : live.disconnectedAt ? t("offline") : t("connecting")}</span></div>
        <div class="flex items-center gap-3 px-4 py-3"><span class="text-mute">{t("Schedules")}</span>{#if s}<span class="flex flex-1 items-center justify-end gap-2"><span class="dot" style="background: {s.up ? 'var(--color-ok)' : 'var(--color-mute)'}"></span>{s.up ? t("running") : t("off")}</span>{:else}<span class="flex-1 text-right text-mute">{error ? t("can't check right now") : t("checking…")}</span>{/if}</div>
        {#if isApp}
          <button class="card-hover w-full px-4 py-3 text-left" onclick={unpair}>{t("Forget this computer")}<span class="block text-[12.5px] text-mute">{t("You'll pair again by scanning a code there.")}</span></button>
        {:else if s && !s.login.direct}
          <button class="card-hover w-full px-4 py-3 text-left" onclick={() => api.logout()}>{t("Sign out")}</button>
        {/if}
      </div>
    </div>

    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("Appearance")}</h2>
      <div class="panel rise divide-y divide-line text-[14px]">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3">
          <span class="flex-1">{t("Theme")}</span>
          <div class="flex gap-1" role="radiogroup" aria-label={t("Theme")}>
            {#each [["auto", isApp ? t("Phone") : t("System")], ["dark", t("Dark")], ["light", t("Light")]] as const as [value, label] (value)}
              <button class="btn py-1 text-[12.5px]" class:btn-dim={prefs.theme !== value} role="radio" aria-checked={prefs.theme === value} onclick={() => setPref("theme", value)}>{label}</button>
            {/each}
          </div>
        </div>
        <!-- Language names stay in their own language, so a reader can always find theirs. -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3">
          <span class="flex-1">{t("Language")}</span>
          <div class="flex gap-1" role="radiogroup" aria-label={t("Language")}>
            {#each [["auto", isApp ? t("Phone") : t("System")], ["en", "English"], ["es", "Español"]] as const as [value, label] (value)}
              <button class="btn py-1 text-[12.5px]" class:btn-dim={prefs.language !== value} role="radio" aria-checked={prefs.language === value} onclick={() => setPref("language", value)}>{label}</button>
            {/each}
          </div>
        </div>
      </div>
    </div>

    {#if isApp}
      <div>
        <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("Preferences")}</h2>
        <div class="panel rise divide-y divide-line text-[14px]">
          <label class="flex items-center gap-3 px-4 py-3">
            <span class="flex-1">{t("Vibrate on approve, decline and send")}</span>
            <input type="checkbox" class="toggle" checked={prefs.haptics} onchange={(e) => { setPref("haptics", e.currentTarget.checked); void haptic("light"); }} />
          </label>
          <label class="flex items-center gap-3 px-4 py-3">
            <span class="flex-1">{t("Open on the inbox when something is waiting")}</span>
            <input type="checkbox" class="toggle" checked={prefs.landOnInbox} onchange={(e) => setPref("landOnInbox", e.currentTarget.checked)} />
          </label>
          <button class="card-hover w-full px-4 py-3 text-left" onclick={() => { markIntroSeen(false); location.hash = ""; location.reload(); }}>{t("Show the introduction again")}</button>
        </div>
      </div>
    {/if}

    <div>
      <div class="panel rise divide-y divide-line text-[14px]">
        <a class="card-hover flex items-center gap-3 px-4 py-3" href={href("help")}><span class="text-mute"><Icon name="help" size={18} /></span><span class="flex-1">{t("Help")}</span><span class="text-mute"><Icon name="chevron" size={16} /></span></a>
        <a class="card-hover flex items-center gap-3 px-4 py-3" href={href("about")}><span class="text-mute"><Icon name="info" size={18} /></span><span class="flex-1">{t("About Garu")}</span><span class="text-mute"><Icon name="chevron" size={16} /></span></a>
        <a class="card-hover flex items-center gap-3 px-4 py-3" href={href("report")}><span class="text-mute"><Icon name="flag" size={18} /></span><span class="flex-1">{t("Report a problem")}</span><span class="text-mute"><Icon name="chevron" size={16} /></span></a>
      </div>
    </div>

    {#if !isApp}
      <!-- Pairing a phone happens from the computer -->
      <div>
        <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("Your phone & other devices")}</h2>
        <div class="panel rise p-5">
          {#if !pairOpen}
            <p class="mb-3 text-[13.5px] text-fg-2">{t("Install the Garu app on your phone and scan a code here to pair it.")}</p>
            <button class="btn" onclick={openPair}>{t("Show pairing code")}</button>
            {#if pairError}<p class="mt-2 text-[12.5px]" role="alert" style="color: var(--color-bad)">{pairError}</p>{/if}
          {:else if !pairSvg}
            <Skeleton rows={1} h={180} />
          {:else}
            {#if options.length > 1}
              <div class="mb-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span class="text-mute">{t("Code points to")}</span>
                {#each options as o (o.url)}
                  <button class="rounded-full border px-2.5 py-0.5 transition-colors" class:border-accent={chosen === o.url} class:text-fg={chosen === o.url} class:hairline={chosen !== o.url} class:text-mute={chosen !== o.url} aria-pressed={chosen === o.url} onclick={() => choose(o.url)} title={o.url}>{o.label}</button>
                {/each}
              </div>
            {/if}
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div class="qr w-[180px] flex-none rounded-xl p-2" style="background: var(--color-paper)" role="img" aria-label={t("Pairing code")}>{@html pairSvg}</div>
              <div class="min-w-0 flex-1 text-[13px] text-fg-2">
                {#if chosenIsLocal}
                  <p style="color: var(--color-ask)">{#each parts("This code points at {host}, which a phone can't reach. Put the control room on your private network first: {command} on this computer, then come back here and the code will point there by itself.", { host: new URL(chosen).host, command: `tailscale serve --bg ${s?.port ?? 4000}` }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each}</p>
                {:else}
                  <p>{#each parts("Scan it with the Garu app on Android, or with any phone's camera to open {host} in its browser, signed in.", { host: new URL(chosen).host }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each} {t("On iPhone the app can't scan the code yet: press Copy link and paste the link in the app.")}</p>
                {/if}
                <p class="mt-2 text-[12px] text-mute">{t("This code is a key. Anyone who scans it can approve actions as you.")}</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button class="btn" onclick={copyLink}>{copied ? t("Copied") : t("Copy link")}</button>
                  <span class="sr-only" role="status">{copied ? t("Link copied to the clipboard") : ""}</span>
                  <button class="btn" onclick={() => (showToken = !showToken)}>{showToken ? t("Hide token") : t("Show token")}</button>
                </div>
                {#if showToken}<div class="mono mt-2 break-all rounded-lg border hairline bg-bg px-2.5 py-2 text-[12px] select-all">{pairLink?.split("token=")[1]}</div>{/if}
                <p class="mt-2 text-[12px] text-mute">{t("Someone else saw it?")} <button class="tap underline hover:text-fg" onclick={rotate}>{t("Make a new token")}</button>{#if rotated}<span class="ml-2" style="color: var(--color-ok)">{t("done — other devices are signed out")}</span>{/if}{#if pairError}<span class="ml-2" style="color: var(--color-bad)">{pairError}</span>{/if} {#if s}{#each parts("It lives in {path}.", { path: shortRoot(s.login.tokenPath) }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each}{/if}</p>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Advanced: the control room's own facts. Open on the desktop, folded on the phone. -->
    {#if !s}
      {#if error}
        <div class="panel p-4 text-[13.5px] text-fg-2"><span style="color: var(--color-ask)">{isApp ? t("The details below need your computer.") : t("The details below need the control room.")}</span> {error}</div>
      {:else}
        <Skeleton rows={2} h={72} />
      {/if}
    {:else}
    <details class="rise" open={!isApp}>
      <summary class="cursor-pointer text-[11px] uppercase tracking-wider text-mute">{t("Advanced")}</summary>
      <div class="mt-2 grid gap-4 lg:grid-cols-2">
        <div class="panel p-5">
          <h3 class="mb-3 flex items-center gap-2 text-[11px] font-normal uppercase tracking-wider text-mute"><Icon name="spark" size={14} /> {t("The control room")}</h3>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13.5px] [&>dd]:min-w-0 [&>dd]:[overflow-wrap:anywhere]">
            <dt class="text-mute">Garu</dt><dd>{t("version {version}", { version: s.version })}</dd>
            <dt class="text-mute">{isApp ? t("This app") : t("This page")}</dt><dd class="text-[12.5px]">{buildText(build)}</dd>
            <dt class="text-mute">{t("Deciding as")}</dt><dd>{s.user}{#if !isApp}<span class="text-mute">&nbsp;· <span class="mono">--as</span> {t("to change")}</span>{/if}</dd>
            <dt class="text-mute">{t("Schedules")}</dt><dd>{s.up ? t("running") : t("off")}{#if !s.up && !isApp}<span class="text-mute">&nbsp;· <span class="mono">npm run garu -- service install</span> {t("runs them at login")}</span>{/if}</dd>
            <dt class="text-mute">{t("Listening on")}</dt><dd class="mono">{s.host}:{s.port}</dd>
            <dt class="text-mute">{t("Unanswered asks")}</dt><dd>{t("denied after {min} min", { min: s.askTimeoutMin })}</dd>
            <dt class="text-mute">{t("Push")}</dt><dd>{s.notify ? t("on (ntfy)") : t("off")}{#if !isApp}<span class="text-mute">&nbsp;· <span class="mono">--notify</span></span>{/if}</dd>
            <dt class="text-mute">{t("Folder")}</dt><dd class="mono break-all">{shortRoot(s.root)}</dd>
          </dl>
        </div>

        <div class="panel p-5">
          <h3 class="mb-3 flex items-center gap-2 text-[11px] font-normal uppercase tracking-wider text-mute"><Icon name="key" size={14} /> {t("Models")}</h3>
          <p class="mb-3 text-[13px] text-fg-2">{#if isApp}{t("Keys stay on your computer. Garu only reports whether each is set.")}{:else}{#each parts("Keys live in {file} on the computer. Garu only reports whether each is set.", { file: ".env" }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each}{/if}</p>
          <ul class="space-y-2 text-[13.5px]">
            <li class="flex items-center gap-2"><span class="dot" style="background: {s.providers.gemini ? 'var(--color-ok)' : 'var(--color-line-2)'}"></span><span class="mono">GEMINI_API_KEY</span><span class="text-mute">{s.providers.gemini ? t("set") : t("not set · free at aistudio.google.com")}</span></li>
            <li class="flex items-center gap-2"><span class="dot" style="background: {s.providers.anthropic ? 'var(--color-ok)' : 'var(--color-line-2)'}"></span><span class="mono">ANTHROPIC_API_KEY</span><span class="text-mute">{s.providers.anthropic ? t("set") : t("not set")}</span></li>
            <li class="flex items-center gap-2"><span class="dot" style="background: var(--color-ok)"></span><span class="mono">ollama/*</span><span class="text-mute">{s.providers.ollamaHost ? t("custom OLLAMA_HOST") : t("localhost:11434 · $0, needs Ollama running")}</span></li>
          </ul>
        </div>

        <div class="panel p-5">
          <h3 class="mb-3 flex items-center gap-2 text-[11px] font-normal uppercase tracking-wider text-mute"><Icon name="shield" size={14} /> {t("Variables your agents reference")}</h3>
          {#if s.env.length === 0}
            <p class="text-[13px] text-mute">{#if isApp}{t("None.")}{:else}{#each parts("None. Agents reference secrets as {syntax} in their Garufile and Garu fills them from {file} at run time.", { syntax: "${VAR}", file: ".env" }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each}{/if}</p>
          {:else}
            <ul class="space-y-2 text-[13.5px]">
              {#each s.env as v (v.name)}
                <li class="flex items-center gap-2"><span class="dot" style="background: {v.set ? 'var(--color-ok)' : 'var(--color-ask)'}"></span><span class="mono">{v.name}</span><span class="text-mute">{v.set ? t("set") : isApp ? t("missing, add it on your computer") : t("missing, add it to .env")}</span></li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="panel p-5">
          <h3 class="mb-3 flex items-center gap-2 text-[11px] font-normal uppercase tracking-wider text-mute"><Icon name="globe" size={14} /> {t("Tool servers that sign in or connect")}</h3>
          {#if s.remotes.length === 0}
            <p class="text-[13px] text-mute">{#if isApp}{t("None yet.")}{:else}{#each parts("None yet. A tool server can be a {url} instead of a {command}; servers that want a login use {auth} and {cli}.", { url: "url:", command: "command:", auth: "auth: oauth", cli: "npm run garu -- auth" }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each}{/if}</p>
          {:else}
            <ul class="space-y-2.5 text-[13.5px]">
              {#each s.remotes as r (r.agent + r.server)}
                <li>
                  <div class="flex items-center gap-2">
                    <span class="dot" style="background: {r.signedIn === false ? 'var(--color-ask)' : 'var(--color-ok)'}"></span>
                    <a href={href("agent", r.agent)} class="font-medium hover:underline">{r.agent}</a><span class="text-mute" aria-hidden="true">→</span><span class="mono">{r.server}</span>
                    <span class="ml-auto text-[12px] text-mute">{r.auth === "oauth" ? (r.signedIn ? t("signed in") : t("not signed in")) : isApp ? t("key on your computer") : t("headers from .env")}</span>
                  </div>
                  {#if r.local}
                    <div class="ml-4 text-[12px] text-mute">{t("on this computer · signs in with {host}", { host: r.url.replace(/^https?:\/\//, "").replace(/\/$/, "") })}</div>
                  {:else}
                    <div class="mono ml-4 text-[11.5px] text-mute [overflow-wrap:anywhere]">{r.url}</div>
                  {/if}
                  {#if r.signedIn === false && !isApp}<div class="mono ml-4 mt-1 text-[12px] [overflow-wrap:anywhere]" style="color: var(--color-ask)">npm run garu -- auth {r.source} {r.server}</div>{/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </details>
    {/if}
</section>

<style>
  .qr :global(svg) { display: block; width: 100%; height: auto; }
  details > summary { list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: "▸ " / ""; }
  details[open] > summary::before { content: "▾ "; }
</style>
