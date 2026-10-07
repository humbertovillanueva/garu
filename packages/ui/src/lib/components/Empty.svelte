<script lang="ts">
  let { title, hint }: { title: string; hint?: string } = $props();
</script>

<div class="panel px-6 py-10 text-center">
  <div class="text-fg-2">{title}</div>
  {#if hint}<div class="mono mt-2 text-[13px] text-mute">{hint}</div>{/if}
</div>
