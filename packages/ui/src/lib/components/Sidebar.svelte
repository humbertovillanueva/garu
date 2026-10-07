<script lang="ts">
  import { route, href } from "../router.svelte";
  import { live } from "../api.svelte";
  import Mark from "./Mark.svelte";

  const isActive = (name: string, part?: string) => route.name === name && (part === undefined || route.parts[0] === part);
  const shortRoot = $derived(live.root.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~"));
</script>

<!-- Desktop sidebar -->
<aside class="hidden h-screen w-60 flex-none flex-col border-r hairline bg-bg lg:flex sticky top-0">
  <a href={href("home")} class="flex items-center gap-2.5 px-4 pt-5 pb-4">
    <span class="relative grid h-7 w-7 place-items-center">
      <span class="absolute h-7 w-7 rounded-full border border-accent/35"></span>
      <span class="h-3 w-3 rounded-full bg-accent"></span>
    </span>
    <span class="text-[16px] font-semibold tracking-tight">Garu</span>
    <span class="ml-auto flex items-center gap-1.5 text-[11px] text-mute">
      <span class="dot" style="background: {live.connected ? 'var(--color-ok)' : 'var(--color-mute)'}"></span>{live.connected ? "live" : "…"}
    </span>
  </a>

  <nav class="space-y-0.5 px-3">
    <a href={href("home")} class="navitem" class:active={isActive("home")}>
      <span class="w-4 text-center">⌂</span> Home
    </a>
    <a href={href("inbox")} class="navitem" class:active={isActive("inbox")}>
      <span class="w-4 text-center">◫</span> Inbox
      {#if live.pending.length}<span class="mono ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold text-bg">{live.pending.length}</span>{/if}
    </a>
    <a href={href("runs")} class="navitem" class:active={isActive("runs") || route.name === "run"}>
      <span class="w-4 text-center">≡</span> Runs
    </a>
    <a href={href("cost")} class="navitem" class:active={isActive("cost")}>
      <span class="w-4 text-center">$</span> Cost
    </a>
  </nav>

  <div class="mt-6 flex items-center justify-between px-5 text-[11px] uppercase tracking-wider text-mute">
    <span>Agents</span>
    <span class="mono">{live.agents.length}</span>
  </div>
  <nav class="mt-1 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
    {#each live.agents as a (a.name)}
      <a href={href("agent", a.name)} class="navitem" class:active={isActive("agent", a.name)}>
        <Mark name={a.name} size={20} status={a.status} />
        <span class="truncate">{a.name}</span>
        {#if a.status === "waiting"}<span class="dot ml-auto bg-accent"></span>
        {:else if a.status === "working"}<span class="dot pulse ml-auto bg-accent"></span>
        {:else if a.status === "scheduled"}<span class="ml-auto text-[11px] text-mute">⏱</span>{/if}
      </a>
    {/each}
    {#if live.loaded && live.agents.length === 0}
      <div class="px-2 py-3 text-[12.5px] text-mute">No Garufiles found under this folder yet.</div>
    {/if}
  </nav>

  <div class="border-t hairline px-4 py-3">
    <div class="mono truncate text-[11px] text-mute" title={live.root}>{shortRoot || "…"}</div>
    <div class="mt-1 text-[11px] text-mute">{live.up ? "schedules running here" : "schedules not running · garu ui --up"}</div>
  </div>
</aside>

<!-- Mobile top bar -->
<header class="sticky top-0 z-10 flex items-center gap-3 border-b hairline bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
  <a href={href("home")} class="flex items-center gap-2">
    <span class="relative grid h-6 w-6 place-items-center"><span class="absolute h-6 w-6 rounded-full border border-accent/35"></span><span class="h-2.5 w-2.5 rounded-full bg-accent"></span></span>
    <span class="text-[15px] font-semibold tracking-tight">Garu</span>
  </a>
  <nav class="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
    {#each [["home", "Home"], ["inbox", "Inbox"], ["runs", "Runs"], ["cost", "Cost"], ["agents", "Agents"]] as const as [n, l]}
      <a href={href(n)} class="navitem whitespace-nowrap py-1.5" class:active={route.name === n || (n === "agents" && route.name === "agent")}>
        {l}{#if n === "inbox" && live.pending.length}<span class="mono rounded-full bg-accent px-1.5 text-[11px] font-semibold text-bg">{live.pending.length}</span>{/if}
      </a>
    {/each}
  </nav>
</header>
