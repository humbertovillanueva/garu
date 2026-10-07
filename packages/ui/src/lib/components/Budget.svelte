<script lang="ts">
  // How much of this run's budget is spent. Fills amber, turns red near the cap.
  import { usd } from "../format";
  let { spent, cap, free = false }: { spent: number; cap: number | null; free?: boolean } = $props();
  const pct = $derived(cap ? Math.min(100, (spent / cap) * 100) : 0);
  const color = $derived(pct > 85 ? "var(--color-bad)" : "var(--color-accent)");
</script>

<div class="min-w-[160px]">
  <div class="mono flex justify-between text-[11px] text-mute">
    <span>{free ? "$0 · local/free" : usd(spent)}</span>
    {#if cap}<span>cap {usd(cap)}</span>{:else if !free}<span>no cap</span>{/if}
  </div>
  <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel-3">
    {#if cap}<div class="h-full rounded-full transition-[width] duration-500" style="width:{pct}%; background:{color}"></div>{/if}
  </div>
</div>
