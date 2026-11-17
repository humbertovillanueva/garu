<script lang="ts">
  // The agent's face: a colored orb. Pulses when working, rings when waiting on you.
  import { live } from "../api.svelte";
  import Creature, { type Kind } from "./Creature.svelte";
  import { KIND_COLOR, NO_FACE_COLOR } from "../colors";
  let { name, size = 36, status = "idle" as string, kind }: { name: string; size?: number; status?: string; kind?: Kind | null } = $props();
  // A face comes from the Garufile's persona. Call sites that only know the name still get it.
  const face = $derived<Kind | null>(kind ?? live.agents.find((a) => a.name === name)?.persona?.kind ?? null);
  // Faceless agents are grey: a creature's color means that creature.
  const color = $derived(face ? KIND_COLOR[face] : NO_FACE_COLOR);
  const initials = $derived(name.split(/[-_ ]+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2));
  // Motion that means something: breathing and an orbiting ring while it works, a knock while it waits
  // on you, one pop the moment a run ends under your eyes, a blink now and then while it sleeps. Agents
  // don't blink in step: each gets its own offset from its name. All of it off under reduced motion.
  const working = $derived(status === "working" || status === "running");
  const waiting = $derived(status === "waiting" || status === "parked");
  const sleeping = $derived(status === "scheduled" || status === "sleeping" || status === "idle");
  const offset = $derived([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 7000, 0));
  let popped = $state(false);
  let was = $state<string | null>(null);
  $effect(() => {
    const now = working;
    if (was === "working" && !now) { popped = true; setTimeout(() => (popped = false), 700); }
    was = now ? "working" : "other";
  });
</script>

<span class="orb relative grid flex-none place-items-center rounded-full"
      class:breathe={working}
      class:knock={waiting}
      class:pop={popped}
      style="width:{size}px;height:{size}px;--live:var(--color-ask);--orb:{color};--offset:{offset}ms;
             background: radial-gradient(circle at 35% 30%, color-mix(in oklab, {color} 85%, white 20%), {color} 55%, color-mix(in oklab, {color} 70%, black) 100%);
             box-shadow: 0 0 0 1px color-mix(in oklab, {color} 40%, transparent) inset{waiting ? ', 0 0 0 3px color-mix(in oklab, var(--color-ask) 30%, transparent)' : ''}">
  {#if working}<span class="orbit" aria-hidden="true"></span>{/if}
  {#if face}
    <Creature kind={face} size={Math.round(size * 0.78)} blink={sleeping} />
  {:else}
    <span class="select-none font-semibold tracking-tight text-white/90" style="font-size:{Math.round(size * 0.36)}px">{initials}</span>
  {/if}
</span>

<style>
  .breathe { animation: breathe 3s ease-in-out infinite; }
  @keyframes breathe { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.045) } }
  /* A thin ring circling the orb while it works: a conic sweep, cut to a ring with a mask. */
  .orbit {
    position: absolute; inset: -3px; border-radius: 9999px; pointer-events: none;
    background: conic-gradient(from 0deg, transparent 0 70%, color-mix(in oklab, var(--orb) 60%, white) 100%);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
    animation: orbit 2.4s linear infinite;
  }
  @keyframes orbit { to { transform: rotate(360deg) } }
  /* Two soft rings pushed outward, a pause, again: a quiet knock, for as long as it waits on you. */
  .knock::before {
    content: ""; position: absolute; inset: 0; border-radius: 9999px; pointer-events: none;
    box-shadow: 0 0 0 0 color-mix(in oklab, var(--live) 55%, transparent);
    animation: knock 3.2s ease-out infinite;
  }
  @keyframes knock {
    0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--live) 55%, transparent) }
    18% { box-shadow: 0 0 0 9px color-mix(in oklab, var(--live) 0%, transparent) }
    19%, 20% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--live) 55%, transparent) }
    38%, 100% { box-shadow: 0 0 0 9px color-mix(in oklab, var(--live) 0%, transparent) }
  }
  .pop { animation: pop .6s cubic-bezier(.2, .9, .3, 1.4) both; }
  @keyframes pop { 0% { transform: scale(1) } 40% { transform: scale(1.18) } 100% { transform: scale(1) } }
  @media (prefers-reduced-motion: reduce) {
    .breathe, .orbit, .knock::before, .pop { animation: none !important }
    .orbit { display: none }
  }
</style>
