<script lang="ts">
  import Logo from "./Logo.svelte";
  import { route, href } from "../router.svelte";
  import { live } from "../api.svelte";
  import { statusLine } from "../format";
  import Mark from "./Mark.svelte";
  import Icon from "./Icon.svelte";

  const isActive = (name: string, part?: string) => route.name === name && (part === undefined || route.parts[0] === part);
  const shortRoot = $derived(live.root.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~"));
  const nav = [
    { n: "home", label: "Home", icon: "home" as const, active: () => isActive("home") },
    { n: "inbox", label: "Inbox", icon: "inbox" as const, active: () => isActive("inbox") },
    { n: "runs", label: "Runs", icon: "runs" as const, active: () => isActive("runs") || route.name === "run" },
    { n: "cost", label: "Cost", icon: "cost" as const, active: () => isActive("cost") },
  ];
  const short = (a: { status: string; needs: string[]; signIn: string[]; cron: string | null; nextRun: string | null; inFlight: { turn: number } | null; pending: number; lastRun: { status: string; startedAt: string } | null; configured: boolean }) =>
    a.status === "needs-setup" ? "needs setup" : a.status === "waiting" ? "waiting for you" : a.status === "working" ? "working" : a.status === "scheduled" ? statusLine(a).replace("Sleeping — ", "") : "";
</script>

<!-- Desktop sidebar -->
<aside class="hidden h-screen w-64 flex-none flex-col border-r hairline bg-bg lg:flex sticky top-0">
  <a href={href("home")} class="flex items-center gap-2.5 px-5 pt-5 pb-4">
    <Logo size={26} />
    <span class="text-[16px] font-semibold tracking-tight">Garu</span>
    <span class="ml-auto flex items-center gap-1.5 text-[11px] text-mute" title={live.connected ? "connected to the control room" : "reconnecting…"}>
      <span class="dot" style="background: {live.connected ? 'var(--color-ok)' : 'var(--color-mute)'}"></span>{live.connected ? "live" : "…"}
    </span>
  </a>

  <nav class="space-y-0.5 px-3">
    {#each nav as item}
      <a href={href(item.n)} class="navitem" class:active={item.active()}>
        <span class="navicon"><Icon name={item.icon} size={17} /></span>
        <span>{item.label}</span>
        {#if item.n === "inbox" && live.pending.length}<span class="ml-auto rounded-full px-1.5 text-[11px] font-semibold text-bg" style="background: var(--color-ask)">{live.pending.length}</span>{/if}
      </a>
    {/each}
  </nav>

  <div class="mt-6 flex items-center justify-between px-5 text-[11px] uppercase tracking-wider text-mute">
    <a href={href("agents")} class="hover:text-fg">Agents</a>
    <span>{live.agents.length}</span>
  </div>
  <nav class="mt-1 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
    {#each live.agents as a (a.name)}
      {@const sub = short(a)}
      <a href={href("agent", a.name)} class="navitem agent" class:active={isActive("agent", a.name)}>
        <Mark name={a.name} size={22} status={a.status} />
        <span class="min-w-0 flex-1 leading-tight">
          <span class="block truncate">{a.name}</span>
          {#if sub}<span class="block truncate text-[11px]" style="color: {a.status === 'needs-setup' ? 'var(--color-ask)' : 'var(--color-mute)'}">{sub}</span>{/if}
        </span>
        {#if a.status === "waiting"}<span class="dot" style="background: var(--color-ask)"></span>
        {:else if a.status === "working"}<span class="dot pulse bg-accent"></span>
        {:else if a.status === "scheduled"}<span class="text-mute"><Icon name="clock" size={13} /></span>{/if}
      </a>
    {/each}
    {#if live.loaded && live.agents.length === 0}
      <div class="px-2 py-3 text-[12.5px] text-mute">No Garufiles found under this folder yet. <span class="mono">garu new</span> makes one.</div>
    {/if}
  </nav>

  <div class="border-t hairline px-3 py-2">
    <a href={href("settings")} class="navitem" class:active={isActive("settings")}>
      <span class="navicon"><Icon name="settings" size={17} /></span>
      <span>Settings</span>
    </a>
    <div class="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[11px] text-mute">
      <span class="dot" style="background: {live.up ? 'var(--color-ok)' : 'var(--color-mute)'}"></span>
      <span class="truncate">{live.up ? "schedules running" : "schedules off"}</span>
      <span class="mono ml-auto truncate" title={live.root}>{shortRoot || "…"}</span>
    </div>
  </div>
</aside>

<!-- Phone: slim top bar with the brand and the live dot -->
<header class="phonebar sticky top-0 z-10 flex items-center gap-3 border-b hairline bg-bg/90 px-4 py-2.5 backdrop-blur lg:hidden" style="padding-top: calc(0.625rem + env(safe-area-inset-top))">
  <a href={href("home")} class="flex items-center gap-2">
    <Logo size={22} />
    <span class="text-[15px] font-semibold tracking-tight">Garu</span>
  </a>
  <span class="ml-auto flex items-center gap-1.5 text-[11px] text-mute">
    <span class="dot" style="background: {live.connected ? 'var(--color-ok)' : 'var(--color-ask)'}"></span>{live.connected ? "live" : "offline"}
  </span>
  <a href={href("settings")} class="text-mute hover:text-fg" aria-label="Settings"><Icon name="settings" size={18} /></a>
</header>

<!-- Phone: bottom tab bar, within thumb reach -->
<nav class="phonebar fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t hairline bg-bg/95 backdrop-blur lg:hidden" style="padding-bottom: env(safe-area-inset-bottom)">
  {#each [["home", "Home"], ["inbox", "Inbox"], ["agents", "Agents"], ["runs", "Runs"], ["cost", "Cost"]] as const as [n, l]}
    {@const active = route.name === n || (n === "agents" && route.name === "agent") || (n === "runs" && route.name === "run")}
    <a href={href(n)} class="tab" class:active aria-label={l}>
      <span class="relative">
        <Icon name={n} />
        {#if n === "inbox" && live.pending.length}<span class="absolute -right-2.5 -top-1.5 rounded-full px-1.5 text-[10px] font-semibold leading-4 text-bg" style="background: var(--color-ask)">{live.pending.length}</span>{/if}
      </span>
      <span>{l}</span>
    </a>
  {/each}
</nav>
