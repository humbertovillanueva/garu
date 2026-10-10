<script lang="ts">
  import { live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { statusLine } from "../lib/format";
  import Mark from "../lib/components/Mark.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
</script>

<section class="space-y-5">
  <div class="rise">
    <h1 class="text-[24px] font-semibold tracking-tight">Agents</h1>
  </div>
  {#if !live.loaded}
    <Skeleton rows={3} h={84} />
  {:else if live.agents.length === 0}
    <Empty title="No agents yet" hint="Make one on your computer with garu new." />
  {:else}
    <div class="grid gap-3 sm:grid-cols-2">
      {#each live.agents as a (a.name)}
        <a href={href("agent", a.name)} class="panel card-hover rise flex min-w-0 gap-3 p-4">
          <Mark name={a.name} size={40} status={a.status} />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between gap-2">
              <span class="truncate text-[15px] font-semibold">{a.name}</span>
              <span class="text-[11.5px] text-mute">{a.runsToday ? `${a.runsToday} today` : ""}</span>
            </div>
            <div class="mt-0.5 truncate text-[13px] text-fg-2">{a.description || "—"}</div>
            <div class="mt-1 truncate text-[12.5px] text-mute">{statusLine(a)}</div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
  {#if live.problems.length}
    <div class="panel p-3 text-[12.5px]" style="border-color: color-mix(in oklab, var(--color-bad) 40%, var(--color-line))">
      <div class="mb-1 font-medium" style="color: var(--color-bad)">Garufiles with problems</div>
      {#each live.problems as p}<div class="mono text-fg-2">{p.source}: {p.error}</div>{/each}
    </div>
  {/if}
</section>
