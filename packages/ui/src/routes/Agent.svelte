<script lang="ts">
  import { api, live, agentByName } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, when, statusLine, statusLabel, until, duration, tokens } from "../lib/format";
  import Mark from "../lib/components/Mark.svelte";
  import Status from "../lib/components/Status.svelte";
  import Budget from "../lib/components/Budget.svelte";
  import Timeline from "../lib/components/Timeline.svelte";
  import ReviewCard from "../lib/components/ReviewCard.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { Envelope, RunSummary } from "../lib/types";

  let { name }: { name: string } = $props();
  const a = $derived(agentByName(name));
  const pending = $derived(live.pending.filter((p) => p.agent === name));

  let runs = $state<RunSummary[] | null>(null);
  let liveEvents = $state<Envelope[] | null>(null);
  let note = $state("");
  let starting = $state(false);
  let error = $state<string | null>(null);

  $effect(() => { live.tick; name; api.runs(name).then((r) => (runs = r)); });
  // While working or waiting, stream the current run's events into the live panel.
  const currentRunId = $derived(a?.inFlight?.runId ?? pending[0]?.runId ?? null);
  $effect(() => {
    live.tick;
    const id = currentRunId;
    if (!id) { liveEvents = null; return; }
    api.run(name, id).then((e) => (liveEvents = e)).catch(() => (liveEvents = null));
  });
  const liveCost = $derived.by(() => {
    const last = [...(liveEvents ?? [])].reverse().find((e) => e.event.type === "model.turn" && e.event["totalCostUsd"] !== undefined);
    return (last?.event["totalCostUsd"] as number | undefined) ?? 0;
  });

  async function run() {
    if (!a) return;
    starting = true; error = null;
    try {
      const r = await api.startRun(name, note.trim() || undefined);
      note = "";
      live.tick++;
      if (r.runId) location.hash = href("agent", name); // stay here; live panel shows it
    } catch (e) { error = (e as Error).message; } finally { starting = false; }
  }
</script>

{#if !live.loaded}
  <Skeleton rows={3} h={80} />
{:else if !a}
  <Empty title="No agent called “{name}”" />
{:else}
  <section class="space-y-6">
    <!-- Header: the character -->
    <div class="rise flex flex-wrap items-start gap-4">
      <Mark name={a.name} size={56} status={a.status} />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 class="text-[24px] font-semibold tracking-tight">{a.name}</h1>
          <Status status={a.status === "scheduled" ? "idle" : a.status} />
        </div>
        <p class="mt-0.5 text-[14px] text-fg-2">{a.description || statusLine(a)}</p>
        {#if a.description}<p class="mt-0.5 text-[13px] text-mute">{statusLine(a)}</p>{/if}
        <div class="mt-3 flex flex-wrap gap-1.5">
          {#if a.model}<span class="chip mono">{a.model}</span>{/if}
          {#each a.tools as t}<span class="chip"><span class="dot" style="background: var(--color-fg-2)"></span>{t}</span>{/each}
          {#if a.policy}<span class="chip mono"><span style="color: var(--color-ok)">{a.policy.allow} allow</span>·<span style="color: var(--color-ask)">{a.policy.ask} ask</span>·<span style="color: var(--color-bad)">{a.policy.block} block</span></span>{/if}
          {#if a.sandbox}<span class="chip">sandboxed · net {a.sandbox.network}</span>{:else if a.configured}<span class="chip" style="color: var(--color-ask)">no sandbox</span>{/if}
          {#if a.cron}<span class="chip mono">⏱ {a.cron}{#if a.nextRun} · next {until(a.nextRun)}{/if}</span>{/if}
          {#if a.budget?.maxCostUsd}<span class="chip mono">cap {usd(a.budget.maxCostUsd)}/run</span>{:else if a.budget?.free}<span class="chip mono">$0 model</span>{/if}
          {#if a.source}<span class="chip mono text-mute">{a.source}</span>{/if}
        </div>
      </div>
      <div class="mono grid grid-cols-3 gap-4 text-right text-[12px] text-mute sm:ml-auto">
        <div><div>runs</div><div class="text-[18px] text-fg">{a.runs}</div></div>
        <div><div>today</div><div class="text-[18px] text-fg">{a.runsToday}</div></div>
        <div><div>spend today</div><div class="text-[18px] text-fg">{usd(a.costTodayUsd)}</div></div>
      </div>
    </div>

    <!-- Needs you -->
    {#each pending as r (r.id)}<ReviewCard req={r} />{/each}

    <!-- Composer -->
    {#if a.configured}
      <div class="panel-raised rise p-3">
        <textarea class="field" rows="2" placeholder="Anything to add for this run? (optional) — e.g. “focus on the open questions”" bind:value={note} disabled={a.status === "working" || a.status === "waiting"}></textarea>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <button class="btn btn-primary" disabled={starting || a.status === "working" || a.status === "waiting"} onclick={run}>
            {a.status === "working" ? "Working…" : a.status === "waiting" ? "Waiting for your decision" : starting ? "Starting…" : "Run now"}
          </button>
          <span class="text-[12.5px] text-mute">Runs under this agent's policy. Anything marked <span class="mono">ask</span> will pause here for you.</span>
          {#if error}<span class="text-[12.5px]" style="color: var(--color-bad)">{error}</span>{/if}
        </div>
      </div>
    {/if}

    <!-- Live run -->
    {#if currentRunId && liveEvents}
      <div class="panel-raised rise p-4" style="border-color: color-mix(in oklab, var(--color-accent) 30%, var(--color-line-2))">
        <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="dot pulse bg-accent"></span>
          <span class="text-[14px] font-medium">{a.status === "waiting" ? "Paused for you" : "Live"}</span>
          <span class="mono text-[12px] text-mute">{currentRunId}</span>
          {#if a.inFlight}<span class="mono text-[12px] text-mute">turn {a.inFlight.turn}{a.maxTurns ? ` / ${a.maxTurns}` : ""}</span>{/if}
          <div class="ml-auto"><Budget spent={liveCost} cap={a.budget?.maxCostUsd ?? null} free={a.budget?.free ?? false} /></div>
        </div>
        <Timeline events={liveEvents} compact />
      </div>
    {/if}

    <!-- History -->
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">History</h2>
      {#if runs === null}
        <Skeleton rows={3} h={48} />
      {:else if runs.length === 0}
        <Empty title="No runs yet" hint={a.configured ? "press Run now above" : ""} />
      {:else}
        <div class="panel divide-y divide-line">
          {#each runs.filter((r) => r.runId !== currentRunId) as r (r.runId)}
            <a href={href("run", r.agent, r.runId)} class="card-hover flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
              <Status status={r.status} />
              <span class="mono text-[12.5px] text-fg-2" title={r.startedAt}>{when(r.startedAt)}</span>
              <span class="mono text-[12px] text-mute">{r.trigger}</span>
              <span class="min-w-0 flex-1 truncate text-[13px] text-fg-2">{r.summary ?? ""}</span>
              <span class="mono text-[12px] text-mute">{r.turns}t · {tokens(r.inputTokens + r.outputTokens)} · {usd(r.costUsd, r.priced)} · {duration(r.startedAt, r.endedAt)}</span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </section>
{/if}
