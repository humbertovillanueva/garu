<script lang="ts">
  import { onMount } from "svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import Home from "./routes/Home.svelte";
  import Agents from "./routes/Agents.svelte";
  import Agent from "./routes/Agent.svelte";
  import Runs from "./routes/Runs.svelte";
  import Run from "./routes/Run.svelte";
  import Inbox from "./routes/Inbox.svelte";
  import Cost from "./routes/Cost.svelte";
  import { route, startRouter } from "./lib/router.svelte";
  import { connectLive, live } from "./lib/api.svelte";

  onMount(() => {
    startRouter(); connectLive();
    if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
  // Title reflects what needs you, like a mail client.
  $effect(() => { document.title = live.pending.length ? `(${live.pending.length}) Garu` : "Garu"; });
</script>

<div class="flex min-h-screen flex-col lg:flex-row">
  <Sidebar />
  <main class="min-w-0 flex-1">
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
        {:else}
          <Home />
        {/if}
      {/key}
    </div>
  </main>
</div>
