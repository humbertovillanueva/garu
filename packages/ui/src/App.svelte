<script lang="ts">
  import { onMount } from "svelte";
  import Nav from "./lib/components/Nav.svelte";
  import Agents from "./routes/Agents.svelte";
  import Runs from "./routes/Runs.svelte";
  import Run from "./routes/Run.svelte";
  import Inbox from "./routes/Inbox.svelte";
  import Cost from "./routes/Cost.svelte";
  import { route, startRouter } from "./lib/router.svelte";
  import { api, connectLive, live } from "./lib/api.svelte";

  let pending = $state(0);
  onMount(() => {
    startRouter();
    connectLive();
  });
  $effect(() => {
    live.tick;
    api.inbox().then((r) => (pending = r.pending.length)).catch(() => {});
  });
</script>

<Nav {pending} />
<main class="mx-auto max-w-6xl px-4 py-6">
  {#if route.name === "runs"}
    <Runs agent={route.parts[0]} />
  {:else if route.name === "run" && route.parts[0] && route.parts[1]}
    <Run agent={route.parts[0]} runId={route.parts[1]} />
  {:else if route.name === "inbox"}
    <Inbox />
  {:else if route.name === "cost"}
    <Cost />
  {:else}
    <Agents />
  {/if}
</main>
