<script lang="ts">
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { when } from "../lib/format";
  import ReviewCard from "../lib/components/ReviewCard.svelte";
  import Mark from "../lib/components/Mark.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { ApprovalRequest } from "../lib/types";

  let recent = $state<ApprovalRequest[] | null>(null);
  $effect(() => { live.tick; api.inbox().then((r) => (recent = r.recent.filter((x) => x.decision))); });
</script>

<section class="space-y-6">
  <div class="rise">
    <h1 class="text-[24px] font-semibold tracking-tight">Inbox</h1>
    <p class="mt-1 text-[14px] text-fg-2">Actions paused on an <span class="mono">ask</span> rule. Nothing runs until you decide; if you don't, it's a no.</p>
  </div>

  {#if !live.loaded}
    <Skeleton rows={2} h={160} />
  {:else if live.pending.length === 0}
    <Empty title="Nothing waiting for you" hint="your agents are either inside their policy, or idle" />
  {:else}
    <div class="space-y-3">{#each live.pending as r (r.id)}<ReviewCard req={r} />{/each}</div>
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
            <span class="mono ml-auto text-[11px] text-mute">{when(r.decision?.at)}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}
</section>
