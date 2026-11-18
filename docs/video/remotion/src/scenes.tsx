import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BAR, C, inter, mono, rgba, S, XF } from "./theme";
import { Avatar, Cam, Chip, clamp, Decision, GaruMark, Headline, Kind, lerp, Mono, Panel, raise, useLand, useSnap, useU } from "./ui";

/**
 * 9:16 safe zones: Shorts, Reels and TikTok lay their controls over the bottom 300 px and the
 * right 120 px, so nothing that has to be read goes there.
 */
export const SAFE = { bottom: 300, right: 120, left: 80 };
/** The content panel's width in video px: 880 on 9:16 (between the safe margins); 900 on 16:9, or 860 for the two panels that read better narrower. */
const usePanelW = (narrow = false) => (useLand() ? (narrow ? 860 : 900) : 1080 - SAFE.left - SAFE.right);

/** Headline above / content below on 9:16; headline left / content right on 16:9. */
const Layout: React.FC<{ head?: React.ReactNode; children: React.ReactNode; cam?: [number, number, number, number][] }> = ({ head, children, cam }) => {
  const land = useLand();
  const content = land ? (
    <div style={{ position: "absolute", left: 880, right: 60, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ transform: "scale(0.9)" }}>{children}</div>
    </div>
  ) : (
    <div style={{ position: "absolute", left: SAFE.left, right: SAFE.right, top: 520, bottom: SAFE.bottom, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
  );
  return (
    <AbsoluteFill>
      {cam ? <Cam keys={cam} style={{ transformOrigin: land ? "68% 50%" : "50% 60%" }}>{content}</Cam> : content}
      {land ? <div style={{ position: "absolute", left: 110, top: 0, bottom: 0, width: 760, display: "flex", alignItems: "center" }}>{head}</div> : <div style={{ position: "absolute", left: 84, right: SAFE.right, top: 170 }}>{head}</div>}
    </AbsoluteFill>
  );
};
const useHeadSize = () => (useLand() ? 78 : 104);

/** Two headlines in the same slot: the first leaves as the second arrives. */
const Swap: React.FC<{ a: React.ReactNode; b: React.ReactNode }> = ({ a, b }) => (
  <div style={{ position: "relative", width: "100%" }}>
    {a}
    <div style={{ position: "absolute", left: 0, right: 0, top: 0 }}>{b}</div>
  </div>
);

/** A finger: settles onto a point, presses, leaves a ripple. Place inside a 0×0 anchor. */
const Finger: React.FC<{ at: number; u: number; ripple?: string }> = ({ at, u, ripple = C.allow }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < at - 18 || f > at + 26) return null;
  const fin = spring({ frame: f - (at - 16), fps, config: { damping: 18, mass: 0.6 } });
  const press = interpolate(f, [at - 2, at, at + 5], [1, 0.8, 1], clamp);
  const out = lerp(f, at + 8, at + 20, 1, 0);
  const rip = lerp(f, at, at + 22, 0, 1);
  return (
    <>
      <div style={{ position: "absolute", width: 170 * u, height: 170 * u, left: -85 * u, top: -85 * u, borderRadius: 999, border: `${3 * u}px solid ${ripple}`, transform: `scale(${0.15 + rip})`, opacity: f >= at ? 1 - rip : 0 }} />
      <div style={{ position: "absolute", width: 44 * u, height: 44 * u, left: -22 * u, top: -22 * u, borderRadius: 999, background: rgba(C.paper, 0.26), boxShadow: `0 0 0 ${2 * u}px ${rgba(C.paper, 0.6)}, 0 ${8 * u}px ${24 * u}px rgba(0,0,0,0.5)`, transform: `translate(${(1 - fin) * 70 * u}px, ${(1 - fin) * 110 * u}px) scale(${press})`, opacity: fin * out }} />
    </>
  );
};

const Btn: React.FC<{ u: number; tone?: "ok" | "bad"; fill?: number; dim?: number; scale?: number; children: React.ReactNode }> = ({ u, tone, fill = 0, dim = 0, scale = 1, children }) => {
  const col = tone === "ok" ? C.allow : tone === "bad" ? C.block : C.fg;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", height: 36 * u, padding: `0 ${14 * u}px`, borderRadius: 9 * u, fontSize: 13.5 * u, fontWeight: 600, whiteSpace: "nowrap", color: fill > 0.5 ? C.bg : col, background: tone === "ok" ? `color-mix(in oklab, ${C.allow} ${fill * 100}%, ${C.panel2})` : C.panel2, boxShadow: `inset 0 0 0 ${u * 0.7}px ${tone ? `color-mix(in oklab, ${col} 55%, transparent)` : C.line2}`, opacity: 1 - dim * 0.55, transform: `scale(${scale})` }}>
      {children}
    </div>
  );
};

// ================================================================= 1 · hook
/** The night's notifications: what three agents did while you slept, in order. */
const NIGHT: { time: string; kind: Kind; name: string; say: string; seed: number }[] = [
  { time: "12:20 AM", kind: "bee", name: "Bea", say: "Sorted 14 emails. 2 need you.", seed: 3 },
  { time: "2:55 AM", kind: "owl", name: "Rook", say: "3 new stars, 1 issue on GitHub.", seed: 7 },
  { time: "6:40 AM", kind: "fox", name: "Tomay", say: "Your day is ready.", seed: 11 },
];
const QUESTION = BAR * 2; // "But would you trust one?" lands on bar 2
/** When the i-th notification arrives, as a share of the way to the question (the 15-second cut asks sooner). */
export const HOOK_AT = (i: number, question = QUESTION) => Math.round(question * [0.3, 0.54, 0.76][i]);
export const HOOK_N = NIGHT.length;

/** A burst of sparks from a point: `n` dots fly out and fade over 22 frames. Place inside a 0×0 anchor. */
const Burst: React.FC<{ at: number; u: number; color?: string; n?: number; reach?: number }> = ({ at, u, color = C.allow, n = 10, reach = 80 }) => {
  const f = useCurrentFrame();
  if (f < at || f > at + 22) return null;
  const p = (f - at) / 22;
  const d = Easing.out(Easing.cubic)(p);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 2) * 0.35;
        const r = reach * u * d * (0.7 + 0.3 * (((i * 7) % 5) / 4));
        const sz = (5 - 3 * p) * u;
        return <div key={i} style={{ position: "absolute", left: Math.cos(a) * r - sz / 2, top: Math.sin(a) * r - sz / 2, width: sz, height: sz, borderRadius: 99, background: i % 3 ? color : C.paper, opacity: 1 - p }} />;
      })}
    </>
  );
};

/** One notification: springs in with a bounce, its face arrives spinning, its chip flips to "?" under the question. */
const Night: React.FC<{ i: number; at: number; question: number; u: number }> = ({ i, at, question, u }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = NIGHT[i];
  if (f < at) return null;
  const s = spring({ frame: f - at, fps, config: { damping: 13, mass: 0.6, stiffness: 170 } });
  const face = spring({ frame: f - at - 3, fps, config: { damping: 9, mass: 0.5, stiffness: 200 } });
  const q = lerp(f, question + 6 + i * 4, question + 14 + i * 4, 0, 1);
  const pop = 1 + 0.45 * Math.sin(Math.PI * q);
  return (
    <Panel u={u} raised style={{ display: "flex", alignItems: "center", gap: 14 * u, padding: `${14 * u}px ${18 * u}px`, opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 70 * u}px) scale(${0.92 + 0.08 * s})` }}>
      <div style={{ transform: `scale(${face}) rotate(${(1 - face) * -40}deg)` }}>
        <Avatar kind={n.kind} size={40 * u} seed={n.seed} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 * u }}>
          <span style={{ fontSize: 16 * u, fontWeight: 600, letterSpacing: "-0.01em" }}>{n.name}</span>
          <span style={{ marginLeft: "auto", fontSize: 12 * u, color: C.mute, whiteSpace: "nowrap" }}>{n.time}</span>
        </div>
        <div style={{ marginTop: 3 * u, fontSize: 14 * u, color: C.fg2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.say}</div>
      </div>
      <span style={{ display: "inline-block", transform: `scale(${pop})` }}>{q < 0.5 ? <Chip d="allow" u={u} label="done" /> : <Chip d="ask" u={u} solid label="?" />}</span>
    </Panel>
  );
};

/** The headline and the clock are there from frame 0, so the first frame (the thumbnail) is never an empty backdrop. */
export const Hook: React.FC<{ question?: number }> = ({ question = QUESTION }) => {
  const f = useCurrentFrame();
  const land = useLand();
  const u = useU() * (land ? 0.82 : 0.96);
  const w = usePanelW();
  const mins = interpolate(f, [4, question - 16], [-2, 420], { ...clamp, easing: Easing.bezier(0.7, 0, 0.25, 1) });
  const m = Math.round(mins);
  const hh = ((Math.floor((m + 24 * 60) / 60) % 24) + 24) % 24;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const mm = String(((m % 60) + 60) % 60).padStart(2, "0");
  const ampm = hh < 12 ? "AM" : "PM";
  const doubt = lerp(f, question - 6, question + 10, 0, 1);
  const size = land ? 150 : 170;
  return (
    <>
      <Layout head={<Headline text="AI agents can work|while you sleep." at={-40} outAt={question - 10} size={land ? 78 : 94} />} cam={[[0, 1, 0, 0], [question, 1.05, 0, 0], [question + 40, 1.08, 0, 0]]}>
        <div style={{ width: w, height: land ? 620 : 800, display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: 12 * u, opacity: 1 - doubt * 0.7, filter: doubt > 0.01 ? `blur(${doubt * 4}px)` : undefined, transform: `scale(${1 - doubt * 0.04})` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 18, marginBottom: 18 * u, fontFamily: inter, fontWeight: 700, fontSize: size, letterSpacing: "-0.05em", color: C.paper, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            <span>
              {h12}:{mm}
            </span>
            <span style={{ fontSize: size * 0.32, fontWeight: 600, color: C.fg2, letterSpacing: "-0.02em" }}>{ampm}</span>
          </div>
          {NIGHT.map((_, i) => (
            <Night key={i} i={i} at={HOOK_AT(i, question)} question={question} u={u} />
          ))}
        </div>
      </Layout>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 70 }}>
        <Headline text="But would you|trust one?" at={question + 2} size={land ? 110 : 132} align="center" accent={{ trust: C.ask, one: C.ask }} />
      </AbsoluteFill>
    </>
  );
};

// ================================================================= 2 · meet
const AGENTS: { kind: Kind; name: string; what: string; when: string }[] = [
  { kind: "fox", name: "Tomay", what: "Preps your meetings from your email.", when: "Weekdays · 7:00" },
  { kind: "bee", name: "Bea", what: "Sorts your inbox, drafts replies.", when: "Weekdays · 8:00" },
  { kind: "owl", name: "Rook", what: "New stars and issues on GitHub.", when: "Mondays · 8:00" },
  { kind: "octopus", name: "Atlas", what: "What's next in your Linear backlog.", when: "When you ask" },
];

export const Meet: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = useLand();
  const u = useU() * (land ? 0.82 : 1);
  const w = usePanelW();
  return (
    <Layout
      head={
        <div>
          <Headline text="Garu runs AI agents|on your computer." at={6} size={land ? 70 : 88} />
          <div style={{ marginTop: land ? 26 : 30, opacity: lerp(f, 40, 56, 0, 1), transform: `translateY(${lerp(f, 40, 56, 20, 0)}px)`, fontFamily: inter, fontWeight: 500, fontSize: land ? 40 : 46, letterSpacing: "-0.02em", color: C.fg2 }}>On your schedule. By your rules.</div>
        </div>
      }
      cam={[
        [0, 1, 0, 0],
        [S.meet.dur, 1.03, 0, 0],
      ]}
    >
      <div style={{ width: w, display: "flex", flexDirection: "column", gap: 12 * u }}>
        {AGENTS.map((a, i) => {
          const s = spring({ frame: f - (20 + i * 9), fps, config: { damping: 20, mass: 0.7, stiffness: 160 } });
          const lead = i === 0 ? lerp(f, 108, 128, 0, 1) : 0;
          const dim = i ? lerp(f, 108, 128, 0, 0.45) : 0;
          return (
            <Panel key={a.name} u={u} raised style={{ display: "flex", alignItems: "center", gap: 14 * u, padding: `${16 * u}px ${18 * u}px`, opacity: s * (1 - dim), transform: `translateY(${(1 - s) * 50 * u}px)`, borderColor: lead ? `color-mix(in oklab, ${C.paper} ${30 * lead}%, ${C.line2})` : undefined }}>
              <Avatar kind={a.kind} size={44 * u} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 * u }}>
                  <span style={{ fontSize: 17 * u, fontWeight: 600, letterSpacing: "-0.01em" }}>{a.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12 * u, color: C.fg2, padding: `${3 * u}px ${9 * u}px`, borderRadius: 99, background: C.panel3, whiteSpace: "nowrap" }}>{a.when}</span>
                </div>
                <div style={{ marginTop: 4 * u, fontSize: 14 * u, color: C.fg2, lineHeight: 1.4 }}>{a.what}</div>
              </div>
            </Panel>
          );
        })}
      </div>
    </Layout>
  );
};

// ================================================================= 3 · the brief
// Tomay's "Your day" format (agents/tomay/Garufile.yaml); the people and meetings are made up.
const BRIEF = [
  { k: "Schedule", v: "10:00\u2003Design review with Lena and Sam|12:30\u2003Lunch with Priya|3:00\u2003Weekly 1:1 with Jordan|4:30\u2003Focus: write the launch post" },
  { k: "10:00 · Design review", v: "Last time: Lena sent the homepage draft.|Still open: the pricing copy she's waiting on." },
];
/** When each section of the brief lands (scene frames); the ticks in Garu.tsx follow it. */
export const BRIEF_AT = (i: number) => 18 + i * 9;
export const BRIEF_N = BRIEF.length;

const Section: React.FC<{ at: number; u: number; k: string; v: string }> = ({ at, u, k, v }) => {
  const f = useCurrentFrame();
  const s = useSnap(at);
  const line = lerp(f, at, at + 14, 0, 1);
  return (
    <div style={{ marginTop: 12 * u, opacity: s, transform: `translateY(${(1 - s) * 14 * u}px)` }}>
      <div style={{ height: u * 0.6, background: C.line2, width: `${line * 100}%`, marginBottom: 10 * u }} />
      <div style={{ fontSize: 10.5 * u, letterSpacing: "0.08em", textTransform: "uppercase", color: C.mute, fontWeight: 500 }}>{k}</div>
      {v.split("|").map((l, i) => {
        const [time, title] = l.includes("\u2003") ? l.split("\u2003") : [null, l];
        return (
          <div key={i} style={{ marginTop: 3 * u, fontSize: 14.5 * u, color: C.fg, lineHeight: 1.4 }}>
            {v.includes("|") ? <span style={{ color: C.mute }}>– </span> : null}
            {time ? <span style={{ display: "inline-block", minWidth: "3.3em", fontVariantNumeric: "tabular-nums" }}>{time}</span> : null}
            {title}
          </div>
        );
      })}
    </div>
  );
};

export const Brief: React.FC = () => {
  const u = useU();
  const enter = useSnap(8, { damping: 20 });
  const w = usePanelW(true);
  return (
    <Layout
      head={<Headline text="Wake up to|your day, ready." at={6} size={useHeadSize()} accent={{ Wake: C.fg2, up: C.fg2, to: C.fg2 }} />}
      cam={[
        [0, 1, 0, 0],
        [S.brief.dur, 1.04, 0, 0],
      ]}
    >
      <Panel u={u} raised style={{ width: w, padding: `${18 * u}px ${20 * u}px ${20 * u}px`, opacity: enter, transform: `translateY(${(1 - enter) * 80}px) scale(${0.97 + 0.03 * enter})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 * u }}>
          <Avatar kind="fox" size={32 * u} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14 * u, fontWeight: 600 }}>Tomay</div>
            <div style={{ fontSize: 11 * u, color: C.mute, whiteSpace: "nowrap" }}>Gathers the morning and brings it to you.</div>
          </div>
          <span style={{ fontSize: 12 * u, color: C.mute, fontVariantNumeric: "tabular-nums" }}>7:00 AM</span>
        </div>
        <div style={{ marginTop: 16 * u, fontSize: 19 * u, fontWeight: 600, letterSpacing: "-0.02em" }}>Your day — Monday</div>
        {BRIEF.map((b, i) => (
          <Section key={i} at={BRIEF_AT(i)} u={u} k={b.k} v={b.v} />
        ))}
      </Panel>
    </Layout>
  );
};

// ================================================================= 4 · control: what Bea may do, in plain words
// Bea's Garufile policy (agents/bea/Garufile.yaml), said plainly.
const CAN: { d: Decision; text: string; chip: string }[] = [
  { d: "allow", text: "Read your email", chip: "allowed" },
  { d: "allow", text: "File it under your labels", chip: "allowed" },
  { d: "ask", text: "Draft a reply for you", chip: "asks you first" },
  { d: "block", text: "Anything else", chip: "blocked" },
];
// Attempts in plain words; the tools underneath are the real ones. Garu's Gmail server has no
// send tool at all, which is what the second line says.
const TRIES: { at: number; say: string; tool: string; row: number; plain?: boolean; label?: string }[] = [
  { at: 34, say: "files 11 newsletters", tool: "label_thread · Garu/Newsletters", row: 1 },
  { at: 70, say: "can't send email", tool: "Garu gives her no send tool", row: 3, plain: true, label: "NOT POSSIBLE" },
  { at: 106, say: "wants to draft a reply", tool: "create_draft · to Lena Ortiz", row: 2 },
];
// geometry (control-room px) so the ask row can grow into the approval card exactly
const G = { pill: 62, gap: 12, head: 46, row: 58, foot: 44 };
const STACK = G.pill + G.gap + G.head + CAN.length * G.row + G.foot;
const ASK_ROW = 2;
const ROW_TOP = -STACK / 2 + G.pill + G.gap + G.head + ASK_ROW * G.row; // relative to the stack's centre
const CARD_H = 300;
const MORPH = { start: 156, end: 190 };

export const Control: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = useLand();
  const u = useU();
  const w = usePanelW();
  const enter = useSnap(6, { damping: 20 });
  const cur = TRIES.map((_, i) => i).filter((i) => f >= TRIES[i].at).pop();
  const m = lerp(f, MORPH.start, MORPH.end, 0, 1, Easing.bezier(0.7, 0, 0.2, 1));
  const morphing = f >= MORPH.start;
  const others = 1 - lerp(f, MORPH.start, MORPH.start + 14, 0, 1);
  const top = ROW_TOP + (-CARD_H / 2 - ROW_TOP) * m;
  const h = G.row + (CARD_H - G.row) * m;
  return (
    <Layout
      head={<Headline text="It only touches|what you allow." at={6} outAt={MORPH.start} size={useHeadSize()} accent={{ what: C.allow, you: C.allow, allow: C.allow }} />}
      cam={[
        [0, 1, 0, 0],
        [MORPH.start - 20, 1.04, 0, 0],
        [MORPH.start, 1.06, 0, land ? 0 : -60],
        [MORPH.end, 1, 0, 0],
      ]}
    >
      <div style={{ position: "relative", width: w, height: STACK * u }}>
        <div style={{ position: "absolute", inset: 0, opacity: enter * others, transform: `translateY(${(1 - enter) * 70}px)`, filter: morphing ? `blur(${(1 - others) * 8}px)` : undefined }}>
          {/* the attempt */}
          <div style={{ position: "relative", height: G.pill * u, marginBottom: G.gap * u }}>
            {TRIES.map((t, i) => {
              if (cur === undefined || i > cur || i < cur - 1) return null;
              const lt = f - t.at;
              const inn = lerp(lt, 0, 8, 0, 1);
              const leave = i < cur ? lerp(f - TRIES[cur].at, 0, 8, 0, 1) : 0;
              const d = CAN[t.row].d;
              const stamp = spring({ frame: lt - 10, fps, config: { damping: 11, mass: 0.5, stiffness: 240 } });
              return (
                <Panel key={i} u={u} raised style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 11 * u, padding: `0 ${16 * u}px`, borderColor: lt >= 10 ? `color-mix(in oklab, ${C[d]} 55%, ${C.line2})` : C.line2, opacity: inn * (1 - leave), transform: `translateY(${(1 - inn) * -26 * u + leave * 30 * u}px)` }}>
                  <Avatar kind="bee" size={28 * u} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15 * u }}>
                      <b style={{ fontWeight: 600 }}>Bea</b> <span style={{ color: C.fg2 }}>{t.say}</span>
                    </div>
                    {t.plain ? (
                      <span style={{ display: "block", fontSize: 12 * u, color: C.mute, whiteSpace: "nowrap" }}>{t.tool}</span>
                    ) : (
                      <Mono style={{ display: "block", fontSize: 11 * u, color: C.mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.tool}</Mono>
                    )}
                  </div>
                  <span style={{ opacity: lt >= 10 ? 1 : 0 }}>
                    <Chip d={d} u={u} solid label={t.label ?? (d === "allow" ? "ALLOWED" : d === "ask" ? "ASKS YOU" : "BLOCKED")} scale={stamp} />
                  </span>
                </Panel>
              );
            })}
          </div>
          <Panel u={u} raised style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 * u, height: G.head * u, padding: `0 ${16 * u}px`, borderBottom: `${u * 0.6}px solid ${C.line}` }}>
              <Avatar kind="bee" size={22 * u} />
              <span style={{ fontSize: 13.5 * u, fontWeight: 600 }}>What Bea can do</span>
            </div>
            {CAN.map((r, i) => {
              const t = cur === undefined ? null : TRIES[cur];
              const lt = t ? f - t.at : 0;
              const hit = !!t && t.row === i && lt >= 10;
              const holdAsk = i === ASK_ROW && cur === 2;
              const fade = hit ? lerp(lt, 10, 14, 0, 1) * (holdAsk ? 1 : 1 - lerp(lt, 30, 36, 0, 0.7)) : 0;
              const glow = holdAsk && lt >= 10 ? 0.5 + 0.5 * Math.sin((f - TRIES[2].at) / 5) : 0;
              const s = spring({ frame: f - (12 + i * 5), fps, config: { damping: 22, mass: 0.6, stiffness: 180 } });
              return (
                <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 * u, height: G.row * u, padding: `0 ${16 * u}px`, borderTop: i ? `${u * 0.6}px solid ${C.line}` : undefined, background: hit ? `color-mix(in oklab, ${C[r.d]} ${(12 + 6 * glow) * fade}%, transparent)` : undefined, opacity: s, visibility: morphing && i === ASK_ROW ? "hidden" : undefined }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4 * u, background: C[r.d], opacity: fade }} />
                  <span style={{ width: 22 * u, height: 22 * u, flex: "none", borderRadius: 99, display: "grid", placeItems: "center", fontSize: 13 * u, fontWeight: 700, color: C.bg, background: C[r.d] }}>{r.d === "allow" ? "✓" : r.d === "ask" ? "?" : "✕"}</span>
                  <span style={{ flex: 1, fontSize: 15 * u, color: hit ? C.fg : C.fg2 }}>{r.text}</span>
                  <Chip d={r.d} u={u} label={r.chip} />
                </div>
              );
            })}
          </Panel>
          <div style={{ height: G.foot * u, display: "flex", alignItems: "center", gap: 8 * u, paddingLeft: 4 * u, fontSize: 12.5 * u, color: C.mute, fontFamily: inter }}>
            Written as plain rules in <Mono style={{ color: C.fg2 }}>agents/bea/Garufile.yaml</Mono>
          </div>
        </div>
        {morphing ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: (STACK / 2 + top) * u, height: h * u, borderRadius: 14 * u * m, overflow: "hidden", background: `color-mix(in oklab, ${rgba(C.ask, 0.14)} ${(1 - m) * 100}%, ${C.panel2})`, boxShadow: `inset 0 0 0 ${u * 0.7}px color-mix(in oklab, ${C.ask} ${35 + 30 * (1 - m)}%, ${C.line2}), ${raise(u, m)}` }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: G.row * u, display: "flex", alignItems: "center", gap: 12 * u, padding: `0 ${16 * u}px`, fontFamily: inter, opacity: 1 - lerp(f, MORPH.start + 4, MORPH.start + 14, 0, 1) }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4 * u, background: C.ask }} />
              <span style={{ width: 22 * u, height: 22 * u, borderRadius: 99, display: "grid", placeItems: "center", fontSize: 13 * u, fontWeight: 700, color: C.bg, background: C.ask }}>?</span>
              <span style={{ flex: 1, fontSize: 15 * u, color: C.fg }}>{CAN[ASK_ROW].text}</span>
              <Chip d="ask" u={u} label="asks you first" />
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: CARD_H * u, opacity: lerp(f, MORPH.start + 6, MORPH.start + 20, 0, 1) }}>
              <ReviewBody u={u} />
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

// ================================================================= 5 · the ask
/** The review card's content at CARD_H. */
/** The draft's second sentence, as the model wrote it and as you retype it. */
const DRAFT_HEAD = "Hi Lena, thanks for sending the homepage draft, it reads well. ";
const DRAFT_MODEL = "I'll get back to you on the pricing copy before our review.";
const DRAFT_YOURS = "I'll send the pricing copy by Thursday.";
const TYPE_FRAMES = 26;

const ReviewBody: React.FC<{ u: number; done?: number; tapAt?: number; editAt?: number }> = ({ u, done = 0, tapAt, editAt }) => {
  const f = useCurrentFrame();
  const ok = done > 0.01;
  const press = tapAt !== undefined ? interpolate(f, [tapAt - 2, tapAt, tapAt + 5], [1, 0.9, 1], clamp) : 1;
  const pressEdit = editAt !== undefined ? interpolate(f, [editAt - 2, editAt, editAt + 5], [1, 0.9, 1], clamp) : 1;
  // Editing: the model's sentence goes at the tap, yours types in over it, the caret blinks until Approve.
  const editing = editAt !== undefined && f >= editAt;
  const typeStart = editAt !== undefined ? editAt + 10 : 0;
  const typed = editing ? DRAFT_YOURS.slice(0, Math.floor(lerp(f, typeStart, typeStart + TYPE_FRAMES, 0, DRAFT_YOURS.length, Easing.linear))) : "";
  const edited = editing && typed.length === DRAFT_YOURS.length;
  const modelGone = editAt !== undefined ? lerp(f, editAt + 2, editAt + 10, 1, 0) : 1;
  const caret = editing && !ok && Math.floor(f / 8) % 2 === 0;
  return (
    <div style={{ fontFamily: inter, color: C.fg, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: `${18 * u}px ${18 * u}px 0` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 * u }}>
          <Avatar kind="bee" size={34 * u} ring={ok ? rgba(C.allow, 0.35 * done) : rgba(C.ask, 0.35)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15 * u }}>
              <b style={{ fontWeight: 600 }}>bea</b> <span style={{ color: C.fg2 }}>wants to draft</span> <b style={{ fontWeight: 600 }}>an email</b>{" "}
              <Mono style={{ fontSize: 11 * u, color: C.mute, border: `${u * 0.6}px solid ${C.line2}`, borderRadius: 4 * u, padding: `0 ${5 * u}px` }}>create_draft</Mono>
            </div>
            <div style={{ marginTop: 3 * u, fontSize: 12.5 * u, color: C.mute }}>a draft reply in your name</div>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ opacity: 1 - done }}>
              <Chip d="ask" u={u} label="waiting" />
            </div>
            <div style={{ position: "absolute", right: 0, top: 0, opacity: done, transform: `scale(${0.6 + 0.4 * done})`, transformOrigin: "100% 50%" }}>
              <Chip d="allow" u={u} label="approved" />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 * u, borderRadius: 9 * u, border: `${u * 0.6}px solid ${C.line}`, background: rgba(C.bg, 0.6), overflow: "hidden" }}>
          <div style={{ display: "flex", padding: `${6 * u}px ${12 * u}px`, borderBottom: `${u * 0.6}px solid ${C.line}`, fontFamily: mono, fontSize: 11.5 * u, color: C.mute }}>
            <span>To  Lena Ortiz</span>
            <span style={{ marginLeft: "auto" }}>Re: Homepage draft</span>
          </div>
          <div style={{ height: 104 * u, overflow: "hidden", padding: `${10 * u}px ${14 * u}px`, position: "relative" }}>
            <div style={{ fontSize: 14.5 * u, color: C.fg, lineHeight: 1.45, outline: editing && !ok ? `${u * 0.7}px solid ${rgba(C.paper, 0.35)}` : undefined, outlineOffset: 4 * u, borderRadius: 4 * u }}>
              {DRAFT_HEAD}
              {editing ? (
                <>
                  <span style={{ opacity: modelGone, textDecoration: modelGone < 1 ? "line-through" : undefined, color: C.mute }}>{modelGone > 0.02 ? DRAFT_MODEL : ""}</span>
                  <span style={{ color: C.paper }}>{typed}</span>
                  {caret ? <span style={{ display: "inline-block", width: 2 * u, height: 15 * u, verticalAlign: "-2px", background: C.paper, marginLeft: 1 }} /> : null}
                </>
              ) : (
                DRAFT_MODEL
              )}
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 24 * u, background: "linear-gradient(180deg, rgba(14,16,20,0), rgba(14,16,20,1))" }} />
          </div>
        </div>
      </div>
      <div style={{ marginTop: "auto", display: "flex", gap: 8 * u, padding: `${12 * u}px ${18 * u}px`, borderTop: `${u * 0.6}px solid ${C.line}`, background: rgba(C.bg, 0.3) }}>
        <div style={{ position: "relative" }}>
          <Btn u={u} tone="ok" fill={Math.min(1, done)} scale={press}>
            {ok ? "✓ Approved" : edited ? "Approve as edited" : "Approve"}
          </Btn>
          {tapAt !== undefined ? (
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
              <Finger at={tapAt} u={u} />
            </div>
          ) : null}
        </div>
        {editAt !== undefined ? (
          <div style={{ position: "relative", opacity: editing ? 0.55 : 1 }}>
            <Btn u={u} scale={pressEdit}>Edit</Btn>
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
              <Finger at={editAt} u={u} ripple={C.paper} />
            </div>
          </div>
        ) : null}
        {editAt === undefined ? <Btn u={u} dim={done}>Approve for 24h</Btn> : null}
        <Btn u={u} tone="bad" dim={done}>Decline</Btn>
      </div>
    </div>
  );
};

export const ASK_EDIT = 30;
export const ASK_TAP = 98;

/** `short`: the 15-second cut has no room for two headlines, so the second one is there from the start. */
export const Ask: React.FC<{ tap?: number; short?: boolean }> = ({ tap = ASK_TAP, short }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = useLand();
  const u = useU();
  const w = usePanelW();
  const hs = useHeadSize();
  const swap = tap + 18;
  const done = spring({ frame: f - (tap + 2), fps, config: { damping: 16, mass: 0.5, stiffness: 220 } });
  const flash = f >= tap ? Math.max(0, 1 - (f - tap) / 16) : 0;
  const logIn = useSnap(tap + 22);
  const after = short
    ? <Headline text="One tap on|your phone.|Saved, not sent." at={4} size={hs} accent={{ Saved: C.fg2, not: C.fg2, sent: C.fg2 }} />
    : <Headline text="Your words,|not the model's.|Saved, not sent." at={swap + 10} size={hs} accent={{ Saved: C.fg2, not: C.fg2, sent: C.fg2 }} />;
  return (
    <Layout
      head={short ? after : <Swap a={<Headline text="Nothing goes out|without your OK." at={4} outAt={swap} size={hs} accent={{ OK: C.allow }} />} b={after} />}
      cam={[
        [0, 1, 0, 0],
        [tap - 24, 1.05, 0, land ? -20 : -70],
        [tap, 1.09, 0, land ? -20 : -70],
        [tap + 6, 1.12, 0, land ? -20 : -70],
        [tap + 44, 1.02, 0, 0],
      ]}
    >
      <div style={{ width: w, position: "relative" }}>
        <div style={{ position: "relative", height: CARD_H * u, borderRadius: 14 * u, overflow: "hidden", background: C.panel2, boxShadow: `inset 0 0 0 ${u * 0.7}px ${done > 0.01 ? `color-mix(in oklab, ${C.allow} ${35 + 30 * done}%, ${C.line2})` : `color-mix(in oklab, ${C.ask} 35%, ${C.line2})`}, ${raise(u)}, 0 0 ${120 * flash}px ${rgba(C.allow, 0.45 * flash)}` }}>
          <ReviewBody u={u} done={done} tapAt={tap} editAt={short ? undefined : ASK_EDIT} />
        </div>
        <Panel u={u} style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 14 * u, opacity: logIn, transform: `translateY(${(1 - logIn) * 30 * u}px)`, display: "flex", alignItems: "center", gap: 11 * u, padding: `${12 * u}px ${14 * u}px` }}>
          <Avatar kind="bee" size={26 * u} />
          <span style={{ fontSize: 14.5 * u }}>
            <b style={{ fontWeight: 600 }}>Bea</b> <span style={{ color: C.fg2 }}>saved it in Drafts</span>
          </span>
          <span style={{ marginLeft: "auto" }}>
            <Chip d="allow" u={u} label="not sent" />
          </span>
        </Panel>
      </div>
    </Layout>
  );
};

// ================================================================= 6 · it learns
// Three approved drafts to the same address: suggest.ts then narrows the rule to that address
// (narrowestRule), and the card is the quiet one. Drafts to three different people would give
// the whole tool and the card's amber warning instead.
const HIST = [
  { day: "Wed", at: 6, to: "Lena" },
  { day: "Thu", at: 11, to: "Lena" },
  { day: "Fri", at: 16, to: "Lena" },
];
export const LEARN_AT = HIST.map((h) => h.at);
const LEARN = { card: 26, tap: 118 };
export const LEARN_TAP = LEARN.tap;
const RULE_YAML = '- tool: "gmail.create_draft"\n  action: allow\n  when:\n    to: {"eq":["lena@example.com"]}';

export const Learn: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = useLand();
  const u = useU() * (land ? 0.95 : 0.93); // the history plus the card with its four-line rule is the tallest stack in the film
  const w = usePanelW();
  const card = useSnap(LEARN.card, { damping: 20 });
  const added = spring({ frame: f - (LEARN.tap + 2), fps, config: { damping: 16, mass: 0.5, stiffness: 220 } });
  const yamlChars = Math.floor(lerp(f, LEARN.card + 10, LEARN.card + 40, 0, RULE_YAML.length, Easing.linear));
  const count = HIST.filter((h) => f >= h.at).length;
  return (
    <Layout
      head={<Headline text="It learns|what you trust." at={6} size={useHeadSize()} accent={{ what: C.allow, you: C.allow, trust: C.allow }} />}
      cam={[
        [0, 1, 0, 0],
        [LEARN.tap, 1.05, 0, land ? 0 : -40],
        [LEARN.tap + 40, 1.02, 0, 0],
      ]}
    >
      <div style={{ width: w }}>
        <Panel u={u} style={{ overflow: "hidden", opacity: lerp(f, 8, 16, 0, 1) }}>
          {HIST.map((h, i) => {
            if (f < h.at) return null;
            const s = spring({ frame: f - h.at, fps, config: { damping: 22, mass: 0.6, stiffness: 180 } });
            return (
              <div key={i} style={{ height: 44 * u, display: "flex", alignItems: "center", gap: 10 * u, padding: `0 ${14 * u}px`, borderTop: i ? `${u * 0.6}px solid ${C.line}` : undefined, opacity: s, transform: `translateY(${(1 - s) * 16 * u}px)` }}>
                <Avatar kind="bee" size={22 * u} />
                <span style={{ fontSize: 14 * u }}>
                  <b style={{ fontWeight: 600 }}>Bea's</b> <span style={{ color: C.fg2 }}>draft to {h.to}</span>
                </span>
                <span style={{ marginLeft: "auto" }}>
                  <Chip d="allow" u={u} label="you approved" />
                </span>
                <span style={{ width: 34 * u, textAlign: "right", fontSize: 12 * u, color: C.mute }}>{h.day}</span>
              </div>
            );
          })}
          <div style={{ height: (3 - count) * 44 * u }} />
        </Panel>
        <div style={{ height: 16 * u }} />
        <Panel u={u} raised style={{ overflow: "hidden", borderColor: `color-mix(in oklab, ${C.allow} ${30 + 30 * added}%, ${C.line2})`, opacity: card, transform: `translateY(${(1 - card) * 70}px) scale(${0.97 + 0.03 * card})`, boxShadow: `${raise(u)}, 0 0 ${100 * Math.max(0, 1 - (f - LEARN.tap) / 18) * (f >= LEARN.tap ? 1 : 0)}px ${rgba(C.allow, 0.4)}` }}>
          <div style={{ display: "flex", gap: 11 * u, padding: `${16 * u}px ${16 * u}px 0` }}>
            <Avatar kind="bee" size={30 * u} />
            <div style={{ flex: 1, fontSize: 14 * u, lineHeight: 1.45 }}>
              You've approved <span style={{ whiteSpace: "nowrap" }}><b style={{ fontWeight: 600 }}>bea</b> → <Mono style={{ fontSize: 13 * u }}>gmail.create_draft</Mono></span> <b style={{ fontWeight: 600, whiteSpace: "nowrap" }}>3 times</b> and never declined it.
              <div style={{ marginTop: 3 * u, fontSize: 13 * u, color: C.fg2 }}>
                Stop asking? This is the rule Garu would add, scoped to what you actually approved: <span style={{ color: C.fg }}>allow gmail.create_draft when to is exactly ["lena@example.com"]</span>.
              </div>
            </div>
          </div>
          <pre style={{ margin: `${12 * u}px ${16 * u}px 0`, padding: `${9 * u}px ${12 * u}px`, borderRadius: 9 * u, border: `${u * 0.6}px solid ${C.line}`, background: rgba(C.bg, 0.6), fontFamily: mono, fontSize: 13 * u, lineHeight: 1.55, color: C.fg2, minHeight: 4 * 13 * u * 1.55 }}>
            {RULE_YAML.slice(0, yamlChars)
              .split("\n")
              .map((l, i) => (
                <div key={i}>
                  {l.includes("allow") ? (
                    <>
                      {l.replace("allow", "")}
                      <span style={{ color: C.allow, fontWeight: 700 }}>allow</span>
                    </>
                  ) : (
                    l
                  )}
                </div>
              ))}
          </pre>
          <div style={{ marginTop: 12 * u, display: "flex", alignItems: "center", gap: 8 * u, padding: `${12 * u}px ${16 * u}px`, borderTop: `${u * 0.6}px solid ${C.line}`, background: rgba(C.bg, 0.3), minHeight: 60 * u }}>
            {added < 0.5 ? (
              <>
                <div style={{ position: "relative" }}>
                  <Btn u={u} tone="ok" scale={interpolate(f, [LEARN.tap - 2, LEARN.tap, LEARN.tap + 5], [1, 0.9, 1], clamp)}>
                    Add to Garufile
                  </Btn>
                  <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
                    <Finger at={LEARN.tap} u={u} />
                  </div>
                </div>
                <Btn u={u}>Not now</Btn>
              </>
            ) : (
              <span style={{ fontSize: 13.5 * u, color: C.allow, opacity: added, transform: `translateY(${(1 - added) * 10}px)` }}>
                Added to <Mono style={{ fontSize: 12.5 * u }}>agents/bea/Garufile.yaml</Mono>. It applies from the next run.
              </span>
            )}
          </div>
        </Panel>
      </div>
    </Layout>
  );
};

// ================================================================= 7 · proof (three equal beats over five bars)
const PROOF = Math.floor(S.proof.dur / 3);
export const PROOF_BEAT = PROOF;
const ProofBeat: React.FC<{ i: number; head: string; accent?: Record<string, string>; children: React.ReactNode }> = ({ i, head, accent, children }) => {
  const f = useCurrentFrame();
  const hs = useHeadSize();
  const local = f - i * PROOF - XF / 2;
  const a = lerp(local, -4, 6, 0, 1);
  const b = i === 2 ? 1 : lerp(local, PROOF - 8, PROOF, 1, 0);
  if (local < -6 || local > PROOF + 2) return null;
  return (
    <AbsoluteFill style={{ opacity: Math.min(a, b), transform: `scale(${0.97 + 0.03 * a + (1 - b) * 0.05})` }}>
      <Layout head={<Headline text={head} at={i * PROOF + XF / 2} size={hs} accent={accent} />}>{children}</Layout>
    </AbsoluteFill>
  );
};

const Pill: React.FC<{ u: number; at: number; dot?: string; children: React.ReactNode; big?: boolean }> = ({ u, at, dot, children, big }) => {
  const s = useSnap(at, { damping: 14 });
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 12 * u, padding: big ? `${14 * u}px ${24 * u}px` : `${11 * u}px ${18 * u}px`, borderRadius: 999, background: C.panel2, boxShadow: `inset 0 0 0 ${u * 0.7}px ${C.line2}`, fontFamily: inter, fontWeight: 600, fontSize: (big ? 22 : 17) * u, color: C.paper, opacity: s, transform: `scale(${0.85 + 0.15 * s})`, whiteSpace: "nowrap" }}>
      {dot ? <span style={{ width: 10 * u, height: 10 * u, borderRadius: 9, background: dot }} /> : null}
      {children}
    </div>
  );
};

export const Proof: React.FC = () => {
  const f = useCurrentFrame();
  const land = useLand();
  const u = useU();
  const w = usePanelW(true);
  const o = XF / 2;
  const cmd = "npm run garu -- ui --up";
  const l1 = f - PROOF - o;
  const typed = cmd.slice(0, Math.floor(lerp(l1, 2, 16, 0, cmd.length, Easing.linear)));
  return (
    <AbsoluteFill>
      <ProofBeat i={0} head="Free and|open source.">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 * u }}>
          <Pill u={u} at={o + 6} dot={C.allow} big>
            Apache-2.0
          </Pill>
          <Mono style={{ fontSize: 14 * u, color: C.fg2, opacity: lerp(f, o + 12, o + 20, 0, 1) }}>github.com/humbertovillanueva/garu</Mono>
        </div>
      </ProofBeat>
      <ProofBeat i={1} head="Runs on your|own computer.">
        {/* on 9:16 the terminal sits up under the headline instead of in the middle of the empty lower half */}
        <Panel u={u} raised style={{ width: w, overflow: "hidden", transform: land ? undefined : "translateY(-120px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 * u, height: 36 * u, padding: `0 ${14 * u}px`, borderBottom: `${u * 0.6}px solid ${C.line}` }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 9 * u, height: 9 * u, borderRadius: 9, background: rgba(C.paper, 0.14) }} />
            ))}
            <Mono style={{ marginLeft: 8 * u, fontSize: 11.5 * u, color: C.mute }}>~/garu</Mono>
          </div>
          <div style={{ padding: `${16 * u}px ${16 * u}px ${18 * u}px`, fontFamily: mono, fontSize: (land ? 14 : 13) * u, lineHeight: 1.85, color: C.fg2 }}>
            <div>
              <span style={{ color: C.allow }}>$</span> <span style={{ color: C.fg }}>{typed}</span>
            </div>
            <div style={{ opacity: l1 >= 20 ? 1 : 0 }}>
              <span style={{ color: C.fg }}>garu control room</span> → <span style={{ color: C.paper, textDecoration: "underline" }}>http://127.0.0.1:4000</span>
            </div>
            <div style={{ opacity: l1 >= 24 ? 1 : 0 }}>&nbsp;&nbsp;running 3 cron schedule(s) from Garufiles under ~/garu</div>
            <div style={{ opacity: l1 >= 28 ? 1 : 0 }}>Ctrl-C to stop.</div>
          </div>
        </Panel>
      </ProofBeat>
      <ProofBeat i={2} head="Gemini, Claude,|OpenAI, or local." accent={{ or: C.fg2, "local.": C.fg2 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * u }}>
          <Pill u={u} at={2 * PROOF + o + 3}>
            Gemini <span style={{ color: C.mute, fontWeight: 500 }}>· free tier</span>
          </Pill>
          <Pill u={u} at={2 * PROOF + o + 6}>
            Claude <span style={{ color: C.mute, fontWeight: 500 }}>· your key</span>
          </Pill>
          <Pill u={u} at={2 * PROOF + o + 9}>
            OpenAI <span style={{ color: C.mute, fontWeight: 500 }}>· or any compatible API</span>
          </Pill>
          <Pill u={u} at={2 * PROOF + o + 12}>
            Ollama <span style={{ color: C.mute, fontWeight: 500 }}>· $0, offline</span>
          </Pill>
        </div>
      </ProofBeat>
    </AbsoluteFill>
  );
};

// ================================================================= 8 · logo + call to action
/** `fast`: the 15-second cut's card has two seconds, so everything lands sooner. */
export const Logo: React.FC<{ dur?: number; fast?: boolean }> = ({ dur = S.logo.dur, fast }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = useLand();
  const k = fast ? 0.5 : 1;
  const ring = lerp(f, 0, 18 * k, 0, 1, Easing.bezier(0.3, 0, 0.2, 1));
  const cat = spring({ frame: f - 8 * k, fps, config: { damping: 13, mass: 0.6 } });
  const word = spring({ frame: f - 18 * k, fps, config: { damping: 22, mass: 0.6 } });
  const tag = spring({ frame: f - 26 * k, fps, config: { damping: 22, mass: 0.6 } });
  const sub = spring({ frame: f - 40 * k, fps, config: { damping: 22, mass: 0.6 } });
  const cta = spring({ frame: f - 50 * k, fps, config: { damping: 20, mass: 0.6 } });
  const flash = Math.max(0, 1 - f / 14);
  const end = lerp(f, dur - 16, dur, 1, 0);
  const size = land ? 190 : 240;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", opacity: end }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% ${land ? 38 : 40}%, ${rgba(C.paper, 0.16 * flash)}, ${rgba(C.paper, 0)} 45%)` }} />
      <GaruMark size={size} ring={ring} cat={cat} style={{ transform: `scale(${1.15 - 0.15 * ring})` }} />
      <div style={{ marginTop: 32, fontFamily: inter, fontWeight: 700, fontSize: land ? 88 : 112, letterSpacing: "-0.045em", color: C.paper, opacity: word, transform: `translateY(${(1 - word) * 30}px)` }}>Garu</div>
      <div style={{ marginTop: 6, fontFamily: inter, fontWeight: 500, fontSize: land ? 38 : 46, letterSpacing: "-0.02em", color: C.fg2, opacity: tag, transform: `translateY(${(1 - tag) * 24}px)`, textAlign: "center", padding: "0 60px" }}>Always-on agents you can actually trust.</div>
      <div style={{ marginTop: land ? 40 : 60, fontFamily: inter, fontWeight: 600, fontSize: land ? 30 : 36, color: C.fg2, opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>Free · Runs on your computer</div>
      {/* the address is the one thing to take away: second only to the wordmark */}
      <div style={{ marginTop: land ? 22 : 28, fontFamily: inter, fontWeight: 600, fontSize: land ? 48 : 56, letterSpacing: "-0.03em", color: C.paper, opacity: cta, transform: `translateY(${(1 - cta) * 24}px)` }}>garuagents.com</div>
    </AbsoluteFill>
  );
};
