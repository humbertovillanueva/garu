<script lang="ts">
  import { api, live, loader } from "../lib/api.svelte";
  import LoadError from "../lib/components/LoadError.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, clock, dayLabel, statusLabel, statusLine, until, cronLabel, humanTime, plainTimes } from "../lib/format";
  import Mark from "../lib/components/Mark.svelte";
  import ReviewCard from "../lib/components/ReviewCard.svelte";
  import SuggestionCard from "../lib/components/SuggestionCard.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { FeedItem, ApprovalRequest } from "../lib/types";
  import { isApp } from "../lib/server.svelte";

  let feed = $state<FeedItem[] | null>(null);
  let feedError = $state<string | null>(null);
  const load = loader();
  $effect(() => { live.tick; load(api.feed(60), (f) => { feed = f; feedError = null; }, (m) => (feedError = m)); });

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const runsToday = $derived(live.agents.reduce((s, a) => s + a.runsToday, 0));
  const spendToday = $derived(live.agents.reduce((s, a) => s + a.costTodayUsd, 0));
  const working = $derived(live.agents.filter((a) => a.status === "working"));
  const active = $derived(live.agents.filter((a) => a.status !== "idle" && a.status !== "needs-setup" || a.pending > 0));
  const needsSetup = $derived(live.agents.filter((a) => a.status === "needs-setup"));
  const totalRuns = $derived(live.agents.reduce((s, a) => s + a.runs, 0));
  const scheduled = $derived(live.agents.filter((a) => a.cron && a.status !== "needs-setup").length);
  // First week: show the way in until there's real history.
  const firstRun = $derived(live.loaded && totalRuns < 3);

  // What fires next, across every scheduled agent.
  const nextUp = $derived.by(() => live.agents.filter((a) => a.nextRun && a.status === "scheduled").sort((a, b) => a.nextRun!.localeCompare(b.nextRun!))[0] ?? null);

  // Feed minus pending approvals (they get their own cards up top), grouped by day. An agent that
  // finished several runs in a row with the same outcome takes one line, so a heartbeat doesn't bury the day.
  type Row = { items: FeedItem[] };
  const groups = $derived.by(() => {
    const items = (feed ?? []).filter((i) => i.kind !== "approval.pending" && i.kind !== "run.start");
    const out: { day: string; rows: Row[] }[] = [];
    for (const i of items) {
      const day = dayLabel(i.ts);
      let g = out.at(-1);
      if (!g || g.day !== day) { g = { day, rows: [] }; out.push(g); }
      const last = g.rows.at(-1);
      const prev = last?.items[0];
      if (prev && prev.agent === i.agent && prev.kind === i.kind && i.kind.startsWith("run.")) last.items.push(i);
      else g.rows.push({ items: [i] });
    }
    return out;
  });
  const oneLine = (t: string) => plainTimes(t).replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
  const kindColor = (k: string) => k === "run.ok" ? "var(--color-ok)" : k.startsWith("run.") ? "var(--color-bad)" : "var(--color-mute)";
</script>

<section class="space-y-8">
  <div class="rise">
    <h1 class="text-[26px] font-semibold tracking-tight">{greeting}.</h1>
    <p class="mt-1 text-[14px] text-fg-2">
      {#if !live.loaded}Loading your agents…
      {:else if live.pending.length}<span class="font-medium text-fg">{live.pending.length} decision{live.pending.length === 1 ? "" : "s"}</span> waiting for you.
      {:else if working.length}{working.map((a) => a.name).join(", ")} {working.length === 1 ? "is" : "are"} working right now.
      {:else if runsToday}{runsToday} run{runsToday === 1 ? "" : "s"} today from {live.agents.filter((a) => a.runsToday).length} of your {live.agents.length} agents, {usd(spendToday)} estimated. Nothing needs you.
      {:else if !live.up && scheduled}Nothing has run today, and nothing will: schedules are off.
      {:else}Quiet so far today. Nothing needs you.{/if}
    </p>
  </div>

  {#if live.loaded}
    <div class="rise space-y-2">
      {#if !live.up}
        <div class="panel flex items-center gap-3 px-4 py-3 text-[13.5px]" style="border-color: color-mix(in oklab, var(--color-ask) 35%, var(--color-line))">
          <span class="dot" style="background: var(--color-ask)"></span>
          <div class="min-w-0"><div class="font-medium">Schedules are off</div><div class="text-[12.5px] text-fg-2">{isApp ? "Garu on your computer is running, but not its schedules. Start it there with the login service." : "Start Garu with --up, or install the login service, and the schedules below will fire."}</div></div>
        </div>
      {:else if nextUp}
        <a href={href("agent", nextUp.name)} class="panel card-hover flex items-center gap-3 px-4 py-3 text-[13.5px]">
          <Mark name={nextUp.name} size={28} status={nextUp.status} />
          <div class="min-w-0 flex-1"><div><span class="text-mute">Next up:</span> <span class="font-medium">{nextUp.name}</span>, {until(nextUp.nextRun)}</div><div class="truncate text-[12.5px] text-mute">{nextUp.description || cronLabel(nextUp.cron)}</div></div>
        </a>
      {/if}
      <div class="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[12.5px] text-mute">
        <span>{live.agents.length} agent{live.agents.length === 1 ? "" : "s"}</span><span>·</span>
        <span>{scheduled} on a schedule</span><span>·</span>
        <span>{runsToday} run{runsToday === 1 ? "" : "s"} today</span>
        {#if spendToday}<span>·</span><span>{usd(spendToday)} today</span>{/if}
      </div>
    </div>
  {/if}

  {#if firstRun && !isApp}
    <div class="panel-raised rise p-5">
      <div class="mb-1 text-[15px] font-semibold">Welcome. Three steps to your first agent.</div>
      <p class="mb-4 text-[13.5px] text-fg-2">Garu runs agents that can only act through a policy you wrote. Nothing happens without a rule allowing it, or you approving it.</p>
      <ol class="grid gap-3 text-[13.5px] sm:grid-cols-3">
        <li class="rounded-lg border hairline bg-bg/40 p-3"><div class="mono mb-1 text-[11px] text-mute">1</div><div class="font-medium">Run pip</div><div class="mt-0.5 text-fg-2">Open <a class="underline hover:text-fg" href={href("agent", "pip")}>pip</a> and press <span class="font-medium text-fg">Run now</span>. It reads a notes file and asks before writing a summary.</div></li>
        <li class="rounded-lg border hairline bg-bg/40 p-3"><div class="mono mb-1 text-[11px] text-mute">2</div><div class="font-medium">Approve it</div><div class="mt-0.5 text-fg-2">The pause is the product. Approve once, approve for 24h, or decline with a note it reads.</div></li>
        <li class="rounded-lg border hairline bg-bg/40 p-3"><div class="mono mb-1 text-[11px] text-mute">3</div><div class="font-medium">Make your own</div><div class="mt-0.5 text-fg-2"><span class="mono">npm run garu -- new</span> asks what it should do and writes a Garufile with a closed policy.</div></li>
      </ol>
    </div>
  {/if}

  {#if needsSetup.length}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">Needs setup</h2>
      <div class="panel divide-y divide-line">
        {#each needsSetup as a (a.name)}
          <a href={href("agent", a.name)} class="card-hover flex items-center gap-3 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
            <Mark name={a.name} size={26} status={a.status} />
            <span class="font-medium">{a.name}</span>
            <span class="min-w-0 text-[12.5px] [overflow-wrap:anywhere]" style="color: var(--color-ask)">{isApp ? "needs setup on your computer" : [...a.needs.map((v) => `add ${v} to .env`), ...a.signIn.map((s) => `npm run garu -- auth ${a.source} ${s}`)].join(" · ")}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  {#if live.pending.length || live.suggestions.length}
    <div class="space-y-3">
      <h2 class="text-[11px] uppercase tracking-wider text-mute">Needs you</h2>
      {#each live.pending as r (r.id)}<ReviewCard req={r} />{/each}
      {#each live.suggestions.slice(0, 2) as s (s.id)}<SuggestionCard {s} />{/each}
    </div>
  {/if}

  {#if active.length}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">Right now</h2>
      <div class="grid gap-2 sm:grid-cols-2">
        {#each active as a (a.name)}
          <a href={href("agent", a.name)} class="panel card-hover rise flex items-center gap-3 px-3 py-2.5">
            <Mark name={a.name} size={30} status={a.status} />
            <div class="min-w-0">
              <div class="truncate text-[14px] font-medium">{a.name}</div>
              <div class="truncate text-[12.5px] text-fg-2">{statusLine(a)}</div>
            </div>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  <div>
    <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">Activity</h2>
    {#if feed === null}
      {#if feedError}<LoadError message={feedError} />{:else}<Skeleton rows={4} h={52} />{/if}
    {:else if groups.length === 0}
      <Empty title="Nothing has happened yet" hint={isApp ? "When an agent runs, what it did shows up here." : "Run one with npm run garu -- run examples/pip/Garufile.yaml in your Garu folder."}>
        {#if live.agents.length}<p class="text-[13px] text-fg-2">Or open an agent in Agents and press Run now.</p>{/if}
      </Empty>
    {:else}
      {#each groups as g (g.day)}
        <div class="mb-5">
          <div class="mb-2 text-[11px] uppercase tracking-wider text-mute">{g.day}</div>
          <div class="panel divide-y divide-line">
            {#each g.rows as row (row.items[0]!.ts + row.items[0]!.kind + row.items[0]!.runId)}
              {@const i = row.items[0]!}
              {@const n = row.items.length}
              {@const d = i.detail as ApprovalRequest | undefined}
              <a href={n === 1 ? href("run", i.agent, i.runId) : href("agent", i.agent)} class="card-hover flex items-center gap-3 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
                <Mark name={i.agent} size={26} />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-2 text-[13.5px]">
                    <span class="font-medium">{i.agent}</span>
                    {#if n > 1}<span class="text-mute">× {n}</span>{/if}
                    {#if i.kind.startsWith("run.")}
                      <span style="color: {kindColor(i.kind)}">{statusLabel(i.kind.slice(4))}</span>
                    {:else if i.kind === "approval.decided"}
                      <span class="text-fg-2">{d?.decision?.approved ? "approved" : /expired/.test(d?.decision?.by ?? "") ? "expired" : "declined"}</span>
                    {/if}
                    <span class="ml-auto flex-none text-[12px] text-mute" title={humanTime(i.ts)}>{n === 1 ? clock(i.ts) : `${clock(row.items.at(-1)!.ts)} – ${clock(i.ts)}`}</span>
                  </div>
                  {#if i.kind === "approval.decided"}
                    <div class="truncate text-[12.5px] text-mute">{i.text}</div>
                  {:else if i.text && i.text !== i.kind.slice(4)}
                    <div class="truncate text-[12.5px] text-mute">{oneLine(i.text)}</div>
                  {/if}
                </div>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</section>
