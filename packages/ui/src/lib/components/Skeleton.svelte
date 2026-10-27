<script lang="ts">
  import { t } from "../i18n.svelte";
  let { rows = 3, h = 56 }: { rows?: number; h?: number } = $props();
</script>
<div class="space-y-3" role="status" aria-label={t("Loading…")}>
  {#each Array(rows) as _, i}
    <div class="skel" style="height:{h}px; animation-delay:{i * 60}ms"></div>
  {/each}
</div>
