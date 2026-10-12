<script lang="ts">
  // How much of this run's budget is spent. Fills amber, turns red near the cap.
  import { usd } from "../format";
  import { t } from "../i18n.svelte";
  let { spent, cap, free = false }: { spent: number; cap: number | null; free?: boolean } = $props();
  const pct = $derived(cap ? Math.min(100, (spent / cap) * 100) : 0);
  const color = $derived(pct > 85 ? "var(--color-bad)" : "var(--color-accent)");
</script>

<div class="min-w-[160px]">
  <div class="flex justify-between text-[11.5px] text-mute tabular-nums">
    <span>{free ? t("$0 · local/free") : usd(spent)}</span>
    {#if cap}<span>{t("cap {cap}", { cap: usd(cap) })}</span>{:else if !free}<span>{t("no cap")}</span>{/if}
  </div>
  <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel-3">
    {#if cap}<div class="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style="width:{pct}%; background:{color}"></div>{/if}
  </div>
</div>
