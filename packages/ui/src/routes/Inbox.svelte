<script lang="ts">
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { when, until } from "../lib/format";
  import ReviewCard from "../lib/components/ReviewCard.svelte";
  import SuggestionCard from "../lib/components/SuggestionCard.svelte";
  import Mark from "../lib/components/Mark.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { ApprovalRequest } from "../lib/types";

  let recent = $state<ApprovalRequest[] | null>(null);
  let busy = $state(false);
  $effect(() => { live.tick; api.inbox().then((r) => (recent = r.recent.filter((x) => x.decision))); });
  async function batch(approve: boolean) {
    busy = true;
    try { await api.batch(live.pending.map((p) => p.id), approve); live.tick++; } finally { busy = false; }
  }
  async function revoke(id: string) { await api.revokeGrant(id); live.tick++; }
  // The empty state is what you see most of the time, so it says what happens next.
  const nextUp = $derived.by(() => {
    const soon = live.agents.filter((a) => a.nextRun && a.status === "scheduled").sort((a, b) => a.nextRun!.localeCompare(b.nextRun!))[0];
    return soon ? `Next up: ${soon.name}, ${until(soon.nextRun)}.` : live.up ? "No schedules are set." : "Schedules aren't running right now.";
  });
</script>

<section class="space-y-6">
  <div class="rise">
    <h1 class="text-[24px] font-semibold tracking-tight">Inbox</h1>
  </div>

  {#if !live.loaded}
    <Skeleton rows={2} h={160} />
  {:else if live.pending.length === 0}
    <Empty title="Nothing waiting for you" hint={nextUp} />
  {:else}
    {#if live.pending.length > 1}
      <div class="flex flex-wrap items-center gap-2 text-[13px]">
        <span class="text-fg-2">{live.pending.length} waiting.</span>
        <button class="btn btn-ok" disabled={busy} onclick={() => batch(true)}>Approve all</button>
        <button class="btn btn-bad" disabled={busy} onclick={() => batch(false)}>Decline all</button>
        <span class="text-[12px] text-mute">Read them first; "all" means all.</span>
      </div>
    {/if}
    <div class="space-y-3">{#each live.pending as r (r.id)}<ReviewCard req={r} />{/each}</div>
  {/if}

  {#if live.suggestions.length}
    <div class="space-y-3">
      <h2 class="text-[11px] uppercase tracking-wider text-mute">Garu noticed</h2>
      {#each live.suggestions as s (s.id)}<SuggestionCard {s} />{/each}
    </div>
  {/if}

  {#if live.grants.length}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">Temporary allows</h2>
      <div class="panel divide-y divide-line">
        {#each live.grants as g (g.id)}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px]">
            <Mark name={g.agent} size={22} />
            <span class="mono min-w-0 flex-1 basis-40 break-all text-fg-2">{g.label}</span>
            <span class="text-[12px] text-mute">until {until(g.expiresAt).replace(/^in /, "")} · used {g.uses}×</span>
            <button class="btn ml-auto py-1 text-[12px]" onclick={() => revoke(g.id)}>Revoke</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if recent && recent.length}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">Recently decided</h2>
      <div class="panel divide-y divide-line">
        {#each recent as r (r.id)}
          <a href={href("run", r.agent, r.runId)} class="card-hover flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px] first:rounded-t-xl last:rounded-b-xl">
            <Mark name={r.agent} size={22} />
            <span class="font-medium">{r.agent}</span>
            <span class="mono text-fg-2">{r.tool}</span>
            <span style="color: {r.decision?.approved ? 'var(--color-ok)' : 'var(--color-bad)'}">{r.decision?.approved ? "approved" : "declined"}</span>
            <span class="text-mute">by {r.decision?.by}</span>
            {#if r.decision?.note}<span class="italic text-fg-2">“{r.decision.note}”</span>{/if}
            <span class="ml-auto text-[11.5px] text-mute">{when(r.decision?.at)}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}
</section>
