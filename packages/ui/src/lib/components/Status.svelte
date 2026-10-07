<script lang="ts">
  import { statusLabel } from "../format";
  let { status }: { status: string } = $props();
  const color = $derived(
    status === "ok" ? "var(--color-ok)"
    : status === "running" ? "var(--color-accent)"
    : status === "blocked" || status === "error" || status === "budget_exceeded" ? "var(--color-bad)"
    : "var(--color-mute)",
  );
</script>

<span class="inline-flex items-center gap-1.5 text-[13px]" style="color: {color}">
  <span class="dot" class:dot-live={status === "running"} style="background: {color}"></span>
  <span>{statusLabel(status)}</span>
</span>
