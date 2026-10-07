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
  import Thread from "../lib/components/Thread.svelte";
  import type { ChatMessage, Envelope, RunSummary } from "../lib/types";
  import { tick } from "svelte";

  let { name }: { name: string } = $props();
  const a = $derived(agentByName(name));
  const pending = $derived(live.pending.filter((p) => p.agent === name));

  let runs = $state<RunSummary[] | null>(null);
  let liveEvents = $state<Envelope[] | null>(null);
  let messages = $state<ChatMessage[] | null>(null);
  let note = $state("");
  let starting = $state(false);
  let error = $state<string | null>(null);
  let showAllRuns = $state(false);
  let bottom = $state<HTMLDivElement | null>(null);

  $effect(() => { live.tick; name; api.runs(name).then((r) => (runs = r)); });
  $effect(() => {
    live.tick; name;
    api.chat(name).then(async (m) => {
      const grew = (messages?.length ?? 0) !== m.length;
      messages = m;
      if (grew) { await tick(); bottom?.scrollIntoView({ behavior: "smooth", block: "end" }); }
    });
  });

  async function send() {
    const text = note.trim();
    if (!a || !text) return;
    starting = true; error = null;
    try {
      await api.send(name, text);
      note = "";
      live.tick++;
    } catch (e) { error = (e as Error).message; } finally { starting = false; }
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
  }
  // While working or waiting, stream the current run's events into the live panel.
  const currentRunId = $derived(a?.inFlight?.runId ?? pending[0]?.runId ?? null);
  $effect(() => {
    live.tick;
    const id = currentRunId;
    if (!id) { liveEvents = null; return; }
    api.run(name, id).then((e) => (liveEvents = e)).catch(() => (liveEvents = null));
  });
  // Follow the run as it grows, unless the reader has scrolled up to study something.
  let seenLive = 0, seenPending = 0;
  $effect(() => {
    const n = liveEvents?.length ?? 0, p = pending.length;
    if (n <= seenLive && p <= seenPending) { seenLive = n; seenPending = p; return; }
    seenLive = n; seenPending = p;
    void tick().then(() => {
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 320;
      if (nearBottom || p > 0) bottom?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
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

    <!-- Conversation -->
    {#if messages === null}
      <Skeleton rows={2} h={56} />
    {:else if messages.length === 0 && !currentRunId}
      <div class="rise rounded-xl border border-dashed hairline px-4 py-6 text-center text-[13.5px] text-fg-2">
        {#if a.configured}Say hello to {a.name}, or tell it to run. Anything it does goes through its policy and shows up here.{:else}This agent has no Garufile here, so it can't be messaged — only its history is available.{/if}
      </div>
    {:else}
      <Thread agent={a.name} messages={messages ?? []} />
    {/if}

    <!-- Live run, inline in the thread -->
    {#if currentRunId && liveEvents}
      <div class="panel-raised rise p-4" style="border-color: color-mix(in oklab, var(--color-accent) 30%, var(--color-line-2))">
        <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="dot pulse bg-accent"></span>
          <span class="text-[14px] font-medium">{a.status === "waiting" ? "Paused for you" : "Working"}</span>
          <span class="mono text-[12px] text-mute">{currentRunId}</span>
          {#if a.inFlight}<span class="mono text-[12px] text-mute">turn {a.inFlight.turn}{a.maxTurns ? ` / ${a.maxTurns}` : ""}</span>{/if}
          <div class="ml-auto"><Budget spent={liveCost} cap={a.budget?.maxCostUsd ?? null} free={a.budget?.free ?? false} /></div>
        </div>
        <Timeline events={liveEvents} compact />
      </div>
    {/if}

    <!-- Needs you: right where the timeline stopped -->
    {#each pending as r (r.id)}<ReviewCard req={r} />{/each}
    <div bind:this={bottom}></div>

    <!-- Composer -->
    {#if a.configured}
      <div class="panel-raised rise sticky p-3" style="bottom: calc(1rem + var(--tabbar))">
        <textarea class="field" rows="2" placeholder="Message {a.name}… (⌘↵ to send)" bind:value={note} onkeydown={onKey} disabled={a.status === "working" || a.status === "waiting"}></textarea>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <button class="btn btn-primary" disabled={starting || !note.trim() || a.status === "working" || a.status === "waiting"} onclick={send}>
            {a.status === "working" ? "Working…" : a.status === "waiting" ? "Waiting for your decision" : starting ? "Sending…" : "Send"}
          </button>
          <button class="btn" disabled={starting || a.status === "working" || a.status === "waiting"} onclick={run} title="Run the agent's standing job, with the message above as a note if any">Run job</button>
          <span class="text-[12.5px] text-mute">Replies and work both go through this agent's policy. <span class="mono">ask</span> pauses here for you.</span>
          {#if error}<span class="text-[12.5px]" style="color: var(--color-bad)">{error}</span>{/if}
        </div>
      </div>
    {/if}

    <!-- History -->
    <div>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-[11px] uppercase tracking-wider text-mute">Runs</h2>
        {#if (runs?.length ?? 0) > 5}<button class="mono text-[11px] text-mute hover:text-fg" onclick={() => (showAllRuns = !showAllRuns)}>{showAllRuns ? "show fewer" : `show all ${runs!.length}`}</button>{/if}
      </div>
      {#if runs === null}
        <Skeleton rows={3} h={48} />
      {:else if runs.length === 0}
        <div class="text-[13px] text-mute">No runs yet.</div>
      {:else}
        <div class="panel divide-y divide-line">
          {#each (showAllRuns ? runs : runs.slice(0, 5)).filter((r) => r.runId !== currentRunId) as r (r.runId)}
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
