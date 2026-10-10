import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, inter, mono } from "./theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const lerp = (f: number, a: number, b: number, from: number, to: number, e: (t: number) => number = easeOut) => interpolate(f, [a, b], [from, to], { ...clamp, easing: e });

export const useLand = () => {
  const { width, height } = useVideoConfig();
  return width > height;
};
/** UI scale: one control-room px in video px. */
export const useU = () => (useLand() ? 2.15 : 2.45);

/** A crisp spring for UI: quick, settles without wobble. */
export const useSnap = (at: number, cfg: { damping?: number; mass?: number; stiffness?: number } = {}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: { damping: 22, mass: 0.6, stiffness: 180, ...cfg } });
};

// ---------------------------------------------------------------- agent faces (ported from Creature.svelte / Mark.svelte)
const KIND_COLOR = { fox: "#d0663a", turtle: "#2a9d78", owl: "#4f8fd9", cat: "#9a6fd0", octopus: "#d05a8a" } as const;
export type Kind = keyof typeof KIND_COLOR;

const Face: React.FC<{ kind: Kind }> = ({ kind }) => {
  const g = { fill: "none", stroke: "#0a0c0f", strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  if (kind === "fox")
    return (
      <g {...g}>
        <path d="M13 16 L21 30 L9 36 Z" fill="#0a0c0f" opacity=".85" />
        <path d="M51 16 L43 30 L55 36 Z" fill="#0a0c0f" opacity=".85" />
        <path d="M10 34 Q14 50 32 54 Q50 50 54 34 Q44 26 32 27 Q20 26 10 34 Z" fill="#0a0c0f" opacity=".12" />
        <path d="M19 40 Q24 36 32 38 Q40 36 45 40 Q42 52 32 54 Q22 52 19 40 Z" fill="#f4f1ea" />
        <path d="M29 45.5 h6 l-3 3 Z" fill="#0a0c0f" />
        <circle cx="23.5" cy="34" r="2" fill="#0a0c0f" stroke="none" />
        <circle cx="40.5" cy="34" r="2" fill="#0a0c0f" stroke="none" />
      </g>
    );
  if (kind === "turtle")
    return (
      <g {...g}>
        <path d="M19 44 q0 7 4 7 h3 q3 0 3 -7 Z" fill="#f4f1ea" />
        <path d="M35 44 q0 7 4 7 h3 q3 0 3 -7 Z" fill="#f4f1ea" />
        <path d="M8 42 Q10 18 32 17 Q54 18 56 42 Z" fill="#0a0c0f" opacity=".3" />
        <path d="M8 42 Q10 18 32 17 Q54 18 56 42 Z" />
        <path d="M24 42 L22 30 L32 24 L42 30 L40 42 M22 30 L13 36 M42 30 L51 36" fill="#f4f1ea" fillOpacity=".18" />
        <path d="M8 42 h48" />
        <circle cx="57" cy="36" r="6.5" fill="#f4f1ea" />
        <circle cx="59" cy="35" r="1.7" fill="#0a0c0f" stroke="none" />
      </g>
    );
  if (kind === "owl")
    return (
      <g {...g}>
        <path d="M18 22 L14 12 L24 18" fill="#0a0c0f" opacity=".85" />
        <path d="M46 22 L50 12 L40 18" fill="#0a0c0f" opacity=".85" />
        <circle cx="24" cy="30" r="8.5" fill="#f4f1ea" />
        <circle cx="40" cy="30" r="8.5" fill="#f4f1ea" />
        <circle cx="25.5" cy="31" r="3.6" fill="#0a0c0f" />
        <circle cx="38.5" cy="31" r="3.6" fill="#0a0c0f" />
        <path d="M32 36.5 L29.5 41 L34.5 41 Z" fill="#f2a93b" stroke="none" />
      </g>
    );
  if (kind === "octopus")
    return (
      <g {...g} strokeWidth={2.4}>
        <path d="M12 38 Q12 12 32 12 Q52 12 52 38 Z" fill="#0a0c0f" opacity=".14" />
        <path d="M12 38 Q12 12 32 12 Q52 12 52 38" />
        <circle cx="25" cy="29" r="4.2" fill="#f4f1ea" />
        <circle cx="39" cy="29" r="4.2" fill="#f4f1ea" />
        <circle cx="26" cy="29.5" r="1.8" fill="#0a0c0f" stroke="none" />
        <circle cx="40" cy="29.5" r="1.8" fill="#0a0c0f" stroke="none" />
        <path d="M28 36 q4 3 8 0" />
        <path d="M14 38 q-6 10 2 15 M22 39 q-3 10 3 14 M32 40 q0 9 0 14 M42 39 q3 10 -3 14 M50 38 q6 10 -2 15" />
      </g>
    );
  return (
    <g {...g}>
      <path d="M16 26 L15 10 L27 20" fill="#0a0c0f" opacity=".85" />
      <path d="M48 26 L49 10 L37 20" fill="#0a0c0f" opacity=".85" />
      <path d="M24 33 q2 -3 4 0" />
      <path d="M36 33 q2 -3 4 0" />
      <path d="M30.5 40 h3 l-1.5 2 Z" fill="#0a0c0f" />
    </g>
  );
};

export const Avatar: React.FC<{ kind: Kind; size: number; ring?: string }> = ({ kind, size, ring }) => {
  const c = KIND_COLOR[kind];
  return (
    <div style={{ width: size, height: size, flex: "none", borderRadius: size, display: "grid", placeItems: "center", background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${c} 85%, white 20%), ${c} 55%, color-mix(in oklab, ${c} 70%, black) 100%)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 40%, transparent)${ring ? `, 0 0 0 ${size * 0.09}px ${ring}` : ""}` }}>
      <svg viewBox="0 0 64 64" width={size * 0.78} height={size * 0.78}>
        <Face kind={kind} />
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------- surfaces
export const Panel: React.FC<{ u: number; style?: React.CSSProperties; raised?: boolean; children: React.ReactNode }> = ({ u, style, raised, children }) => (
  <div
    style={{
      background: raised ? `linear-gradient(180deg, color-mix(in oklab, ${C.panel2} 100%, white 2%) 0%, ${C.panel} 100%)` : C.panel,
      border: `${Math.max(1.5, u * 0.7)}px solid ${raised ? C.line2 : C.line}`,
      borderRadius: 14 * u,
      boxShadow: raised ? `0 1px 0 rgba(255,255,255,.03) inset, 0 ${30 * u}px ${70 * u}px -${24 * u}px rgba(0,0,0,.9)` : undefined,
      fontFamily: inter,
      color: C.fg,
      ...style,
    }}
  >
    {children}
  </div>
);

export type Decision = "allow" | "ask" | "block";
export const WORD: Record<Decision, string> = { allow: "allowed", ask: "asks you", block: "blocked" };

/** The decision chip: a dot and a word, in the status colour. */
export const Chip: React.FC<{ d: Decision; u: number; label?: string; solid?: boolean; scale?: number }> = ({ d, u, label, solid, scale = 1 }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 * u, padding: `${3 * u}px ${9 * u}px`, borderRadius: 999, fontFamily: inter, fontWeight: 600, fontSize: 12 * u, letterSpacing: "0.01em", color: solid ? C.bg : C[d], background: solid ? C[d] : `color-mix(in oklab, ${C[d]} 14%, transparent)`, boxShadow: solid ? undefined : `inset 0 0 0 ${u * 0.6}px color-mix(in oklab, ${C[d]} 40%, transparent)`, transform: `scale(${scale})`, whiteSpace: "nowrap" }}>
    {solid ? null : <span style={{ width: 6 * u, height: 6 * u, borderRadius: 9, background: C[d] }} />}
    {label ?? WORD[d]}
  </span>
);

export const Mono: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => <span style={{ fontFamily: mono, fontVariantNumeric: "tabular-nums", ...style }}>{children}</span>;

// ---------------------------------------------------------------- type
/**
 * Headline that reveals word by word from behind a baseline mask, and leaves the same way.
 * "|" breaks the line. `accent` maps a word to a colour.
 */
export const Headline: React.FC<{ text: string; at: number; outAt?: number; size: number; accent?: Record<string, string>; align?: "left" | "center"; weight?: number; color?: string }> = ({ text, at, outAt, size, accent, align = "left", weight = 600, color = C.paper }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = text.split("|").map((l) => l.trim().split(" "));
  let k = 0;
  return (
    <div style={{ fontFamily: inter, fontWeight: weight, fontSize: size, lineHeight: 1.06, letterSpacing: "-0.04em", color, textAlign: align }}>
      {lines.map((ws, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", columnGap: size * 0.24 }}>
          {ws.map((w) => {
            const i = k++;
            const s = spring({ frame: f - at - i * 2.5, fps, config: { damping: 24, mass: 0.6, stiffness: 160 } });
            const o = outAt === undefined ? 0 : lerp(f, outAt + i * 1.2, outAt + 9 + i * 1.2, 0, 1, Easing.in(Easing.cubic));
            const key = w.replace(/[.,]/g, "");
            return (
              <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.12, marginBottom: -size * 0.12 }}>
                <span style={{ display: "inline-block", transform: `translateY(${(1 - s) * 105 - o * 105}%)`, color: accent?.[key] ?? color }}>{w}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Scene wrapper: in over 0.4 s (settle from a slight zoom), out over 0.4 s (push through with a little blur). */
export const Scene: React.FC<{ dur: number; xf: number; children: React.ReactNode; noIn?: boolean; noOut?: boolean }> = ({ dur, xf, children, noIn, noOut }) => {
  const f = useCurrentFrame();
  const a = noIn ? 1 : lerp(f, 0, xf, 0, 1);
  const b = noOut ? 1 : lerp(f, dur - xf, dur, 1, 0, Easing.in(Easing.cubic));
  const blur = (1 - a) * 10 + (1 - b) * 10;
  return <AbsoluteFill style={{ opacity: Math.min(a, b), transform: `scale(${0.96 + 0.04 * a + (1 - b) * 0.08})`, filter: blur > 0.05 ? `blur(${blur}px)` : undefined }}>{children}</AbsoluteFill>;
};

/** Camera: eased moves between keyframes [frame, scale, x, y]; origin at the content centre. */
export const Cam: React.FC<{ keys: [number, number, number, number][]; children: React.ReactNode; style?: React.CSSProperties }> = ({ keys, children, style }) => {
  const f = useCurrentFrame();
  const fr = keys.map((k) => k[0]);
  const v = (i: number) => interpolate(f, fr, keys.map((k) => k[i]), { ...clamp, easing: easeInOut });
  return <AbsoluteFill style={{ transform: `translate(${v(2)}px, ${v(3)}px) scale(${v(1)})`, ...style }}>{children}</AbsoluteFill>;
};

/** Flat near-black with one quiet pool of light; no texture, no drift. */
export const Backdrop: React.FC = () => {
  const land = useLand();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse ${land ? "45% 70% at 70% 50%" : "80% 45% at 50% 62%"}, rgba(244,241,234,0.045), rgba(244,241,234,0) 70%)` }} />
    </AbsoluteFill>
  );
};
