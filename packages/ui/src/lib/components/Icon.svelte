<script lang="ts">
  /** Small stroke icons for navigation. One file, no icon library. */
  let { name, size = 22 }: { name: "home" | "inbox" | "agents" | "runs" | "cost"; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === "home"}
    <path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10v9h11v-9" />
  {:else if name === "inbox"}
    <path d="M4 13h4l1.5 2.5h5L16 13h4" /><path d="M5.5 6h13l1.5 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
  {:else if name === "agents"}
    <circle cx="12" cy="8" r="3.5" /><path d="M5 19.5c1.2-3.2 3.7-4.8 7-4.8s5.8 1.6 7 4.8" />
  {:else if name === "runs"}
    <path d="M5 7h14M5 12h14M5 17h9" />
  {:else if name === "cost"}
    <path d="M12 4v16" /><path d="M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5 1.8 2.3 4 2.5 4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5" />
  {/if}
</svg>
