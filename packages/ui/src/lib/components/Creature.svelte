<script lang="ts">
  /**
   * The six faces an agent can wear. Each is drawn in the agent's own color (the orb
   * behind it), so two owls still look like two different agents. Lines are the page
   * background so the creature reads on any orb color.
   */
  import type { Agent } from "../types";
  export type Kind = NonNullable<Agent["persona"]>["kind"];
  let { kind, size = 36 }: { kind: Kind; size?: number } = $props();
</script>

<svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style="display:block">
  {#if kind === "owl"}
    <g fill="none" stroke="#0a0c0f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M18 22 L14 12 L24 18" fill="#0a0c0f" opacity=".85"/><path d="M46 22 L50 12 L40 18" fill="#0a0c0f" opacity=".85"/>
    <ellipse cx="32" cy="36" rx="19" ry="21" fill="#0a0c0f" opacity=".18"/>
    <circle cx="24" cy="30" r="8.5" fill="#f4f1ea"/><circle cx="40" cy="30" r="8.5" fill="#f4f1ea"/>
    <circle cx="25.5" cy="31" r="3.6" fill="#0a0c0f"/><circle cx="38.5" cy="31" r="3.6" fill="#0a0c0f"/>
    <circle cx="26.6" cy="29.8" r="1.1" fill="#fff" stroke="none"/><circle cx="39.6" cy="29.8" r="1.1" fill="#fff" stroke="none"/>
    <path d="M32 36.5 L29.5 41 L34.5 41 Z" fill="#f2a93b" stroke="none"/>
    <path d="M22 50 q10 6 20 0" /><path d="M20 45 q12 7 24 0" opacity=".6"/>
    </g>
  {:else if kind === "fox"}
    <g fill="none" stroke="#0a0c0f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M13 16 L21 30 L9 36 Z" fill="#0a0c0f" opacity=".85"/><path d="M51 16 L43 30 L55 36 Z" fill="#0a0c0f" opacity=".85"/>
    <path d="M10 34 Q14 50 32 54 Q50 50 54 34 Q44 26 32 27 Q20 26 10 34 Z" fill="#0a0c0f" opacity=".12"/>
    <path d="M19 40 Q24 36 32 38 Q40 36 45 40 Q42 52 32 54 Q22 52 19 40 Z" fill="#f4f1ea"/>
    <path d="M29 45.5 h6 l-3 3 Z" fill="#0a0c0f"/>
    <circle cx="23.5" cy="34" r="2" fill="#0a0c0f" stroke="none"/><circle cx="40.5" cy="34" r="2" fill="#0a0c0f" stroke="none"/>
    </g>
  {:else if kind === "turtle"}
    <g fill="none" stroke="#0a0c0f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M19 44 q0 7 4 7 h3 q3 0 3 -7 Z" fill="#f4f1ea"/><path d="M35 44 q0 7 4 7 h3 q3 0 3 -7 Z" fill="#f4f1ea"/>
    <path d="M8 42 Q10 18 32 17 Q54 18 56 42 Z" fill="#0a0c0f" opacity=".3"/>
    <path d="M8 42 Q10 18 32 17 Q54 18 56 42 Z" />
    <path d="M24 42 L22 30 L32 24 L42 30 L40 42 M22 30 L13 36 M42 30 L51 36" fill="#f4f1ea" fill-opacity=".18" />
    <path d="M8 42 h48" />
    <circle cx="57" cy="36" r="6.5" fill="#f4f1ea"/><circle cx="59" cy="35" r="1.7" fill="#0a0c0f" stroke="none"/>
    </g>
  {:else if kind === "bee"}
    <g fill="none" stroke="#0a0c0f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="26" cy="21" rx="10" ry="6" fill="#f4f1ea" opacity=".92" transform="rotate(-25 26 21)"/>
    <ellipse cx="40" cy="21" rx="10" ry="6" fill="#f4f1ea" opacity=".92" transform="rotate(25 40 21)"/>
    <ellipse cx="34" cy="38" rx="17" ry="12" fill="#f4f1ea" opacity=".35"/>
    <ellipse cx="34" cy="38" rx="17" ry="12" />
    <path d="M27 27.5 v21 M35 26 v24 M43 29 v18" />
    <circle cx="16" cy="37" r="7" fill="#f4f1ea" opacity=".9"/><circle cx="14" cy="36" r="1.8" fill="#0a0c0f" stroke="none"/>
    <path d="M13 30 l-3 -6 M18 29 l1 -7" />
    <path d="M51 40 l6 3" />
    </g>
  {:else if kind === "cat"}
    <g fill="none" stroke="#0a0c0f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M16 26 L15 10 L27 20" fill="#0a0c0f" opacity=".85"/><path d="M48 26 L49 10 L37 20" fill="#0a0c0f" opacity=".85"/>
    <circle cx="32" cy="36" r="19" fill="#0a0c0f" opacity=".12"/>
    <path d="M24 33 q2 -3 4 0" /><path d="M36 33 q2 -3 4 0" />
    <path d="M30.5 40 h3 l-1.5 2 Z" fill="#0a0c0f"/>
    <path d="M32 42 q-3 4 -6 2 M32 42 q3 4 6 2" />
    <path d="M8 38 h14 M8 44 h14 M42 38 h14 M42 44 h14" opacity=".55"/>
    </g>
  {:else if kind === "octopus"}
    <g fill="none" stroke="#0a0c0f" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M12 38 Q12 12 32 12 Q52 12 52 38 Z" fill="#0a0c0f" opacity=".14"/>
    <path d="M12 38 Q12 12 32 12 Q52 12 52 38" />
    <circle cx="25" cy="29" r="4.2" fill="#f4f1ea"/><circle cx="39" cy="29" r="4.2" fill="#f4f1ea"/>
    <circle cx="26" cy="29.5" r="1.8" fill="#0a0c0f" stroke="none"/><circle cx="40" cy="29.5" r="1.8" fill="#0a0c0f" stroke="none"/>
    <path d="M28 36 q4 3 8 0" />
    <path d="M14 38 q-6 10 2 15 M22 39 q-3 10 3 14 M32 40 q0 9 0 14 M42 39 q3 10 -3 14 M50 38 q6 10 -2 15" />
    </g>
  {/if}
</svg>
