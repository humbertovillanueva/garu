<script lang="ts">
  import Logo from "../lib/components/Logo.svelte";
  /**
   * The app's first screen: connect this phone to the control room on your computer.
   * Scan the code from Settings → Your phone, or paste the link it carries.
   */
  import { onDestroy } from "svelte";
  import { connectLive, live } from "../lib/api.svelte";
  import { build, parsePairing, remember, server } from "../lib/server.svelte";
  import { haptic } from "../lib/native";

  let { problem = null, embedded = false }: { problem?: string | null; embedded?: boolean } = $props();

  let text = $state("");
  let busy = $state(false);
  // svelte-ignore state_referenced_locally
  let error = $state<string | null>(problem);
  let scanning = $state(false);
  let video = $state<HTMLVideoElement | null>(null);
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const canScan = typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);

  async function connect(input: string) {
    const p = parsePairing(input);
    if (!p) { error = "That doesn't look like a Garu sign-in link. It should start with https:// and contain ?token=…"; return; }
    busy = true; error = null;
    try {
      const res = await fetch(`${p.base}/api/agents`, { headers: { authorization: `Bearer ${p.token}` }, cache: "no-store" });
      if (res.status === 401) { error = "The control room answered, but the token is not right. Get a fresh code from Settings → Your phone."; return; }
      if (!res.ok) { error = `The control room answered with HTTP ${res.status}.`; return; }
      remember(p.base, p.token);
      live.signIn = false;
      connectLive(true);
      void haptic("success");
    } catch {
      error = `Couldn't reach ${p.base.replace(/^https?:\/\//, "")}. Is Tailscale on for this phone, and is garu ui running on your computer?`;
    } finally {
      busy = false;
    }
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
      error = "The camera isn't available. Paste the link instead — on your computer, Settings → Your phone → Copy link.";
    }
  }
  function stopScan() {
    clearInterval(timer); timer = undefined;
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
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
      <h1 class="text-[20px] font-semibold tracking-tight">Can't reach your control room</h1>
      <p class="mt-2 text-[13.5px] leading-relaxed text-fg-2">This phone is paired with <span class="mono">{server.base.replace(/^https?:\/\//, "")}</span>. {problem}</p>
    {:else}
      <h1 class="text-[20px] font-semibold tracking-tight">Connect to your control room</h1>
      <p class="mt-2 text-[13.5px] leading-relaxed text-fg-2">Your agents run on your computer. Garu on this phone talks to them over your private network, so nothing goes through a cloud.</p>
    {/if}

    {#if !embedded}
    <ol class="mt-4 space-y-1.5 text-[13px] text-fg-2">
      <li><span class="text-mute">1.</span> On your computer, open Garu → <span class="font-medium text-fg">Settings → Your phone</span> → <em>Show sign-in code</em>.</li>
      <li><span class="text-mute">2.</span> {canScan ? "Scan it here, or paste the link below." : "Press Copy link there and paste it below."}</li>
    </ol>
    {/if}

    {#if scanning}
      <div class="relative mt-4 overflow-hidden rounded-xl border hairline bg-black" style="aspect-ratio: 1 / 1">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={video} class="h-full w-full object-cover" playsinline muted></video>
        <div class="pointer-events-none absolute inset-6 rounded-lg border-2 border-accent/70"></div>
      </div>
      <button class="btn mt-3 w-full" onclick={stopScan}>Cancel</button>
    {:else}
      {#if canScan}
        <button class="btn btn-primary mt-5 w-full" onclick={startScan} disabled={busy}>Scan the code</button>
        <div class="my-3 flex items-center gap-3 text-[11px] uppercase tracking-wider text-mute"><span class="h-px flex-1 bg-line"></span>or<span class="h-px flex-1 bg-line"></span></div>
      {/if}
      <form onsubmit={(e) => { e.preventDefault(); void connect(text); }}>
        <label class="block">
          <span class="text-[11px] uppercase tracking-wider text-mute">Sign-in link</span>
          <input class="mono mt-1.5 w-full rounded-lg border hairline bg-bg px-3 py-2.5 text-[12.5px] outline-none focus:border-accent/60" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://your-mac.tail…ts.net/?token=…" bind:value={text} />
        </label>
        <button class="btn mt-3 w-full" class:btn-primary={!canScan} type="submit" disabled={busy || !text.trim()}>{busy ? "Connecting…" : "Connect"}</button>
      </form>
    {/if}

    {#if error}<p class="mt-3 text-[12.5px] leading-relaxed" style="color: var(--color-bad)">{error}</p>{/if}
    <p class="mt-4 text-[11.5px] leading-relaxed text-mute">The link carries a key that lets this phone approve actions as you. It is stored only on this phone.</p>
    {#if !embedded}<p class="mono mt-3 text-[10.5px] text-mute">{build}</p>{/if}
  </div>
</div>
