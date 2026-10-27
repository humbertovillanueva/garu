import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily: inter } = loadFont("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
export const { fontFamily: mono } = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

/**
 * The control room's own tokens, copied by hand from the dark theme in packages/ui/src/app.css
 * (--color-bg … --color-bad; `paper` is --color-accent, `allow` is --color-ok, `block` is --color-bad).
 * Keep the values identical to that file.
 */
export const C = {
  bg: "#0a0c0f",
  panel: "#11141a",
  panel2: "#171b22",
  panel3: "#1d222b",
  line: "#1e232c",
  line2: "#2a303b",
  fg: "#e6eaf0",
  fg2: "#aeb6c2",
  mute: "#7f8899",
  paper: "#f4f1ea",
  allow: "#43c979",
  ask: "#d9b24c",
  block: "#ef5350",
};

/** A token at some opacity: rgba(C.allow, 0.4). */
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

export const FPS = 30;
/** Every scene change is 0.4 s (one beat at 150 bpm), centred on a bar line. */
export const XF = 12;
/** One bar of the score: 1.6 s. Scene boundaries sit on bar lines. */
export const BAR = 48;

// Scene boundaries in bars. The score (tools/score.py) is arranged with the clock ticks in bar 0,
// the groove from bar 10, the build from bar 21 and the impact on bar 24; v8 keeps the hook, the
// drop and the length, and gives proof the two bars that meet and brief gave up.
const B = { hook: 0, meet: 3, brief: 6, control: 8, ask: 12, learn: 16, proof: 19, logo: 24, end: 28 };
const span = (a: number, b: number, first = false) => ({ from: a * BAR - (first ? 0 : XF / 2), dur: (b - a) * BAR + (first ? XF / 2 : XF) });
export const S = {
  hook: span(B.hook, B.meet, true),
  meet: span(B.meet, B.brief),
  brief: span(B.brief, B.control),
  control: { from: B.control * BAR - XF / 2, dur: (B.ask - B.control) * BAR + XF / 2 }, // ends on the morph: hard hand-off to ask
  ask: { from: B.ask * BAR, dur: (B.learn - B.ask) * BAR + XF / 2 },
  learn: span(B.learn, B.proof),
  proof: { from: B.proof * BAR - XF / 2, dur: (B.logo - B.proof) * BAR - XF / 2 }, // out to black half a beat before the drop
  logo: { from: B.logo * BAR, dur: (B.end - B.logo) * BAR }, // lands on the impact
};
export const TOTAL = B.end * BAR;

/**
 * The 15-second cut (hook, control, ask, end card): 450 frames. The score is spliced on bar
 * lines, see Garu.tsx: bars 0–2 under the hook, 11–17 under control and ask, 24– under the card.
 */
export const SHORT_TOTAL = 450;
export const SH = {
  hook: { from: 0, dur: 2 * BAR + XF / 2 },
  control: { from: 2 * BAR - XF / 2, dur: 4 * BAR + XF / 2 },
  ask: { from: 6 * BAR, dur: 2 * BAR - XF / 2 }, // out to black half a beat before the drop
  logo: { from: 8 * BAR, dur: SHORT_TOTAL - 8 * BAR },
};
