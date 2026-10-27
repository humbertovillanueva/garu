<script lang="ts">
  import { buildText } from "../lib/format";
  import Logo from "../lib/components/Logo.svelte";
  /**
   * The app's first screen: connect this phone to the control room on your computer.
   * Scan the code from Settings → Your phone, or paste the link it carries.
   */
  import { onDestroy } from "svelte";
  import { build, markIntroSeen, server } from "../lib/server.svelte";
  import { parsePairing } from "../lib/pairlink";
  import { pair, pairing } from "../lib/pairing.svelte";
  import { canScan, isIOS } from "../lib/native";
  import { t, parts, siteUrl, locale } from "../lib/i18n.svelte";

  /** The button that had focus goes away when the scanner opens; Cancel takes it. */
  const takeFocus = (n: HTMLElement) => { n.focus(); };
  let { problem = null, embedded = false, title }: { problem?: string | null; embedded?: boolean; title?: string } = $props();

  let text = $state("");
  // Connecting, from here or from a link the phone opened the app with.
  const busy = $derived(pairing.busy);
  // svelte-ignore state_referenced_locally
  let error = $state<string | null>(problem);
  let scanning = $state(false);
  let video = $state<HTMLVideoElement | null>(null);
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  // Once the link is in, its key is shown as dots (screenshots and screen recordings stay clean) and the address under it.
  const parsed = $derived(parsePairing(text));

  /** The public demo: a control room with made-up agents, so the app can be tried before Garu is on a computer. */
  const DEMO_INFO = "https://garuagents.com/demo.json";
  let demoBusy = $state(false);
  async function tryDemo() {
    error = null; demoBusy = true;
    try {
      const res = await fetch(DEMO_INFO, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const all = (await res.json()) as { base?: string; token?: string; es?: { base?: string; token?: string } };
      // The Spanish demo has Spanish agents, mail and briefs; the English one is the default.
      const info = locale() === "es" && all.es ? all.es : all;
      if (!res.ok || typeof info.base !== "string" || typeof info.token !== "string") throw new Error("no demo");
      await connect(`${info.base}/?token=${info.token}`, true);
    } catch {
      error = t("The demo isn't reachable right now. Try again in a little while.");
    } finally {
      demoBusy = false;
    }
  }

  async function connect(input: string, demo = false) {
    if (busy) return;
    error = null; pairing.error = null;
    error = await pair(input, demo);
  }

  async function startScan() {
    error = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      scanning = true;
      await new Promise((r) => setTimeout(r, 50));
      if (video) { video.srcObject = stream; await video.play(); }
      const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const det = new Detector({ formats: ["qr_code"] });
      timer = setInterval(async () => {
        if (!video || video.readyState < 2) return;
        try {
          const codes = await det.detect(video);
          const hit = codes.find((c) => parsePairing(c.rawValue));
          if (hit) { stopScan(); void connect(hit.rawValue); }
        } catch { /* keep looking */ }
      }, 250);
    } catch {
      scanning = false;
      error = t("The camera isn't available. Paste the link instead: on your computer, Settings → Your phone & other devices → Show pairing code → Copy link.");
    }
  }
  function stopScan() {
    clearInterval(timer); timer = undefined;
    stream?.getTracks().forEach((track) => track.stop()); stream = null;
    scanning = false;
  }
  onDestroy(stopScan);
</script>

<div class={embedded ? "w-full" : "flex min-h-screen items-center justify-center px-5"} style={embedded ? "" : "padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom)"}>
  <div class={embedded ? "w-full" : "panel rise w-full max-w-sm p-6 sm:p-7"}>
    {#if !embedded}
    <div class="mb-5 flex items-center gap-2.5">
      <Logo size={30} />
      <span class="text-[17px] font-semibold tracking-tight">Garu</span>
    </div>
    {/if}

    {#if embedded}
      <!-- the intro slide above carries the title and explanation -->
    {:else if server.base && problem}
      <h1 class="text-[20px] font-semibold tracking-tight">{title ?? t("Can't reach your control room")}</h1>
      <p class="mt-2 text-[13.5px] leading-relaxed text-fg-2">{#each parts("This phone is paired with {host}.", { host: server.base.replace(/^https?:\/\//, "") }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each} {problem}</p>
    {:else}
      <h1 class="text-[20px] font-semibold tracking-tight">{t("Connect to your control room")}</h1>
      <p class="mt-2 text-[13.5px] leading-relaxed text-fg-2">{t("Your agents run on your computer. Garu on this phone talks straight to it over your private network (Tailscale); there's no Garu server in between.")}</p>
    {/if}

    {#if !embedded}
    <ol class="mt-4 space-y-1.5 text-[13px] text-fg-2">
      <li><span class="text-mute">1.</span> {#each parts("On your computer, open Garu → {settings} → {button}.", { settings: t("Settings → Your phone & other devices"), button: t("Show pairing code") }) as p}{#if p.name === "settings"}<span class="font-medium text-fg">{p.text}</span>{:else if p.name === "button"}<em>{p.text}</em>{:else}{p.text}{/if}{/each}</li>
      <li><span class="text-mute">2.</span> {canScan ? t("Scan it here, or paste the link below.") : isIOS ? t("The iPhone app can't scan the code yet: press Copy link there and paste the link below.") : t("Press Copy link there and paste it below.")}</li>
    </ol>
    {/if}

    {#if scanning}
      <div class="relative mt-4 overflow-hidden rounded-xl border hairline bg-black" style="aspect-ratio: 1 / 1" role="img" aria-label={t("Camera: point it at the pairing code")}>
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={video} class="h-full w-full object-cover" playsinline muted></video>
        <div class="pointer-events-none absolute inset-6 rounded-lg border-2 border-accent/70"></div>
      </div>
      <button class="btn mt-3 w-full" onclick={stopScan} use:takeFocus>{t("Cancel")}</button>
    {:else}
      {#if canScan}
        <button class="btn btn-primary mt-5 w-full" onclick={startScan} disabled={busy}>{t("Scan the code")}</button>
        <div class="my-3 flex items-center gap-3 text-[11px] uppercase tracking-wider text-mute"><span class="h-px flex-1 bg-line"></span>{t("or")}<span class="h-px flex-1 bg-line"></span></div>
      {/if}
      <form onsubmit={(e) => { e.preventDefault(); void connect(text); }}>
        <label class="block">
          <span class="text-[11px] uppercase tracking-wider text-mute">{t("Sign-in link")}</span>
          <input class="field mono mt-1.5" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://your-mac.tail…ts.net/?token=…" style={parsed ? "-webkit-text-security: disc" : undefined} bind:value={text} />
        </label>
        {#if parsed}<p class="mt-1.5 text-[11.5px] text-mute">{#each parts("A link to {host}. Its key stays hidden.", { host: parsed.base.replace(/^https?:\/\//, "") }) as p}{#if p.name}<span class="mono [overflow-wrap:anywhere]">{p.text}</span>{:else}{p.text}{/if}{/each}</p>{/if}
        <button class="btn mt-3 w-full" class:btn-primary={!canScan} type="submit" disabled={busy || !text.trim()}>{busy ? t("Connecting…") : t("Connect")}</button>
      </form>
    {/if}

    {#if !problem}
      <div class="mt-4 rounded-xl border hairline p-3.5">
        <p class="text-[12.5px] leading-relaxed text-fg-2">{t("No Garu yet? Look around the demo: made-up agents, a decision waiting for you, runs to replay.")}</p>
        <button class="btn mt-2.5 w-full" type="button" onclick={tryDemo} disabled={busy || demoBusy}>{demoBusy ? t("Connecting…") : t("Try the demo")}</button>
      </div>
    {/if}
    {#if error ?? pairing.error}<p class="mt-3 text-[12.5px] leading-relaxed" role="alert" style="color: var(--color-bad)">{error ?? pairing.error}</p>{/if}
    <p class="mt-4 text-[11.5px] leading-relaxed text-mute">{t("The link carries a key that lets this phone approve actions as you. It is stored only on this phone.")}</p>
    {#if !embedded && !problem}
      <div class="mt-4 flex flex-wrap gap-x-4 text-[12.5px]">
        <a class="inline-flex min-h-11 items-center text-fg underline decoration-mute underline-offset-2" href={siteUrl()} target="_blank" rel="noreferrer">{t("Don't have Garu yet?")} <span aria-hidden="true">↗</span><span class="sr-only">{t("(opens in a new tab)")}</span></a>
        <button class="min-h-11 text-fg-2 underline decoration-mute underline-offset-2" onclick={() => { markIntroSeen(false); location.reload(); }}>{t("See the introduction")}</button>
      </div>
    {/if}
    {#if !embedded}<p class="mt-3 text-[11.5px] text-mute">{buildText(build)}</p>{/if}
  </div>
</div>
