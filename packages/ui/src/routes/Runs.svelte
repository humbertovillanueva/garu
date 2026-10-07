<script lang="ts">
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, when, duration, tokens, truncate } from "../lib/format";
  import Status from "../lib/components/Status.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { RunSummary } from "../lib/types";

  let { agent }: { agent?: string } = $props();
  let runs = $state<RunSummary[] | null>(null);
  $effect(() => {
    live.tick;
    api.runs(agent).then((r) => (runs = r));
  });
</script>

<section class="space-y-5">
  <div>
    <h1 class="text-xl font-semibold tracking-tight">
      {#if agent}<a href={href("runs")} class="text-mute hover:text-fg">Runs</a> <span class="text-mute">/</span> {agent}{:else}Runs{/if}
    </h1>
    <p class="mt-1 text-[13px] text-mute">Every run is a flight recorder file. Click one to replay it.</p>
  </div>

  {#if runs === null}
    <div class="text-[13px] text-mute">loading…</div>
  {:else if runs.length === 0}
    <Empty title="No runs yet" />
  {:else}
    <div class="panel overflow-hidden">
      <table class="w-full text-[13px]">
        <thead class="text-left text-[11px] uppercase tracking-wide text-mute">
          <tr class="border-b hairline">
            <th class="px-4 py-2.5 font-medium">Status</th>
            {#if !agent}<th class="px-3 py-2.5 font-medium">Agent</th>{/if}
            <th class="px-3 py-2.5 font-medium">Started</th>
            <th class="hidden px-3 py-2.5 font-medium md:table-cell">Trigger</th>
            <th class="px-3 py-2.5 text-right font-medium">Turns</th>
            <th class="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Tools</th>
            <th class="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Tokens</th>
            <th class="px-3 py-2.5 text-right font-medium">Cost</th>
            <th class="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Took</th>
          </tr>
        </thead>
        <tbody>
          {#each runs as r (r.agent + r.runId)}
            <tr class="cursor-pointer border-b hairline last:border-0 hover:bg-panel-2"
                onclick={() => (location.hash = href("run", r.agent, r.runId))}>
              <td class="px-4 py-2.5"><Status status={r.status} /></td>
              {#if !agent}<td class="px-3 py-2.5 font-medium">{r.agent}</td>{/if}
              <td class="mono px-3 py-2.5 text-fg-2" title={r.startedAt}>{when(r.startedAt)}</td>
              <td class="mono hidden px-3 py-2.5 text-mute md:table-cell">{truncate(r.trigger, 24)}</td>
              <td class="mono px-3 py-2.5 text-right">{r.turns}</td>
              <td class="mono hidden px-3 py-2.5 text-right sm:table-cell">
                <span style="color: var(--color-ok)">{r.toolCalls.allow}</span><span class="text-mute">/</span><span style="color: var(--color-ask)">{r.toolCalls.ask}</span><span class="text-mute">/</span><span style="color: var(--color-bad)">{r.toolCalls.block}</span>
              </td>
              <td class="mono hidden px-3 py-2.5 text-right text-fg-2 lg:table-cell">{tokens(r.inputTokens + r.outputTokens)}</td>
              <td class="mono px-3 py-2.5 text-right">{usd(r.costUsd, r.priced)}</td>
              <td class="mono hidden px-3 py-2.5 text-right text-mute sm:table-cell">{duration(r.startedAt, r.endedAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="mono text-[11px] text-mute">tools = allowed / asked / blocked</p>
  {/if}
</section>
