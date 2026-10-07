<script lang="ts">
  // The agent's face: a colored orb. Pulses when working, rings when waiting on you.
  import { agentColor } from "../format";
  let { name, size = 36, status = "idle" as string }: { name: string; size?: number; status?: string } = $props();
  const color = $derived(agentColor(name));
  const initials = $derived(name.split(/[-_ ]+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2));
</script>

<span class="relative grid flex-none place-items-center rounded-full"
      class:pulse={status === "working"}
      class:ring-live={status === "waiting"}
      style="width:{size}px;height:{size}px;--live:var(--color-accent);
             background: radial-gradient(circle at 35% 30%, color-mix(in oklab, {color} 85%, white 20%), {color} 55%, color-mix(in oklab, {color} 70%, black) 100%);
             box-shadow: 0 0 0 1px color-mix(in oklab, {color} 40%, transparent) inset{status === 'waiting' ? ', 0 0 0 3px color-mix(in oklab, var(--color-accent) 30%, transparent)' : ''}">
  <span class="select-none font-semibold tracking-tight text-white/90" style="font-size:{Math.round(size * 0.36)}px">{initials}</span>
</span>
