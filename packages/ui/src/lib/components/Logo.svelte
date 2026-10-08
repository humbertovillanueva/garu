<script lang="ts">
  /** The Garu mark: a ninja cat inside a ring with one opening. Takes the text color of wherever it sits. */
  let { size = 26, title = "Garu", animate = false }: { size?: number; title?: string; animate?: boolean } = $props();
  // Every copy needs its own mask id: a mask defined inside a hidden element (the desktop
  // sidebar on a phone) renders as nothing, and a shared id would point there.
  const id = `garu-cat-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg viewBox="0 0 100 100" width={size} height={size} fill="none" role="img" aria-label={title} class:logo-animate={animate}>
  <defs><mask id={id}><g fill="#fff"><ellipse cx="48.5" cy="52.0" rx="23.0" ry="20.70"/><polygon points="44.82,42.34 29.64,40.96 27.80,19.34"/><polygon points="52.18,42.34 67.36,40.96 69.20,19.34"/></g><g fill="#000"><rect x="25.04" y="41.42" width="46.92" height="4.60" rx="2.30" transform="rotate(6 48.5 43.72)"/><ellipse cx="39.30" cy="53.38" rx="5.98" ry="2.07" transform="rotate(12 39.30 53.38)"/><ellipse cx="57.70" cy="53.38" rx="5.98" ry="2.07" transform="rotate(-12 57.70 53.38)"/><polygon points="46.66,60.28 50.34,60.28 48.5,62.58"/></g><g fill="#fff"><rect x="38.61" y="51.66" width="1.38" height="3.45" rx="0.69"/><rect x="57.01" y="51.66" width="1.38" height="3.45" rx="0.69"/></g></mask></defs>
  <path class="ring" d="M 91.77 54.39 A 42 42 0 1 1 84.82 26.51" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>
  <rect class="cat" width="100" height="100" fill="currentColor" mask="url(#{id})"/>
  <g class="tails" stroke="currentColor" stroke-width="3.91" stroke-linecap="round" stroke-linejoin="round"><polyline points="71.04,44.18 83.98,36.13 98.35,39.01"/><polyline points="71.04,44.18 83.11,47.63 96.34,53.95"/></g>
  <g class="tails" fill="currentColor"><circle cx="71.04" cy="44.18" r="3.22"/></g>
</svg>

<style>
  /* Splash: the ring draws itself (the policy closes around), then the cat appears, then the tails flick out. */
  .logo-animate .ring { stroke-dasharray: 240; stroke-dashoffset: 240; animation: garu-ring .9s cubic-bezier(.4,0,.2,1) forwards; }
  .logo-animate .cat { opacity: 0; transform-origin: 48.5px 52px; transform: scale(.85); animation: garu-cat .5s .55s cubic-bezier(.2,.8,.2,1) forwards; }
  .logo-animate .tails { opacity: 0; transform-origin: 71px 44px; transform: rotate(-18deg) scale(.6); animation: garu-tails .45s .95s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes garu-ring { to { stroke-dashoffset: 0; } }
  @keyframes garu-cat { to { opacity: 1; transform: scale(1); } }
  @keyframes garu-tails { to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .logo-animate .ring, .logo-animate .cat, .logo-animate .tails { animation: none; stroke-dashoffset: 0; opacity: 1; transform: none; } }
</style>
