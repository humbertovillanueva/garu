<script lang="ts">
  let { action, label }: { action: "allow" | "ask" | "block"; label?: string } = $props();
  const color = $derived(action === "allow" ? "var(--color-ok)" : action === "ask" ? "var(--color-ask)" : "var(--color-bad)");
</script>

<span class="mono inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider"
      style="color: {color}; background: color-mix(in oklab, {color} 13%, transparent)">{label ?? action}</span>
