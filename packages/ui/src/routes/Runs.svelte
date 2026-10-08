<script lang="ts">
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, when, duration, tokens, truncate } from "../lib/format";
  import Status from "../lib/components/Status.svelte";
  import Mark from "../lib/components/Mark.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { RunSummary } from "../lib/types";

  let runs = $state<RunSummary[] | null>(null);
  $effect(() => { live.tick; api.runs().then((r) => (runs = r)); });
</script>

<section class="space-y-5">
  <div class="rise">
    <h1 class="text-[24px] font-semibold tracking-tight">Runs</h1>
    <p class="mt-1 text-[14px] text-fg-2">Every run is a flight-recorder file on disk. Open one to replay it.</p>
  </div>
  {#if runs === null}
    <Skeleton rows={6} h={44} />
  {:else if runs.length === 0}
    <Empty title="No runs yet" />
  {:else}
    <div class="panel overflow-x-auto">
      <table class="w-full text-[13px]">
        <thead class="text-left text-[11px] uppercase tracking-wider text-mute">
          <tr class="border-b hairline">
            <th class="px-4 py-2.5 font-medium">Agent</th>
            <th class="px-3 py-2.5 font-medium">Status</th>
            <th class="px-3 py-2.5 font-medium">Started</th>
            <th class="hidden px-3 py-2.5 font-medium md:table-cell">Trigger</th>
            <th class="hidden px-3 py-2.5 font-medium lg:table-cell">Summary</th>
            <th class="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Turns</th>
            <th class="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Tools</th>
            <th class="px-3 py-2.5 text-right font-medium">Cost</th>
            <th class="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Took</th>
          </tr>
        </thead>
        <tbody>
          {#each runs as r (r.agent + r.runId)}
            <tr class="card-hover cursor-pointer border-b hairline last:border-0" onclick={() => (location.hash = href("run", r.agent, r.runId))}>
              <td class="px-4 py-2"><span class="flex items-center gap-2"><Mark name={r.agent} size={20} /><span class="font-medium">{r.agent}</span></span></td>
              <td class="px-3 py-2"><Status status={r.status} /></td>
              <td class="mono px-3 py-2 text-fg-2" title={r.startedAt}>{when(r.startedAt)}</td>
              <td class="mono hidden whitespace-nowrap px-3 py-2 text-mute md:table-cell" title={r.trigger}>{r.trigger.startsWith("cron") ? "cron" : r.trigger}</td>
              <td class="hidden max-w-[28ch] truncate px-3 py-2 text-fg-2 lg:table-cell">{r.summary ?? ""}</td>
              <td class="mono hidden sm:table-cell px-3 py-2 text-right">{r.turns}</td>
              <td class="mono hidden px-3 py-2 text-right sm:table-cell"><span style="color: var(--color-ok)">{r.toolCalls.allow}</span><span class="text-mute">/</span><span style="color: var(--color-ask)">{r.toolCalls.ask}</span><span class="text-mute">/</span><span style="color: var(--color-bad)">{r.toolCalls.block}</span></td>
              <td class="mono px-3 py-2 text-right">{usd(r.costUsd, r.priced)}</td>
              <td class="mono hidden px-3 py-2 text-right text-mute sm:table-cell">{duration(r.startedAt, r.endedAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="mono text-[11px] text-mute">tools = allowed / asked / blocked · {tokens(runs.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0))} tokens total</p>
  {/if}
</section>
