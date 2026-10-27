<script lang="ts">
  /**
   * The twelve faces an agent can wear. Each is drawn in the agent's own color (the orb
   * behind it), so two owls still look like two different agents. Lines are ink and the
   * eyes are paper (app.css tokens that no theme flips), so the creature reads on any orb color.
   */
  import type { Agent } from "../types";
  export type Kind = NonNullable<Agent["persona"]>["kind"];
  let { kind, size = 36 }: { kind: Kind; size?: number } = $props();
</script>

<svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style="display:block">
  {#if kind === "owl"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M18 22 L14 12 L24 18" fill="var(--color-ink)" opacity=".85"/><path d="M46 22 L50 12 L40 18" fill="var(--color-ink)" opacity=".85"/>
    <ellipse cx="32" cy="36" rx="19" ry="21" fill="var(--color-ink)" opacity=".18"/>
    <circle cx="24" cy="30" r="8.5" fill="var(--color-paper)"/><circle cx="40" cy="30" r="8.5" fill="var(--color-paper)"/>
    <circle cx="25.5" cy="31" r="3.6" fill="var(--color-ink)"/><circle cx="38.5" cy="31" r="3.6" fill="var(--color-ink)"/>
    <circle cx="26.6" cy="29.8" r="1.1" fill="var(--color-paper)" stroke="none"/><circle cx="39.6" cy="29.8" r="1.1" fill="var(--color-paper)" stroke="none"/>
    <path d="M32 36.5 L29.5 41 L34.5 41 Z" fill="var(--color-paper)" stroke="none"/>
    <path d="M22 50 q10 6 20 0" /><path d="M20 45 q12 7 24 0" opacity=".6"/>
    </g>
  {:else if kind === "fox"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M13 16 L21 30 L9 36 Z" fill="var(--color-ink)" opacity=".85"/><path d="M51 16 L43 30 L55 36 Z" fill="var(--color-ink)" opacity=".85"/>
    <path d="M10 34 Q14 50 32 54 Q50 50 54 34 Q44 26 32 27 Q20 26 10 34 Z" fill="var(--color-ink)" opacity=".12"/>
    <path d="M19 40 Q24 36 32 38 Q40 36 45 40 Q42 52 32 54 Q22 52 19 40 Z" fill="var(--color-paper)"/>
    <path d="M29 45.5 h6 l-3 3 Z" fill="var(--color-ink)"/>
    <circle cx="23.5" cy="34" r="2" fill="var(--color-ink)" stroke="none"/><circle cx="40.5" cy="34" r="2" fill="var(--color-ink)" stroke="none"/>
    </g>
  {:else if kind === "turtle"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M19 44 q0 7 4 7 h3 q3 0 3 -7 Z" fill="var(--color-paper)"/><path d="M35 44 q0 7 4 7 h3 q3 0 3 -7 Z" fill="var(--color-paper)"/>
    <path d="M8 42 Q10 18 32 17 Q54 18 56 42 Z" fill="var(--color-ink)" opacity=".3"/>
    <path d="M8 42 Q10 18 32 17 Q54 18 56 42 Z" />
    <path d="M24 42 L22 30 L32 24 L42 30 L40 42 M22 30 L13 36 M42 30 L51 36" fill="var(--color-paper)" fill-opacity=".18" />
    <path d="M8 42 h48" />
    <circle cx="57" cy="36" r="6.5" fill="var(--color-paper)"/><circle cx="59" cy="35" r="1.7" fill="var(--color-ink)" stroke="none"/>
    </g>
  {:else if kind === "bee"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="26" cy="21" rx="10" ry="6" fill="var(--color-paper)" opacity=".92" transform="rotate(-25 26 21)"/>
    <ellipse cx="40" cy="21" rx="10" ry="6" fill="var(--color-paper)" opacity=".92" transform="rotate(25 40 21)"/>
    <ellipse cx="34" cy="38" rx="17" ry="12" fill="var(--color-paper)" opacity=".35"/>
    <ellipse cx="34" cy="38" rx="17" ry="12" />
    <path d="M27 27.5 v21 M35 26 v24 M43 29 v18" />
    <circle cx="16" cy="37" r="7" fill="var(--color-paper)" opacity=".9"/><circle cx="14" cy="36" r="1.8" fill="var(--color-ink)" stroke="none"/>
    <path d="M13 30 l-3 -6 M18 29 l1 -7" />
    <path d="M51 40 l6 3" />
    </g>
  {:else if kind === "cat"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M16 26 L15 10 L27 20" fill="var(--color-ink)" opacity=".85"/><path d="M48 26 L49 10 L37 20" fill="var(--color-ink)" opacity=".85"/>
    <circle cx="32" cy="36" r="19" fill="var(--color-ink)" opacity=".12"/>
    <path d="M24 33 q2 -3 4 0" /><path d="M36 33 q2 -3 4 0" />
    <path d="M30.5 40 h3 l-1.5 2 Z" fill="var(--color-ink)"/>
    <path d="M32 42 q-3 4 -6 2 M32 42 q3 4 6 2" />
    <path d="M8 38 h14 M8 44 h14 M42 38 h14 M42 44 h14" opacity=".55"/>
    </g>
  {:else if kind === "octopus"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M12 38 Q12 12 32 12 Q52 12 52 38 Z" fill="var(--color-ink)" opacity=".14"/>
    <path d="M12 38 Q12 12 32 12 Q52 12 52 38" />
    <circle cx="25" cy="29" r="4.2" fill="var(--color-paper)"/><circle cx="39" cy="29" r="4.2" fill="var(--color-paper)"/>
    <circle cx="26" cy="29.5" r="1.8" fill="var(--color-ink)" stroke="none"/><circle cx="40" cy="29.5" r="1.8" fill="var(--color-ink)" stroke="none"/>
    <path d="M28 36 q4 3 8 0" />
    <path d="M14 38 q-6 10 2 15 M22 39 q-3 10 3 14 M32 40 q0 9 0 14 M42 39 q3 10 -3 14 M50 38 q6 10 -2 15" />
    </g>
  {:else if kind === "rabbit"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M23 29 Q15 9 21 5 Q28 7 29 27" fill="var(--color-paper)" opacity=".92"/><path d="M41 29 Q49 9 43 5 Q36 7 35 27" fill="var(--color-paper)" opacity=".92"/>
    <path d="M23 25 Q20 14 22 10 M41 25 Q44 14 42 10" opacity=".5"/>
    <ellipse cx="32" cy="41" rx="16" ry="14" fill="var(--color-ink)" opacity=".12"/>
    <circle cx="26" cy="39" r="2" fill="var(--color-ink)" stroke="none"/><circle cx="38" cy="39" r="2" fill="var(--color-ink)" stroke="none"/>
    <path d="M30 44.5 h4 l-2 2.4 Z" fill="var(--color-ink)"/>
    <path d="M32 47 q-3 3 -6 1 M32 47 q3 3 6 1" />
    </g>
  {:else if kind === "bear"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <circle cx="17" cy="19" r="6.5" fill="var(--color-ink)" opacity=".85"/><circle cx="47" cy="19" r="6.5" fill="var(--color-ink)" opacity=".85"/>
    <circle cx="17" cy="19" r="2.6" fill="var(--color-paper)" opacity=".4" stroke="none"/><circle cx="47" cy="19" r="2.6" fill="var(--color-paper)" opacity=".4" stroke="none"/>
    <circle cx="32" cy="36" r="18" fill="var(--color-ink)" opacity=".12"/>
    <circle cx="25" cy="32" r="2.1" fill="var(--color-ink)" stroke="none"/><circle cx="39" cy="32" r="2.1" fill="var(--color-ink)" stroke="none"/>
    <ellipse cx="32" cy="43" rx="9.5" ry="7.5" fill="var(--color-paper)" opacity=".9" stroke="none"/>
    <path d="M28.2 39.6 Q32 38.4 35.8 39.6 Q35 42.6 32 43.2 Q29 42.6 28.2 39.6 Z" fill="var(--color-ink)" stroke-width="1.2"/>
    <path d="M32 43.2 v1.6 M32 44.8 q-2 1.8 -3.8 .4 M32 44.8 q2 1.8 3.8 .4" stroke-width="1.8"/>
    </g>
  {:else if kind === "frog"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M9 37 Q11 25 22 27 Q32 23 42 27 Q53 25 55 37 Q53 51 32 51 Q11 51 9 37 Z" fill="var(--color-ink)" opacity=".12"/>
    <circle cx="21" cy="23" r="7.5" fill="var(--color-paper)"/><circle cx="43" cy="23" r="7.5" fill="var(--color-paper)"/>
    <circle cx="21.5" cy="23.5" r="3.2" fill="var(--color-ink)" stroke="none"/><circle cx="42.5" cy="23.5" r="3.2" fill="var(--color-ink)" stroke="none"/>
    <path d="M18 40 Q32 49 46 40" />
    <circle cx="27" cy="34" r=".9" fill="var(--color-ink)" stroke="none"/><circle cx="37" cy="34" r=".9" fill="var(--color-ink)" stroke="none"/>
    </g>
  {:else if kind === "penguin"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <circle cx="32" cy="34" r="21" fill="var(--color-ink)" opacity=".82"/>
    <path d="M32 27 Q27 19 20 23 Q14 28 16.5 39 Q20 51 32 52 Q44 51 47.5 39 Q50 28 44 23 Q37 19 32 27 Z" fill="var(--color-paper)" stroke="none"/>
    <circle cx="24.5" cy="32" r="2.2" fill="var(--color-ink)" stroke="none"/><circle cx="39.5" cy="32" r="2.2" fill="var(--color-ink)" stroke="none"/>
    <path d="M27.5 37.5 L32 35.8 L36.5 37.5 L32 42.5 Z" fill="var(--color-ink)" stroke="none"/>
    </g>
  {:else if kind === "raccoon"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M15 24 L16 10 L27 18" fill="var(--color-ink)" opacity=".85"/><path d="M49 24 L48 10 L37 18" fill="var(--color-ink)" opacity=".85"/>
    <circle cx="32" cy="37" r="19" fill="var(--color-paper)" opacity=".3" stroke="none"/>
    <path d="M11 32 Q21 25 32 31 Q43 25 53 32 Q49 41 41 40 Q35 39 32 36 Q29 39 23 40 Q15 41 11 32 Z" fill="var(--color-ink)"/>
    <circle cx="24" cy="33" r="2.5" fill="var(--color-paper)" stroke="none"/><circle cx="40" cy="33" r="2.5" fill="var(--color-paper)" stroke="none"/>
    <path d="M29.5 44 h5 l-2.5 3 Z" fill="var(--color-ink)"/>
    <path d="M32 47 q-3 3 -6 1 M32 47 q3 3 6 1" />
    </g>
  {:else if kind === "whale"}
    <g fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M7 38 Q8 25 28 25 Q46 25 49 34 L57 27 L56 38 L60 45 L50 41 Q46 51 28 51 Q8 51 7 38 Z" fill="var(--color-ink)" opacity=".14"/>
    <path d="M7 38 Q8 25 28 25 Q46 25 49 34 L57 27 L56 38 L60 45 L50 41 Q46 51 28 51 Q8 51 7 38 Z" />
    <path d="M10 43 Q28 48 47 42" fill="var(--color-paper)" fill-opacity=".35"/>
    <circle cx="18" cy="35" r="2.1" fill="var(--color-ink)" stroke="none"/>
    <path d="M27 21 v-8 M27 16 q-4 -4 -7 -3 M27 16 q4 -4 7 -3" />
    </g>
  {/if}
</svg>
