<script lang="ts">
  import type { Snippet } from "svelte";
  let { title, hint, children }: { title: string; hint?: string; children?: Snippet } = $props();
</script>

<div class="panel rise px-6 py-12 text-center">
  <div class="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-full border border-accent/30">
    <span class="h-3 w-3 rounded-full bg-accent"></span>
  </div>
  <div class="text-[15px] font-medium">{title}</div>
  {#if hint}<div class="mt-2 text-[13px] text-mute">{hint}</div>{/if}
  {#if children}<div class="mt-4">{@render children()}</div>{/if}
</div>
