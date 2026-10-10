<script lang="ts">
  import { api, live, loader } from "../lib/api.svelte";
  import LoadError from "../lib/components/LoadError.svelte";
  import { usd, agentColor, localDay } from "../lib/format";
  import { KIND_COLOR } from "../lib/colors";
  import Mark from "../lib/components/Mark.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { CostRow } from "../lib/types";

  let rows = $state<CostRow[] | null>(null);
  let days = $state(14);
  let hover = $state<{ day: string; agent: string; cost: number; runs: number } | null>(null);
  let error = $state<string | null>(null);
  const load = loader();
  $effect(() => {
    live.tick; days;
    load(api.cost(days), (r) => { rows = r; error = null; }, (m) => (error = m));
  });

  // Agents ordered by total spend so the four hues go to the ones that matter; the rest are "other".
  const agentOrder = $derived.by(() => {
    const totals = new Map<string, number>();
    for (const r of rows ?? []) totals.set(r.agent, (totals.get(r.agent) ?? 0) + r.costUsd);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
  });
  const legend = $derived(agentOrder.slice(0, 6).concat(agentOrder.length > 6 ? ["other"] : []));

  // One stacked bar per day over the window, including days with nothing.
  const daysList = $derived.by(() => {
    const out: string[] = [];
    for (let i = days - 1; i >= 0; i--) out.push(localDay(new Date(Date.now() - i * 86_400_000)));
    return out;
  });
  const byDay = $derived.by(() => {
    const m = new Map<string, CostRow[]>();
    for (const r of rows ?? []) m.set(r.day, [...(m.get(r.day) ?? []), r]);
    return m;
  });
  const maxDay = $derived(Math.max(1e-9, ...daysList.map((d) => (byDay.get(d) ?? []).reduce((s, r) => s + r.costUsd, 0))));
  const total = $derived((rows ?? []).reduce((s, r) => s + r.costUsd, 0));
  const totalRuns = $derived((rows ?? []).reduce((s, r) => s + r.runs, 0));
  const dayWord = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  // The same color as the agent's avatar, so the legend needs no decoding.
  // "other" is everyone past the first six, so it gets the neutral color rather than one an agent might wear.
  const colorFor = (agent: string) => { if (agent === "other") return "var(--color-s-other)"; const k = live.agents.find((a) => a.name === agent)?.persona?.kind; return k ? KIND_COLOR[k] : agentOrder.indexOf(agent) < 6 ? agentColor(agent) : "var(--color-s-other)"; };
</script>

<section class="space-y-5">
  <div class="rise flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="text-[24px] font-semibold tracking-tight">Cost</h1>
    </div>
    <div class="flex items-center gap-1 text-[13px]">
      {#each [7, 14, 30] as d}
        <button class="btn" class:opacity-50={days !== d} aria-pressed={days === d} onclick={() => (days = d)}>{d}d</button>
      {/each}
    </div>
  </div>

  {#if rows === null}
    {#if error}<LoadError message={error} />{:else}<Skeleton rows={2} h={90} />{/if}
  {:else if rows.length === 0}
    <Empty title="No spend recorded in this window" />
  {:else}
    <div class="panel rise grid grid-cols-3 divide-x divide-line">
      <div class="px-4 py-3"><div class="text-[11px] uppercase tracking-wider text-mute">Total</div><div class="mt-0.5 text-[20px] font-semibold tabular-nums">{usd(total)}</div></div>
      <div class="px-4 py-3"><div class="text-[11px] uppercase tracking-wider text-mute">Runs</div><div class="mt-0.5 text-[20px] font-semibold tabular-nums">{totalRuns}</div></div>
      <div class="px-4 py-3"><div class="text-[11px] uppercase tracking-wider text-mute">Per run</div><div class="mt-0.5 text-[20px] font-semibold tabular-nums">{usd(totalRuns ? total / totalRuns : 0)}</div></div>
    </div>
    <p class="text-[12.5px] text-mute">Estimated from real token counts at list price. Free tiers and local models bill $0; the estimate still shows what it would cost.</p>

    <div class="panel p-4">
      <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        {#each legend as a}
          <span class="inline-flex items-center gap-1.5"><span class="dot" style="background: {colorFor(a)}"></span><span class="text-fg-2">{a}</span></span>
        {/each}
        {#if hover}<span class="ml-auto text-mute">{dayWord(hover.day)} · {hover.agent} · {usd(hover.cost)} · {hover.runs} run{hover.runs === 1 ? "" : "s"}</span>{/if}
      </div>
      <div class="flex h-44 items-end gap-[3px]" role="img" aria-label="Daily spend by agent">
        {#each daysList as day}
          {@const items = byDay.get(day) ?? []}
          {@const sum = items.reduce((s, r) => s + r.costUsd, 0)}
          <div class="group flex h-full flex-1 flex-col justify-end" title="{dayWord(day)} · {usd(sum)}">
            {#each items.slice().sort((a, b) => agentOrder.indexOf(a.agent) - agentOrder.indexOf(b.agent)).reverse() as r}
              <div class="w-full"
                   style="height: {(r.costUsd / maxDay) * 100}%; min-height: {r.costUsd > 0 ? 3 : 0}px; background: {colorFor(r.agent)}; margin-top: 2px; border-radius: 4px 4px 0 0"
                   onmouseenter={() => (hover = { day, agent: r.agent, cost: r.costUsd, runs: r.runs })}
                   onmouseleave={() => (hover = null)}
                   role="presentation"></div>
            {/each}
          </div>
        {/each}
      </div>
      <div class="mt-2 flex justify-between text-[11px] text-mute">
        <span>{dayWord(daysList[0]!)}</span><span>Today</span>
      </div>
    </div>

    <div class="panel overflow-hidden">
      <table class="w-full text-[13px]">
        <thead class="text-left text-[11px] uppercase tracking-wide text-mute">
          <tr class="border-b hairline"><th class="px-4 py-2.5 font-medium">Day</th><th class="px-3 py-2.5 font-medium">Agent</th><th class="px-3 py-2.5 text-right font-medium">Runs</th><th class="px-3 py-2.5 text-right font-medium">Cost</th></tr>
        </thead>
        <tbody>
          {#each rows.slice().reverse() as r (r.day + r.agent)}
            <tr class="border-b hairline last:border-0">
              <td class="px-4 py-2 text-fg-2">{dayWord(r.day)}</td>
              <td class="px-3 py-2"><span class="flex items-center gap-2"><Mark name={r.agent} size={18} />{r.agent}</span></td>
              <td class="px-3 py-2 text-right tabular-nums">{r.runs}</td>
              <td class="px-3 py-2 text-right tabular-nums">{usd(r.costUsd)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
