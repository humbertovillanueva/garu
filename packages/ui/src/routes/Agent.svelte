<script lang="ts">
  import { api, live, agentByName, loader } from "../lib/api.svelte";
  import LoadError from "../lib/components/LoadError.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, humanTime, statusLine, until, duration, cronLabel, triggerLabel, plainTimes } from "../lib/format";
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
  import { isApp } from "../lib/server.svelte";
  import Icon from "../lib/components/Icon.svelte";

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
  const hasKeyboard = typeof window === "undefined" || !window.matchMedia("(hover: none)").matches;

  let loadError = $state<string | null>(null);
  const loadRuns = loader(), loadChat = loader();
  $effect(() => { live.tick; name; loadRuns(api.runs(name), (r) => (runs = r), (m) => (loadError = m)); });
  $effect(() => {
    live.tick; name;
    loadChat(api.chat(name), async (m) => {
      loadError = null;
      const first = messages === null;
      const grew = (messages?.length ?? 0) !== m.length;
      messages = m;
      // A new message scrolls into view; opening the page does not, so the page lands on the agent's name.
      if (grew && !first) { await tick(); bottom?.scrollIntoView({ behavior: "smooth", block: "end" }); }
    }, (m) => (loadError = m));
  });

  async function send() {
    const text = note.trim();
    if (!a || !text || starting) return;
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
    <div class="rise flex items-start gap-4">
      <Mark name={a.name} size={52} status={a.status} />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 class="text-[24px] font-semibold tracking-tight">{a.name}</h1>
          <Status status={a.status === "scheduled" ? "sleeping" : a.status} />
        </div>
        {#if a.persona?.tagline}<p class="mt-0.5 text-[14px] italic text-fg-2">“{a.persona.tagline}”</p>{/if}
        {#if a.description}<p class="mt-1 text-[14px] text-fg-2">{a.description}</p>{/if}
        <p class="mt-1 text-[13px] text-mute">{a.status === "needs-setup" ? (isApp ? "Needs setup on your computer" : statusLine(a)) : statusLine(a)}</p>
      </div>
    </div>

    <!-- Facts: what it runs on, what it can touch, when, for how much -->
    {#if a.configured}
      {@const total = (a.policy?.allow ?? 0) + (a.policy?.ask ?? 0) + (a.policy?.block ?? 0) || 1}
      {@const [provider, modelName] = (a.model ?? "").includes("/") ? (a.model as string).split("/", 2) as [string, string] : ["", a.model ?? ""]}
      <div class="rise facts">
        <div class="fact"><div class="k">Runs</div><div class="v" title={a.cron ?? ""}>{a.cron ? cronLabel(a.cron) : "when asked"}{#if a.nextRun && live.up}<span class="text-mute">&nbsp;· next {until(a.nextRun)}</span>{/if}</div></div>
        <div class="fact"><div class="k">History</div><div class="v">{a.runs} run{a.runs === 1 ? "" : "s"}{#if a.runsToday}<span class="text-mute">&nbsp;· {a.runsToday} today</span>{/if}</div></div>
        <div class="fact"><div class="k">Model</div><div class="v" title={a.model ?? ""}>{modelName}{#if provider}<span class="text-mute">&nbsp;· {provider}</span>{/if}</div></div>
        <div class="fact"><div class="k">Tools</div><div class="v" title={a.tools.join(", ")}>{a.tools.length ? a.tools.join(" · ") : "none"}</div></div>
        <div class="fact">
          <div class="k">Policy</div>
          <div class="v flex items-center gap-2">
            <span class="policybar w-16 flex-none" title="{a.policy?.allow} allow · {a.policy?.ask} ask · {a.policy?.block} block">
              <span style="width: {((a.policy?.allow ?? 0) / total) * 100}%; background: var(--color-ok)"></span>
              <span style="width: {((a.policy?.ask ?? 0) / total) * 100}%; background: var(--color-ask)"></span>
              <span style="width: {((a.policy?.block ?? 0) / total) * 100}%; background: var(--color-bad)"></span>
            </span>
            <span class="text-[11.5px] leading-tight text-mute">{a.policy?.allow} allow · {a.policy?.ask} ask · {a.policy?.block} block</span>
          </div>
        </div>
        <div class="fact"><div class="k">Limits</div><div class="v">{a.budget?.maxCostUsd ? `${usd(a.budget.maxCostUsd)} per run` : a.budget?.free ? "free model" : "no cap"}<span class="text-mute">&nbsp;· {a.sandbox ? `sandboxed, net ${a.sandbox.network}` : "no sandbox"}</span></div></div>
      </div>
    {/if}

    <!-- Conversation -->
    {#if messages === null}
      {#if loadError}<LoadError message={loadError} />{:else}<Skeleton rows={2} h={56} />{/if}
    {:else if messages.length === 0 && !currentRunId}
      <div class="rise rounded-xl border border-dashed hairline px-4 py-6 text-center text-[13.5px] text-fg-2">
        {#if a.configured}Say hello to {a.name}, or tell it to run. Anything it does goes through its policy and shows up here.{:else}This agent has no Garufile here, so it can't be messaged — only its history is available.{/if}
      </div>
    {:else}
      <Thread agent={a.name} messages={messages ?? []} />
    {/if}

    <!-- Live run, inline in the thread -->
    {#if currentRunId && liveEvents}
      <div class="panel-raised rise p-4" style="border-color: color-mix(in oklab, var(--color-ask) 30%, var(--color-line-2))">
        <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="dot pulse" style="background: var(--color-ask)"></span>
          <span class="text-[14px] font-medium">{a.status === "waiting" ? "Paused for you" : "Working"}</span>
          {#if a.inFlight}<span class="text-[12px] text-mute">turn {a.inFlight.turn}{a.maxTurns ? ` of ${a.maxTurns}` : ""}</span>{/if}
          <div class="ml-auto"><Budget spent={liveCost} cap={a.budget?.maxCostUsd ?? null} free={a.budget?.free ?? false} /></div>
        </div>
        <Timeline events={liveEvents} compact />
      </div>
    {/if}

    <!-- Needs you: right where the timeline stopped -->
    {#each pending as r (r.id)}<ReviewCard req={r} />{/each}

    <!-- Composer. While an approval is pending the review card is the input, so the composer steps aside. -->
    {#if a.configured && pending.length === 0 && a.status === "needs-setup"}
      <div class="panel-raised rise space-y-2 p-4 text-[13.5px] text-fg-2" style="border-color: color-mix(in oklab, var(--color-ask) 35%, var(--color-line-2))">
        {#if isApp}
          <div class="font-medium text-fg">{a.name} needs setup on your computer</div>
          <div>It can't run until {a.needs.length ? `${a.needs.length === 1 ? "a key it needs is" : "keys it needs are"} added` : ""}{a.needs.length && a.signIn.length ? " and " : ""}{a.signIn.length ? `you sign in to ${a.signIn.join(", ")}` : ""}. Open Garu on that computer to finish.</div>
        {:else}
          <div class="font-medium text-fg">{a.name} can't run yet</div>
          {#if a.needs.length}<div>Add <span class="mono text-fg">{a.needs.join(", ")}</span> to <span class="mono">.env</span>, then <span class="mono">npm run garu -- service restart</span>.</div>{/if}
          {#each a.signIn as srv}<div>Sign in to <span class="mono text-fg">{srv}</span> once: <span class="mono text-fg [overflow-wrap:anywhere]">npm run garu -- auth {a.source} {srv}</span></div>{/each}
        {/if}
      </div>
    {:else if a.configured && pending.length === 0}
      {@const busy = a.status === "working" || a.status === "waiting"}
      <div class="panel-raised rise sticky p-2" style="bottom: calc(0.75rem + var(--tabbar))">
        <div class="flex items-end gap-2">
          <textarea class="field min-h-[42px] flex-1 resize-none" rows="1" placeholder={busy ? (a.status === "working" ? `${a.name} is working…` : "Waiting for your decision above") : hasKeyboard ? `Message ${a.name}  (⌘↵)` : `Message ${a.name}`} bind:value={note} onkeydown={onKey} disabled={busy}
                    oninput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }}></textarea>
          <button class="btn btn-primary grid h-[42px] w-[42px] flex-none place-items-center rounded-full p-0" disabled={starting || !note.trim() || busy} onclick={send} aria-label="Send"><Icon name="send" size={18} /></button>
        </div>
        <div class="mt-1.5 flex items-center gap-2 px-1">
          <button class="btn py-1 text-[12.5px]" disabled={starting || busy} onclick={run} title="Run the agent's standing job now; a message above goes along as a note"><span class="inline-flex items-center gap-1"><Icon name="play" size={13} /> Run now</span></button>
          {#if error}<span class="text-[12.5px]" style="color: var(--color-bad)">{error}</span>{/if}
        </div>
      </div>
    {/if}
    <div bind:this={bottom}></div>

    <!-- History -->
    <div>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-[11px] uppercase tracking-wider text-mute">Runs</h2>
        {#if (runs?.length ?? 0) > 5}<button class="tap text-[11.5px] text-mute hover:text-fg" onclick={() => (showAllRuns = !showAllRuns)}>{showAllRuns ? "show fewer" : `show all ${runs!.length}`}</button>{/if}
      </div>
      {#if runs === null}
        {#if loadError}<LoadError message={loadError} />{:else}<Skeleton rows={3} h={48} />{/if}
      {:else if runs.length === 0}
        <div class="text-[13px] text-mute">No runs yet.</div>
      {:else}
        <div class="panel divide-y divide-line">
          {#each (showAllRuns ? runs : runs.slice(0, 5)).filter((r) => r.runId !== currentRunId) as r (r.runId)}
            <a href={href("run", r.agent, r.runId)} class="card-hover flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
              <Status status={r.status} />
              <span class="text-[12.5px] text-fg-2">{humanTime(r.startedAt)}</span>
              <span class="text-[12px] text-mute">{triggerLabel(r.trigger)}</span>
              <span class="min-w-0 flex-1 truncate text-[13px] text-fg-2">{plainTimes(r.summary ?? "")}</span>
              <span class="hidden text-[12px] text-mute sm:inline">{usd(r.costUsd, r.priced)}{r.endedAt ? ` · ${duration(r.startedAt, r.endedAt)}` : ""}</span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </section>
{/if}
