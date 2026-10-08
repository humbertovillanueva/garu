<script lang="ts">
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, when, dayLabel, statusLabel, statusLine } from "../lib/format";
  import Mark from "../lib/components/Mark.svelte";
  import ReviewCard from "../lib/components/ReviewCard.svelte";
  import SuggestionCard from "../lib/components/SuggestionCard.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { FeedItem, ApprovalRequest } from "../lib/types";

  let feed = $state<FeedItem[] | null>(null);
  $effect(() => { live.tick; api.feed(60).then((f) => (feed = f)); });

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

  // Feed minus pending approvals (they get their own cards up top), grouped by day.
  const groups = $derived.by(() => {
    const items = (feed ?? []).filter((i) => i.kind !== "approval.pending" && i.kind !== "run.start");
    const out: { day: string; items: FeedItem[] }[] = [];
    for (const i of items) {
      const day = dayLabel(i.ts);
      const g = out.at(-1);
      if (g && g.day === day) g.items.push(i); else out.push({ day, items: [i] });
    }
    return out;
  });
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
      {:else}Quiet so far today. Nothing needs you.{/if}
    </p>
  </div>

  {#if live.loaded}
    <div class="rise grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="panel stat"><div class="k">Agents</div><div class="v">{live.agents.length}</div><div class="s">{scheduled} on a schedule{live.up ? "" : " · not running"}</div></div>
      <div class="panel stat"><div class="k">Runs today</div><div class="v">{runsToday}</div><div class="s">{totalRuns} all time</div></div>
      <div class="panel stat"><div class="k">Spend today</div><div class="v">{usd(spendToday)}</div><div class="s">estimated at list price</div></div>
      <a href={href("inbox")} class="panel stat card-hover"><div class="k">Waiting on you</div><div class="v" style="color: {live.pending.length ? 'var(--color-accent)' : 'inherit'}">{live.pending.length}</div><div class="s">{live.pending.length ? "open the inbox" : "nothing to approve"}</div></a>
    </div>
  {/if}

  {#if firstRun}
    <div class="panel-raised rise p-5">
      <div class="mb-1 text-[15px] font-semibold">Welcome. Three steps to your first agent.</div>
      <p class="mb-4 text-[13.5px] text-fg-2">Garu runs agents that can only act through a policy you wrote. Nothing happens without a rule allowing it, or you approving it.</p>
      <ol class="grid gap-3 text-[13.5px] sm:grid-cols-3">
        <li class="rounded-lg border hairline bg-bg/40 p-3"><div class="mono mb-1 text-[11px] text-mute">1</div><div class="font-medium">Run <span class="mono">hello</span></div><div class="mt-0.5 text-fg-2">Open <a class="underline hover:text-fg" href={href("agent", "hello")}>hello</a> and press <span class="font-medium text-fg">Run job</span>. It reads a notes file and asks before writing a summary.</div></li>
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
            <span class="mono truncate text-[12.5px]" style="color: var(--color-ask)">{[...a.needs.map((v) => `add ${v} to .env`), ...a.signIn.map((s) => `garu auth ${a.source} ${s}`)].join(" · ")}</span>
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
      <Skeleton rows={4} h={52} />
    {:else if groups.length === 0}
      <Empty title="Nothing has happened yet" hint="garu run examples/hello/Garufile.yaml">
        {#if live.agents.length}<p class="text-[13px] text-fg-2">Or pick an agent on the left and press Run.</p>{/if}
      </Empty>
    {:else}
      {#each groups as g (g.day)}
        <div class="mb-5">
          <div class="mono mb-2 text-[11px] text-mute">{g.day}</div>
          <div class="panel divide-y divide-line">
            {#each g.items as i (i.ts + i.kind + i.runId)}
              {@const d = i.detail as { turns?: number; costUsd?: number; toolCalls?: { allow: number; ask: number; block: number } } | ApprovalRequest | undefined}
              <a href={href("run", i.agent, i.runId)} class="card-hover flex items-start gap-3 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
                <Mark name={i.agent} size={26} />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
                    <span class="font-medium">{i.agent}</span>
                    {#if i.kind.startsWith("run.")}
                      <span style="color: {kindColor(i.kind)}">{statusLabel(i.kind.slice(4))}</span>
                      {#if d && "turns" in d}<span class="mono text-[11.5px] text-mute">{d.turns} turns · {usd(d.costUsd ?? 0)}{d.toolCalls?.block ? ` · ${d.toolCalls.block} blocked` : ""}</span>{/if}
                    {:else if i.kind === "approval.decided"}
                      {@const r = d as ApprovalRequest}
                      <span class="text-fg-2">{r.decision?.approved ? "approved" : "declined"}</span>
                      <span class="mono text-[12px]">{i.text}</span>
                      <span class="mono text-[11.5px] text-mute">by {r.decision?.by}</span>
                    {/if}
                  </div>
                  {#if i.kind.startsWith("run.") && i.text && i.text !== i.kind.slice(4)}
                    <div class="mt-0.5 line-clamp-2 text-[13px] text-fg-2">{i.text}</div>
                  {/if}
                </div>
                <span class="mono flex-none text-[11px] text-mute" title={i.ts}>{when(i.ts)}</span>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</section>
