<script lang="ts">
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, when, tokens } from "../lib/format";
  import Status from "../lib/components/Status.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { AgentSummary } from "../lib/types";

  let agents = $state<AgentSummary[] | null>(null);
  let error = $state<string | null>(null);
  $effect(() => {
    live.tick;
    api.agents().then((a) => (agents = a)).catch((e) => (error = String(e)));
  });
  const totalToday = $derived((agents ?? []).reduce((s, a) => s + a.costTodayUsd, 0));
  const runsToday = $derived((agents ?? []).reduce((s, a) => s + a.runsToday, 0));
</script>

<section class="space-y-5">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Agents</h1>
      <p class="mt-1 text-[13px] text-mute">Everything that has run from this directory.</p>
    </div>
    <div class="flex gap-6">
      <div><div class="text-[11px] uppercase tracking-wide text-mute">Runs today</div><div class="mono text-lg">{runsToday}</div></div>
      <div><div class="text-[11px] uppercase tracking-wide text-mute">Spend today</div><div class="mono text-lg">{usd(totalToday)}</div></div>
    </div>
  </div>

  {#if error}
    <Empty title="Couldn't reach the Garu server" hint={error} />
  {:else if agents === null}
    <div class="text-[13px] text-mute">loading…</div>
  {:else if agents.length === 0}
    <Empty title="No agents have run yet" hint="garu run examples/hello/Garufile.yaml" />
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each agents as a (a.name)}
        <a href={href("runs", a.name)} class="panel block p-4 transition-colors hover:border-line-2">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate font-medium">{a.name}</div>
              <div class="mono mt-0.5 truncate text-[12px] text-mute">{a.model ?? "—"}</div>
            </div>
            {#if a.lastRun}<Status status={a.lastRun.status} />{/if}
          </div>
          <div class="mono mt-4 grid grid-cols-3 gap-2 text-[12px]">
            <div><div class="text-mute">last run</div><div>{when(a.lastRun?.startedAt)}</div></div>
            <div><div class="text-mute">today</div><div>{a.runsToday} run{a.runsToday === 1 ? "" : "s"}</div></div>
            <div><div class="text-mute">spend</div><div>{usd(a.costTodayUsd)}</div></div>
          </div>
          {#if a.lastRun}
            <div class="mono mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t hairline pt-3 text-[11px] whitespace-nowrap text-mute">
              <span>{a.lastRun.turns} turns</span>
              <span>{tokens(a.lastRun.inputTokens + a.lastRun.outputTokens)} tok</span>
              <span style="color: var(--color-ok)">{a.lastRun.toolCalls.allow} allow</span>
              <span style="color: var(--color-ask)">{a.lastRun.toolCalls.ask} ask</span>
              <span style="color: var(--color-bad)">{a.lastRun.toolCalls.block} block</span>
              {#if a.lastRun.sandbox}<span class="ml-auto rounded px-1.5 text-fg-2" style="background: var(--color-panel-2)">sandboxed</span>{/if}
            </div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</section>
