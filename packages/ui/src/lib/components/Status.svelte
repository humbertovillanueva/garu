<script lang="ts">
  import { statusLabel } from "../format";
  let { status }: { status: string } = $props();
  const color = $derived(
    status === "ok" || status === "run.ok" ? "var(--color-ok)"
    : status === "waiting" ? "var(--color-ask)" : status === "running" || status === "working" ? "var(--color-accent)"
    : status === "blocked" || status === "error" || status === "budget_exceeded" || status === "interrupted" ? "var(--color-bad)"
    : "var(--color-mute)",
  );
</script>

<span class="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style="color: {color}">
  <span class="dot" class:pulse={status === "running" || status === "working"} style="background: {color}"></span>
  <span>{statusLabel(status)}</span>
</span>
