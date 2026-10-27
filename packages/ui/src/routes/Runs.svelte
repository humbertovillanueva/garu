<script lang="ts">
  /**
   * The runs, newest first, grouped by day, a page of 200 at a time with older ones a tap away. An
   * agent that ran several times in a row with the same outcome takes one row ("tick × 5 · all done ·
   * 1:00 – 6:00 PM") that opens on tap, so a heartbeat agent doesn't bury the runs that matter.
   */
  import { untrack } from "svelte";
  import { api, live, loader, errorText } from "../lib/api.svelte";
  import LoadError from "../lib/components/LoadError.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, clock, dayLabel, duration, statusLabel, triggerLabel, plainTimes } from "../lib/format";
  import Status from "../lib/components/Status.svelte";
  import Mark from "../lib/components/Mark.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { RunSummary } from "../lib/types";
  import { t } from "../lib/i18n.svelte";

  const PAGE = 200;
  let runs = $state<RunSummary[] | null>(null);
  let error = $state<string | null>(null);
  // How many the page holds grows with "Show older runs"; a refresh reloads that many, so the view is kept.
  let shown = $state(PAGE);
  let older = $state(false);
  const load = loader();
  $effect(() => { live.tick; const n = untrack(() => shown); load(api.runs(undefined, { limit: n }), (r) => { runs = r; error = null; }, (m) => (error = m)); });
  // Fewer than asked for means the list ends here; a full page may have more behind it.
  const maybeMore = $derived(runs !== null && runs.length >= shown);
  async function showOlder() {
    if (older || !runs) return;
    older = true;
    try {
      const more = await api.runs(undefined, { offset: runs.length, limit: PAGE });
      const seen = new Set(runs.map((r) => r.runId));
      runs = [...runs, ...more.filter((r) => !seen.has(r.runId))];
      // A short page means the list ends here, so the button goes away until new runs land.
      shown = more.length >= PAGE ? runs.length : runs.length + 1;
    } catch (e) { error = errorText(e); } finally { older = false; }
  }

  type Row = { agent: string; status: string; runs: RunSummary[] };
  const days = $derived.by(() => {
    const out: { day: string; rows: Row[]; cost: number; count: number }[] = [];
    for (const r of runs ?? []) {
      const day = dayLabel(r.startedAt);
      let d = out.at(-1);
      if (!d || d.day !== day) { d = { day, rows: [], cost: 0, count: 0 }; out.push(d); }
      d.cost += r.costUsd; d.count++;
      const last = d.rows.at(-1);
      if (last && last.agent === r.agent && last.status === r.status) last.runs.push(r);
      else d.rows.push({ agent: r.agent, status: r.status, runs: [r] });
    }
    return out;
  });
  let open = $state<Record<string, boolean>>({});
  const key = (row: Row) => row.runs[0]!.runId;
  const total = $derived((runs ?? []).reduce((s, r) => s + r.costUsd, 0));
  const summary = (r: RunSummary) => plainTimes(r.summary ?? "").replace(/\s+/g, " ").trim();
</script>

<section class="space-y-5">
  <div class="rise flex items-baseline justify-between">
    <h1 class="title">{t("Runs")}</h1>
    {#if runs?.length}<a href={href("cost")} class="tap text-[13px] text-mute hover:text-fg">{t("{total} total · Cost", { total: usd(total) })}</a>{/if}
  </div>
  {#if runs === null}
    {#if error}<LoadError message={error} />{:else}<Skeleton rows={6} h={44} />{/if}
  {:else if runs.length === 0}
    <Empty title={t("No runs yet")} hint={t("Open an agent and press Run now.")} />
  {:else}
    {#each days as d (d.day)}
      <div>
        <div class="mb-2 flex items-baseline justify-between text-[11px] text-mute">
          <span class="uppercase tracking-wider">{d.day}</span>
          <span>{d.count === 1 ? t("1 run") : t("{n} runs", { n: d.count })}{d.cost ? ` · ${usd(d.cost)}` : ""}</span>
        </div>
        <div class="panel divide-y divide-line">
          {#each d.rows as row (key(row))}
            {@const first = row.runs[0]!}
            {@const n = row.runs.length}
            {#if n === 1}
              <a href={href("run", first.agent, first.runId)} class="card-hover flex items-center gap-3 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
                <Mark name={first.agent} size={26} />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-2 text-[13.5px]">
                    <span class="font-medium">{first.agent}</span>
                    <Status status={first.status} />
                    <span class="ml-auto flex-none text-[12px] text-mute">{clock(first.startedAt)}</span>
                  </div>
                  <div class="truncate text-[12.5px] text-mute">{triggerLabel(first.trigger)}{summary(first) ? ` · ${summary(first)}` : ""}</div>
                </div>
              </a>
            {:else}
              {@const k = key(row)}
              {@const last = row.runs.at(-1)!}
              <div class="first:rounded-t-xl last:rounded-b-xl">
                <button class="card-hover flex w-full items-center gap-3 px-3 py-2.5 text-left" onclick={() => (open[k] = !open[k])} aria-expanded={Boolean(open[k])}>
                  <Mark name={first.agent} size={26} />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2 text-[13.5px]">
                      <span class="font-medium">{first.agent}</span>
                      <span class="text-mute"><span aria-hidden="true">×</span><span class="sr-only">{t("times")}</span> {n}</span>
                      <Status status={row.status} />
                      <span class="ml-auto flex-none text-[12px] text-mute">{clock(last.startedAt)} – {clock(first.startedAt)}</span>
                    </div>
                    <div class="truncate text-[12.5px] text-mute">{t("{n} runs, all {status}", { n, status: statusLabel(row.status) })}{summary(first) ? ` · ${t("latest: {summary}", { summary: summary(first) })}` : ""}</div>
                  </div>
                  <span class="flex-none text-mute transition-transform" style="transform: rotate({open[k] ? 90 : 0}deg)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>
                </button>
                {#if open[k]}
                  <div class="divide-y divide-line border-t hairline bg-bg/40">
                    {#each row.runs as r (r.runId)}
                      <a href={href("run", r.agent, r.runId)} class="card-hover flex items-center gap-3 py-2 pl-12 pr-3 text-[12.5px]">
                        <span class="text-fg-2">{clock(r.startedAt)}</span>
                        <span class="text-mute">{triggerLabel(r.trigger)}</span>
                        <span class="min-w-0 flex-1 truncate text-mute">{summary(r)}</span>
                        <span class="hidden flex-none text-mute sm:inline">{r.endedAt ? duration(r.startedAt, r.endedAt) : ""}</span>
                      </a>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
    <div class="flex flex-wrap items-center gap-3 text-[12.5px] text-mute">
      {#if maybeMore}
        <span>{t("Showing the newest {n} runs.", { n: runs.length })}</span>
        <button class="btn" disabled={older} onclick={showOlder}>{older ? t("Loading…") : t("Show older runs")}</button>
      {:else}
        <span>{runs.length === 1 ? t("That's the only run.") : t("All {n} runs are shown.", { n: runs.length })}</span>
      {/if}
      {#if error}<span role="alert" style="color: var(--color-bad)">{error}</span>{/if}
    </div>
  {/if}
</section>
