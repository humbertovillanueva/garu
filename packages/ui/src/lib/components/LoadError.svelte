<script lang="ts">
  /** In place of a skeleton when a view's data didn't come: what happened, and a way to try again. */
  import { refreshNow, live } from "../api.svelte";
  let { message }: { message: string } = $props();
</script>

<div class="panel rise flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px]" role="status">
  <span class="dot flex-none" style="background: var(--color-ask)"></span>
  <span class="min-w-0 flex-1 text-fg-2">{message}</span>
  <button class="btn" disabled={live.refreshing} onclick={() => refreshNow()}>{live.refreshing ? "Trying…" : "Try again"}</button>
</div>
