<script lang="ts">
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, when, dayLabel, statusLabel, statusLine } from "../lib/format";
  import Mark from "../lib/components/Mark.svelte";
  import ReviewCard from "../lib/components/ReviewCard.svelte";
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
  const active = $derived(live.agents.filter((a) => a.status !== "idle" || a.pending > 0));

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
      {:else if runsToday}{runsToday} run{runsToday === 1 ? "" : "s"} today across {live.agents.filter((a) => a.runsToday).length} agent{live.agents.filter((a) => a.runsToday).length === 1 ? "" : "s"}, {usd(spendToday)} estimated. Nothing needs you.
      {:else}Quiet so far today. Nothing needs you.{/if}
    </p>
  </div>

  {#if live.pending.length}
    <div class="space-y-3">
      <h2 class="text-[11px] uppercase tracking-wider text-mute">Needs you</h2>
      {#each live.pending as r (r.id)}<ReviewCard req={r} />{/each}
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
