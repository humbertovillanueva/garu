<script lang="ts">
  import { onMount, tick } from "svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import Logo from "./lib/components/Logo.svelte";
  import Home from "./routes/Home.svelte";
  import Agents from "./routes/Agents.svelte";
  import Agent from "./routes/Agent.svelte";
  import Runs from "./routes/Runs.svelte";
  import Run from "./routes/Run.svelte";
  import Inbox from "./routes/Inbox.svelte";
  import Cost from "./routes/Cost.svelte";
  import Settings from "./routes/Settings.svelte";
  import SignIn from "./routes/SignIn.svelte";
  import Pair from "./routes/Pair.svelte";
  import Intro from "./routes/Intro.svelte";
  import { isApp, paired, introSeen, markIntroSeen, server } from "./lib/server.svelte";
  import { route, startRouter, href } from "./lib/router.svelte";
  import { connectLive, live, refreshNow, unreachable as unreachableText, unreachableHint } from "./lib/api.svelte";
  import { setupNative } from "./lib/native";
  import { pullToRefresh } from "./lib/pull";
  import { prefs } from "./lib/prefs.svelte";
  import Help from "./routes/Help.svelte";
  import About from "./routes/About.svelte";
  import Report from "./routes/Report.svelte";
  import Crash from "./lib/components/Crash.svelte";
  import { applyTheme } from "./lib/theme.svelte";
  import { announcer } from "./lib/a11y.svelte";
  import { t, locale } from "./lib/i18n.svelte";

  // The app opens on a short splash every time; the first time (or when asked again from Settings) the intro follows.
  const introAtStart = isApp && !introSeen();
  const pairedAtStart = paired();
  let showIntro = $state(introAtStart);
  let splashing = $state(isApp && !introAtStart);
  $effect(() => { if (splashing) { const t = setTimeout(() => (splashing = false), 1500); return () => clearTimeout(t); } });
  // Pairing from inside the intro finishes it. A phone that was already paired (replaying the intro from Settings) ends it with Done.
  $effect(() => { if (showIntro && !pairedAtStart && server.base && server.token) { markIntroSeen(); showIntro = false; } });

  /** In the app, opening it with a decision waiting lands on the inbox: open → read → approve. */
  let landed = false;
  function landOnPending() {
    if (!isApp || !live.loaded || !prefs.landOnInbox) return;
    if (live.pending.length && (route.name === "home" || !location.hash)) location.hash = href("inbox");
  }
  async function resume() { if (!paired()) return; await refreshNow(); landOnPending(); }

  // Dark or light, now and whenever the preference or the device changes.
  $effect(() => { applyTheme(); });
  // The page's language, for screen readers and the browser's own UI (spell-check, translate prompts).
  $effect(() => { document.documentElement.lang = locale(); });

  onMount(() => {
    if (isApp) document.documentElement.classList.add("app");
    startRouter();
    if (paired()) connectLive();
    void setupNative(resume);
    // The app ships its own copy of the page; only the browser version wants the service worker.
    if (import.meta.env.PROD && !isApp && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
  $effect(() => { if (live.loaded && !landed) { landed = true; landOnPending(); } });
  // The title names the page and what needs you, like a mail client; a screen reader hears it on every navigation.
  const PAGE: Record<string, string> = $derived({ home: "Garu", inbox: t("Inbox"), agents: t("Agents"), agent: t("Agent"), runs: t("Runs"), run: t("Run"), cost: t("Cost"), settings: t("Settings"), help: t("Help"), about: t("About"), report: t("Report a problem") });
  $effect(() => {
    const page = route.name === "agent" && route.parts[0] ? route.parts[0] : PAGE[route.name] ?? "Garu";
    document.title = `${live.pending.length ? `(${live.pending.length}) ` : ""}${page === "Garu" ? "Garu" : `${page} · Garu`}`;
  });
  // After a navigation, focus moves to the new page's content, so keyboard and screen-reader users land where they went.
  let mainEl = $state<HTMLElement | null>(null);
  let lastRoute = "";
  $effect(() => {
    const key = `${route.name}/${route.parts.join("/")}`;
    if (key === lastRoute) return;
    const first = lastRoute === "";
    lastRoute = key;
    if (!first) void tick().then(() => mainEl?.focus({ preventScroll: true }));
  });

  // The reconnect banner waits two seconds so a blink of the network doesn't flash it.
  let now = $state(Date.now());
  // Ticks only while disconnected (to time the banner), so a connected phone isn't woken every second.
  $effect(() => { if (live.connected) return; now = Date.now(); const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  const offline = $derived(!live.connected && live.disconnectedAt > 0 && now - live.disconnectedAt > 2000);
  // Never reached it since opening: say so instead of showing skeletons forever. Settings and the help
  // pages still open, so a phone paired to a dead address can always forget it or ask for help.
  const worksOffline = ["settings", "help", "about", "report"];
  const unreachable = $derived(!live.loaded && !!live.loadError && !worksOffline.includes(route.name));

  // A bug anywhere shows the crash screen instead of a blank page. Errors from rendering are caught by the
  // boundary below; ones from timers and event handlers arrive here. A failed request is not a crash: api.ts
  // handles those, and the few that escape would only confuse this screen.
  let crashed = $state<string | null>(null);
  const benign = (e: unknown) => { const err = e as { name?: string; message?: string } | undefined; return !err || err.name === "HttpError" || err.name === "AbortError" || /fetch|network|load failed/i.test(err.message ?? ""); };
  $effect(() => {
    const onError = (e: ErrorEvent) => { if (e.error && !benign(e.error)) crashed = e.message || String(e.error); };
    const onReject = (e: PromiseRejectionEvent) => { if (!benign(e.reason)) crashed = (e.reason as Error)?.message ?? String(e.reason); };
    addEventListener("error", onError);
    addEventListener("unhandledrejection", onReject);
    return () => { removeEventListener("error", onError); removeEventListener("unhandledrejection", onReject); };
  });
  const recover = () => { crashed = null; location.hash = href("home"); };
</script>

{#if crashed}
  <div class="min-h-screen bg-bg text-fg"><Crash message={crashed} onRetry={recover} /></div>
{:else if showIntro}
  <Intro alreadyPaired={pairedAtStart} onDone={() => { markIntroSeen(); showIntro = false; }} />
{:else if splashing}
  <div class="grid min-h-screen place-items-center bg-bg text-fg"><Logo size={132} animate /></div>
{:else if isApp && !paired()}
  <Pair />
{:else if live.signIn}
  {#if isApp}<Pair title={t("Pair this phone again")} problem={t("The key it has is no longer accepted; someone may have made a new one. Pair again with a fresh code.")} />{:else}<SignIn />{/if}
{:else}
<div class="flex min-h-screen flex-col lg:flex-row">
  <Sidebar />
  <main class="pull min-w-0 flex-1 outline-none" tabindex="-1" bind:this={mainEl} use:pullToRefresh={refreshNow}>
    <div class="sr-only" role="status" aria-live="polite">{announcer.text}</div>
    <div class="pull-hint" aria-hidden="true"><span class="dot" class:pulse={live.refreshing}></span>{live.refreshing ? t("Refreshing…") : t("Pull to refresh")}</div>
    {#if offline}
      <div class="offline" role="status">
        <span class="dot pulse" style="background: var(--color-ask)"></span>
        <span>{isApp ? t("Reconnecting to your computer…") : t("Reconnecting to your control room…")}</span>
        <button class="tap ml-auto underline" onclick={() => refreshNow()}>{t("Try now")}</button>
      </div>
    {/if}
    <div class="mx-auto max-w-5xl px-4 py-5 pb-24 sm:px-6 lg:px-10 lg:py-8 lg:pb-8">
      <svelte:boundary>
      {#snippet failed(error, reset)}
        <Crash message={(error as Error)?.message ?? String(error)} onRetry={() => { location.hash = href("home"); reset(); }} />
      {/snippet}
      {#key route.name + "/" + route.parts.join("/")}
        {#if unreachable}
          <section class="rise mx-auto max-w-md py-10 text-center">
            <div class="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border hairline"><span class="dot pulse" style="background: var(--color-ask)"></span></div>
            <h1 class="text-[20px] font-semibold tracking-tight">{isApp ? t("Can't reach your computer") : t("Can't reach the control room")}</h1>
            <p class="mt-2 text-[14px] text-fg-2">{live.loadError === unreachableText() ? unreachableHint() : live.loadError}</p>
            <div class="mt-5 flex flex-wrap justify-center gap-2">
              <button class="btn btn-primary" disabled={live.refreshing} onclick={() => refreshNow()}>{live.refreshing ? t("Trying…") : t("Try again")}</button>
              <a class="btn" href={href("settings")}>{t("Settings")}</a>
            </div>
          </section>
        {:else if route.name === "agent" && route.parts[0]}
          <Agent name={route.parts[0]} />
        {:else if route.name === "agents"}
          <Agents />
        {:else if route.name === "runs"}
          <Runs />
        {:else if route.name === "run" && route.parts[0] && route.parts[1]}
          <Run agent={route.parts[0]} runId={route.parts[1]} />
        {:else if route.name === "inbox"}
          <Inbox />
        {:else if route.name === "cost"}
          <Cost />
        {:else if route.name === "settings"}
          <Settings />
        {:else if route.name === "help"}
          <Help />
        {:else if route.name === "about"}
          <About />
        {:else if route.name === "report"}
          <Report />
        {:else}
          <Home />
        {/if}
      {/key}
      </svelte:boundary>
    </div>
  </main>
</div>
{/if}
