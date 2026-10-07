<script lang="ts">
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { when } from "../lib/format";
  import Empty from "../lib/components/Empty.svelte";
  import type { ApprovalRequest } from "../lib/types";

  let pending = $state<ApprovalRequest[]>([]);
  let recent = $state<ApprovalRequest[]>([]);
  let loaded = $state(false);
  let busy = $state<string | null>(null);
  let error = $state<string | null>(null);
  $effect(() => {
    live.tick;
    api.inbox().then((r) => { pending = r.pending; recent = r.recent.filter((x) => x.decision); loaded = true; });
  });
  async function decide(id: string, approve: boolean) {
    busy = id; error = null;
    try { await api.decide(id, approve); live.tick++; } catch (e) { error = String(e); } finally { busy = null; }
  }
  const minsLeft = (iso: string) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
</script>

<section class="space-y-6">
  <div>
    <h1 class="text-xl font-semibold tracking-tight">Inbox</h1>
    <p class="mt-1 text-[13px] text-mute">Tool calls paused on an <span class="mono">ask</span> rule. Nothing runs until you decide; silence is a deny.</p>
  </div>

  {#if error}<div class="panel border-bad/40 px-4 py-2 text-[13px]" style="color: var(--color-bad)">{error}</div>{/if}

  {#if !loaded}
    <div class="text-[13px] text-mute">loading…</div>
  {:else if pending.length === 0}
    <Empty title="Nothing waiting for you" hint="agents are either running inside their policy, or idle" />
  {:else}
    <div class="space-y-3">
      {#each pending as r (r.id)}
        <div class="panel border-accent/40 p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2 text-[13px]">
                <span class="font-medium">{r.agent}</span>
                <span class="text-mute">wants</span>
                <span class="mono">{r.tool}</span>
              </div>
              <div class="mt-1 text-[13px] text-fg-2">{r.reason}</div>
              <div class="mono mt-1 text-[11px] text-mute">{r.id} · asked {when(r.createdAt)} · expires in {minsLeft(r.expiresAt)}m · <a class="hover:text-fg" href={href("run", r.agent, r.runId)}>open run</a></div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-ok" disabled={busy === r.id} onclick={() => decide(r.id, true)}>Approve</button>
              <button class="btn btn-bad" disabled={busy === r.id} onclick={() => decide(r.id, false)}>Deny</button>
            </div>
          </div>
          <pre class="mono mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-bg/60 p-3 text-[12px] text-fg-2">{JSON.stringify(r.args, null, 2)}</pre>
        </div>
      {/each}
    </div>
  {/if}

  {#if recent.length > 0}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wide text-mute">Recently decided</h2>
      <div class="panel divide-y divide-line">
        {#each recent as r (r.id)}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
            <span class="dot" style="background: {r.decision?.approved ? 'var(--color-ok)' : 'var(--color-bad)'}"></span>
            <span class="font-medium">{r.agent}</span>
            <span class="mono text-fg-2">{r.tool}</span>
            <span class="text-mute">{r.decision?.approved ? "approved" : "denied"} by {r.decision?.by}</span>
            <span class="mono ml-auto text-[11px] text-mute">{when(r.decision?.at)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>
