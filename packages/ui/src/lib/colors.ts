import type { Kind } from "./components/Creature.svelte";
/** Each creature kind has one color, so the same agent looks the same everywhere: its avatar, its bars, its dots. */
export const KIND_COLOR: Record<Kind, string> = {
  owl: "#4f8fd9", fox: "#d0663a", turtle: "#2a9d78", bee: "#c9a227", cat: "#9a6fd0", octopus: "#d05a8a",
  // Hues the first six leave free, and none red (red means blocked): magenta, brown, lime, dark slate, silver, cyan.
  rabbit: "#b34fb3", bear: "#9a6a44", frog: "#7cb342", penguin: "#5d6b82", raccoon: "#a3a7b0", whale: "#26a9c4",
};
