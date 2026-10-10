<script lang="ts">
  import { onMount } from "svelte";
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
  import { connectLive, live, refreshNow } from "./lib/api.svelte";
  import { setupNative } from "./lib/native";
  import { pullToRefresh } from "./lib/pull";
  import { prefs } from "./lib/prefs.svelte";
  import Help from "./routes/Help.svelte";
  import About from "./routes/About.svelte";
  import Report from "./routes/Report.svelte";

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
  async function resume() { await refreshNow(); landOnPending(); }

  onMount(() => {
    if (isApp) document.documentElement.classList.add("app");
    startRouter();
    if (paired()) connectLive();
    void setupNative(resume);
    // The app ships its own copy of the page; only the browser version wants the service worker.
    if (import.meta.env.PROD && !isApp && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
  $effect(() => { if (live.loaded && !landed) { landed = true; landOnPending(); } });
  // Title reflects what needs you, like a mail client.
  $effect(() => { document.title = live.pending.length ? `(${live.pending.length}) Garu` : "Garu"; });

  // The reconnect banner waits two seconds so a blink of the network doesn't flash it.
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  const offline = $derived(live.loaded && !live.connected && live.disconnectedAt > 0 && now - live.disconnectedAt > 2000);
</script>

{#if showIntro}
  <Intro alreadyPaired={pairedAtStart} onDone={() => { markIntroSeen(); showIntro = false; }} />
{:else if splashing}
  <div class="grid min-h-screen place-items-center bg-bg text-fg"><Logo size={132} animate /></div>
{:else if isApp && !paired()}
  <Pair />
{:else if live.signIn}
  {#if isApp}<Pair problem="The token it has is no longer accepted — someone may have made a new one. Pair again with a fresh code." />{:else}<SignIn />{/if}
{:else}
<div class="flex min-h-screen flex-col lg:flex-row">
  <Sidebar />
  <main class="pull min-w-0 flex-1" use:pullToRefresh={refreshNow}>
    <div class="pull-hint" aria-hidden="true"><span class="dot" class:pulse={live.refreshing}></span>{live.refreshing ? "Refreshing…" : "Pull to refresh"}</div>
    {#if offline}
      <div class="offline" role="status">
        <span class="dot pulse" style="background: var(--color-ask)"></span>
        <span>Reconnecting to your {isApp ? "computer" : "control room"}…</span>
        <button class="ml-auto underline" onclick={() => refreshNow()}>Try now</button>
      </div>
    {/if}
    <div class="mx-auto max-w-5xl px-4 py-5 pb-24 sm:px-6 lg:px-10 lg:py-8 lg:pb-8">
      {#key route.name + "/" + route.parts.join("/")}
        {#if route.name === "agent" && route.parts[0]}
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
    </div>
  </main>
</div>
{/if}
