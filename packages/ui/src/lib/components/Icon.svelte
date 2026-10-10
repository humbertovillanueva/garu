<script lang="ts">
  /** Small stroke icons for navigation. One file, no icon library. */
  let { name, size = 22 }: { name: "home" | "inbox" | "agents" | "runs" | "cost" | "settings" | "clock" | "shield" | "spark" | "key" | "globe" | "play" | "send" | "chevron" | "help" | "info" | "flag" | "phone" | "sliders"; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === "home"}
    <path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10v9h11v-9" />
  {:else if name === "inbox"}
    <path d="M4 13h4l1.5 2.5h5L16 13h4" /><path d="M5.5 6h13l1.5 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
  {:else if name === "agents"}
    <path d="M5.5 10.5 5 4l4.3 3.2h5.4L19 4l-.5 6.5" /><path d="M5.5 10.5a6.5 6.5 0 1 0 13 0" /><path d="M9.5 13h.01M14.5 13h.01" stroke-width="2.4" />
  {:else if name === "runs"}
    <path d="M5 7h14M5 12h14M5 17h9" />
  {:else if name === "cost"}
    <path d="M12 4v16" /><path d="M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5 1.8 2.3 4 2.5 4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5" />
  {:else if name === "settings"}
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  {:else if name === "clock"}
    <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
  {:else if name === "shield"}
    <path d="M12 3.5 5 6.2v5.3c0 4.3 3 7.4 7 8.9 4-1.5 7-4.6 7-8.9V6.2z" /><path d="m9.2 12 1.9 1.9 3.7-3.8" />
  {:else if name === "spark"}
    <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M6 18l2.1-2.1M15.9 8.1 18 6" />
  {:else if name === "key"}
    <circle cx="8" cy="14" r="4" /><path d="M11 11.5 20 3M15 8l2.5 2.5M18 5l2 2" />
  {:else if name === "globe"}
    <circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.6 3.8 5.4 3.8 8.5s-1.2 5.9-3.8 8.5c-2.6-2.6-3.8-5.4-3.8-8.5S9.4 6.1 12 3.5z" />
  {:else if name === "play"}
    <path d="M8 6.5v11l9-5.5z" />
  {:else if name === "send"}
    <path d="M5 12h13M12 5l7 7-7 7" />
  {:else if name === "chevron"}
    <path d="m9 6 6 6-6 6" />
  {:else if name === "help"}
    <circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4" /><path d="M12 17h.01" />
  {:else if name === "info"}
    <circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" />
  {:else if name === "flag"}
    <path d="M6 20V4" /><path d="M6 4h11l-2.5 4 2.5 4H6" />
  {:else if name === "phone"}
    <rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 17.5h2" />
  {:else if name === "sliders"}
    <path d="M5 7h8M17 7h2M5 12h2M11 12h8M5 17h11M20 17h-1" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="18" cy="17" r="2" />
  {/if}
</svg>
