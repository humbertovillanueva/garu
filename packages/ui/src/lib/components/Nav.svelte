<script lang="ts">
  import { route, href } from "../router.svelte";
  import { live } from "../api.svelte";
  let { pending }: { pending: number } = $props();
  const items = [
    ["agents", "Agents"],
    ["runs", "Runs"],
    ["inbox", "Inbox"],
    ["cost", "Cost"],
  ] as const;
</script>

<header class="sticky top-0 z-10 border-b hairline bg-bg/90 backdrop-blur">
  <div class="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
    <a href={href("agents")} class="mr-3 flex items-center gap-2">
      <span class="relative grid h-6 w-6 place-items-center">
        <span class="absolute h-6 w-6 rounded-full border border-accent/35"></span>
        <span class="h-2.5 w-2.5 rounded-full bg-accent"></span>
      </span>
      <span class="text-[15px] font-semibold tracking-tight">Garu</span>
    </a>
    <nav class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {#each items as [name, label]}
        <a href={href(name)} class="navlink flex items-center gap-2 whitespace-nowrap" class:active={route.name === name}>
          {label}
          {#if name === "inbox" && pending > 0}
            <span class="mono rounded-full bg-accent px-1.5 text-[11px] font-semibold text-bg">{pending}</span>
          {/if}
        </a>
      {/each}
    </nav>
    <div class="ml-2 flex flex-none items-center gap-2 text-[12px] text-mute">
      <span class="dot" style="background: {live.connected ? 'var(--color-ok)' : 'var(--color-mute)'}"></span>
      <span class="hidden sm:inline">{live.connected ? "live" : "reconnecting"}</span>
    </div>
  </div>
</header>
