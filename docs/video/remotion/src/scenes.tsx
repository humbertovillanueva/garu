import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BAR, C, inter, mono, S, XF } from "./theme";
import { Avatar, Cam, Chip, clamp, Decision, Headline, Kind, lerp, Mono, Panel, useLand, useSnap, useU } from "./ui";

/** Headline above / content below on 9:16; headline left / content right on 16:9. */
const Layout: React.FC<{ head?: React.ReactNode; children: React.ReactNode; cam?: [number, number, number, number][] }> = ({ head, children, cam }) => {
  const land = useLand();
  const content = land ? (
    <div style={{ position: "absolute", left: 880, right: 60, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ transform: "scale(0.9)" }}>{children}</div>
    </div>
  ) : (
    <div style={{ position: "absolute", left: 0, right: 0, top: 520, bottom: 110, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
  );
  return (
    <AbsoluteFill>
      {cam ? <Cam keys={cam} style={{ transformOrigin: land ? "68% 50%" : "50% 62%" }}>{content}</Cam> : content}
      {land ? <div style={{ position: "absolute", left: 110, top: 0, bottom: 0, width: 760, display: "flex", alignItems: "center" }}>{head}</div> : <div style={{ position: "absolute", left: 84, right: 84, top: 170 }}>{head}</div>}
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
      <div style={{ position: "absolute", width: 44 * u, height: 44 * u, left: -22 * u, top: -22 * u, borderRadius: 999, background: "rgba(244,241,234,0.26)", boxShadow: `0 0 0 ${2 * u}px rgba(244,241,234,0.6), 0 ${8 * u}px ${24 * u}px rgba(0,0,0,0.5)`, transform: `translate(${(1 - fin) * 70 * u}px, ${(1 - fin) * 110 * u}px) scale(${press})`, opacity: fin * out }} />
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
const DOTS = (() => {
  const out: { min: number; x: number; y: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let h = 0; h < 7; h++) for (let k = 0; k < 4; k++) out.push({ min: h * 60 + 5 + k * 9, x: rnd(), y: rnd() });
  return out;
})();
const QUESTION = BAR * 2; // "But would you trust one?" lands on bar 2

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const land = useLand();
  const mins = interpolate(f, [4, 80], [-2, 420], { ...clamp, easing: Easing.bezier(0.7, 0, 0.25, 1) });
  const m = Math.round(mins);
  const hh = ((Math.floor((m + 24 * 60) / 60) % 24) + 24) % 24;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const mm = String(((m % 60) + 60) % 60).padStart(2, "0");
  const ampm = hh < 12 ? "AM" : "PM";
  const doubt = lerp(f, QUESTION - 6, QUESTION + 10, 0, 1);
  const W = land ? 1920 : 1080;
  const H = land ? 1080 : 1920;
  const size = land ? 230 : 240;
  return (
    <AbsoluteFill>
      {DOTS.map((d, i) => {
        if (mins < d.min) return null;
        const born = interpolate(mins, [d.min, d.min + 25], [0, 1], clamp);
        const ang = d.y * Math.PI * 2;
        const ring = (d.x * 0.5 + 0.5) * 0.42;
        const x = W / 2 + Math.cos(ang) * W * ring * (land ? 1 : 1.05);
        const y = H * (land ? 0.56 : 0.58) + Math.sin(ang) * H * ring * (land ? 0.8 : 0.42);
        const r = 9 * (1 + (1 - born) * 0.8);
        // under the question, what the agents did becomes unknown
        const col = `color-mix(in oklab, ${C.allow} ${100 - doubt * 100}%, ${C.mute})`;
        return <div key={i} style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: 99, background: col, opacity: (0.25 + 0.75 * (1 - born)) * (1 - doubt * 0.5), boxShadow: doubt < 0.5 ? `0 0 20px ${C.allow}` : undefined }} />;
      })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: land ? 220 : 300, opacity: 1 - doubt * 0.82, filter: doubt > 0.01 ? `blur(${doubt * 6}px)` : undefined }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 22, fontFamily: inter, fontWeight: 700, fontSize: size, letterSpacing: "-0.05em", color: C.paper, fontVariantNumeric: "tabular-nums", opacity: lerp(f, 0, 8, 0, 1) }}>
          <span>
            {h12}:{mm}
          </span>
          <span style={{ fontSize: size * 0.32, fontWeight: 600, color: C.fg2, letterSpacing: "-0.02em" }}>{ampm}</span>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", padding: land ? "130px 120px 0" : "260px 70px 0" }}>
        <Headline text="AI agents can work|while you sleep." at={6} outAt={QUESTION - 10} size={land ? 92 : 104} align="center" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 70 }}>
        <Headline text="But would you|trust one?" at={QUESTION + 2} size={132} align="center" accent={{ trust: C.ask, one: C.ask }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ================================================================= 2 · meet
const AGENTS: { kind: Kind; name: string; what: string; when: string }[] = [
  { kind: "fox", name: "Tomay", what: "Reads your calendar and preps every meeting from your email.", when: "Weekdays · 7:00" },
  { kind: "bee", name: "Bea", what: "Sorts your inbox and drafts the replies. Never sends.", when: "Weekdays · 7:15" },
  { kind: "owl", name: "Rook", what: "Checks your GitHub repo for new stars and issues.", when: "Mondays · 8:00" },
  { kind: "octopus", name: "Atlas", what: "Reads your backlog in Linear and says what's next.", when: "When you ask" },
];

export const Meet: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = useLand();
  const u = useU() * (land ? 0.82 : 1);
  const w = land ? 900 : 920;
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
          const lead = i === 0 ? lerp(f, 150, 170, 0, 1) : 0;
          const dim = i ? lerp(f, 150, 170, 0, 0.45) : 0;
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
  { k: "Free blocks", v: "8:00–10:00 · 11:00–12:30 · 1:30–3:00 · 3:30–4:30" },
  { k: "10:00 · Design review", v: "Last time: Lena sent the homepage draft.|Still open: the pricing copy she's waiting on." },
  { k: "3:00 · 1:1 with Jordan", v: "Still open: your comments on the Q4 plan." },
];

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
  const land = useLand();
  const u = useU();
  const enter = useSnap(8, { damping: 20 });
  const w = land ? 860 : 920;
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
        <div style={{ marginTop: 16 * u, fontSize: 19 * u, fontWeight: 600, letterSpacing: "-0.02em" }}>Your day — Monday, October 12</div>
        {BRIEF.map((b, i) => (
          <Section key={i} at={22 + i * 9} u={u} k={b.k} v={b.v} />
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
  { d: "ask", text: "Draft a reply in your name", chip: "asks you first" },
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
  const w = land ? 900 : 920;
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
          <div style={{ position: "absolute", left: 0, right: 0, top: (STACK / 2 + top) * u, height: h * u, borderRadius: 14 * u * m, overflow: "hidden", background: `color-mix(in oklab, rgba(217,178,76,0.14) ${(1 - m) * 100}%, ${C.panel2})`, boxShadow: `inset 0 0 0 ${u * 0.7}px color-mix(in oklab, ${C.ask} ${35 + 30 * (1 - m)}%, ${C.line2}), 0 ${30 * u * m}px ${70 * u * m}px -${24 * u}px rgba(0,0,0,.9)` }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: G.row * u, display: "flex", alignItems: "center", gap: 12 * u, padding: `0 ${16 * u}px`, fontFamily: inter, opacity: 1 - lerp(f, MORPH.start + 4, MORPH.start + 14, 0, 1) }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4 * u, background: C.ask }} />
              <span style={{ width: 22 * u, height: 22 * u, borderRadius: 99, display: "grid", placeItems: "center", fontSize: 13 * u, fontWeight: 700, color: C.bg, background: C.ask }}>?</span>
              <span style={{ flex: 1, fontSize: 15 * u, color: C.fg }}>Draft a reply in your name</span>
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
const ReviewBody: React.FC<{ u: number; done?: number; tapAt?: number }> = ({ u, done = 0, tapAt }) => {
  const f = useCurrentFrame();
  const ok = done > 0.01;
  const press = tapAt !== undefined ? interpolate(f, [tapAt - 2, tapAt, tapAt + 5], [1, 0.9, 1], clamp) : 1;
  return (
    <div style={{ fontFamily: inter, color: C.fg, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: `${18 * u}px ${18 * u}px 0` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 * u }}>
          <Avatar kind="bee" size={34 * u} ring={ok ? `rgba(67,201,121,${0.35 * done})` : "rgba(217,178,76,0.35)"} />
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
        <div style={{ marginTop: 14 * u, borderRadius: 9 * u, border: `${u * 0.6}px solid ${C.line}`, background: "rgba(10,12,15,0.6)", overflow: "hidden" }}>
          <div style={{ display: "flex", padding: `${6 * u}px ${12 * u}px`, borderBottom: `${u * 0.6}px solid ${C.line}`, fontFamily: mono, fontSize: 11.5 * u, color: C.mute }}>
            <span>To  Lena Ortiz</span>
            <span style={{ marginLeft: "auto" }}>Re: Homepage draft</span>
          </div>
          <div style={{ height: 104 * u, overflow: "hidden", padding: `${10 * u}px ${14 * u}px`, position: "relative" }}>
            <div style={{ fontSize: 14.5 * u, color: C.fg, lineHeight: 1.45 }}>Hi Lena, thanks for sending the homepage draft, it reads well. I'll get back to you on the pricing copy before our review.</div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 24 * u, background: "linear-gradient(180deg, rgba(14,16,20,0), rgba(14,16,20,1))" }} />
          </div>
        </div>
      </div>
      <div style={{ marginTop: "auto", display: "flex", gap: 8 * u, padding: `${12 * u}px ${18 * u}px`, borderTop: `${u * 0.6}px solid ${C.line}`, background: "rgba(10,12,15,0.3)" }}>
        <div style={{ position: "relative" }}>
          <Btn u={u} tone="ok" fill={Math.min(1, done)} scale={press}>
            {ok ? "✓ Approved" : "Approve"}
          </Btn>
          {tapAt !== undefined ? (
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
              <Finger at={tapAt} u={u} />
            </div>
          ) : null}
        </div>
        <Btn u={u} dim={done}>Approve for 24h</Btn>
        <Btn u={u} tone="bad" dim={done}>Decline</Btn>
      </div>
    </div>
  );
};

const ASK = { tap: 74, swap: 92 };
export const ASK_TAP = ASK.tap;

export const Ask: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = useLand();
  const u = useU();
  const w = land ? 900 : 920;
  const hs = useHeadSize();
  const done = spring({ frame: f - (ASK.tap + 2), fps, config: { damping: 16, mass: 0.5, stiffness: 220 } });
  const flash = f >= ASK.tap ? Math.max(0, 1 - (f - ASK.tap) / 16) : 0;
  const logIn = useSnap(ASK.tap + 22);
  return (
    <Layout
      head={<Swap a={<Headline text="Nothing goes out|without your OK." at={4} outAt={ASK.swap} size={hs} accent={{ OK: C.allow }} />} b={<Headline text="One tap.|Saved, not sent." at={ASK.swap + 10} size={hs} accent={{ Saved: C.fg2, not: C.fg2, sent: C.fg2 }} />} />}
      cam={[
        [0, 1, 0, 0],
        [ASK.tap - 24, 1.05, 0, land ? -20 : -70],
        [ASK.tap, 1.09, 0, land ? -20 : -70],
        [ASK.tap + 6, 1.12, 0, land ? -20 : -70],
        [ASK.tap + 44, 1.02, 0, 0],
      ]}
    >
      <div style={{ width: w, position: "relative" }}>
        <div style={{ position: "relative", height: CARD_H * u, borderRadius: 14 * u, overflow: "hidden", background: C.panel2, boxShadow: `inset 0 0 0 ${u * 0.7}px ${done > 0.01 ? `color-mix(in oklab, ${C.allow} ${35 + 30 * done}%, ${C.line2})` : `color-mix(in oklab, ${C.ask} 35%, ${C.line2})`}, 0 ${30 * u}px ${70 * u}px -${24 * u}px rgba(0,0,0,.9), 0 0 ${120 * flash}px rgba(67,201,121,${0.45 * flash})` }}>
          <ReviewBody u={u} done={done} tapAt={ASK.tap} />
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
const HIST = [
  { day: "Wed", at: 10, to: "Priya" },
  { day: "Thu", at: 16, to: "Jordan" },
  { day: "Fri", at: 22, to: "Lena" },
];
const LEARN = { card: 34, tap: 100 };
export const LEARN_TAP = LEARN.tap;

export const Learn: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = useLand();
  const u = useU();
  const w = land ? 900 : 920;
  const card = useSnap(LEARN.card, { damping: 20 });
  const added = spring({ frame: f - (LEARN.tap + 2), fps, config: { damping: 16, mass: 0.5, stiffness: 220 } });
  const yamlChars = Math.floor(lerp(f, LEARN.card + 10, LEARN.card + 34, 0, 60, Easing.linear));
  const yaml = '- tool: "gmail.create_draft"\n  action: allow';
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
        <Panel u={u} raised style={{ overflow: "hidden", borderColor: `color-mix(in oklab, ${C.allow} ${30 + 30 * added}%, ${C.line2})`, opacity: card, transform: `translateY(${(1 - card) * 70}px) scale(${0.97 + 0.03 * card})`, boxShadow: `0 ${30 * u}px ${70 * u}px -${24 * u}px rgba(0,0,0,.9), 0 0 ${100 * Math.max(0, 1 - (f - LEARN.tap) / 18) * (f >= LEARN.tap ? 1 : 0)}px rgba(67,201,121,0.4)` }}>
          <div style={{ display: "flex", gap: 11 * u, padding: `${16 * u}px ${16 * u}px 0` }}>
            <Avatar kind="bee" size={30 * u} />
            <div style={{ flex: 1, fontSize: 14 * u, lineHeight: 1.45 }}>
              You've approved <span style={{ whiteSpace: "nowrap" }}><b style={{ fontWeight: 600 }}>bea</b> → <Mono style={{ fontSize: 13 * u }}>gmail.create_draft</Mono></span> <b style={{ fontWeight: 600, whiteSpace: "nowrap" }}>3 times</b> and never declined it.
              <div style={{ marginTop: 3 * u, fontSize: 13 * u, color: C.fg2 }}>Stop asking? This is the rule Garu would add.</div>
            </div>
          </div>
          <pre style={{ margin: `${12 * u}px ${16 * u}px 0`, padding: `${9 * u}px ${12 * u}px`, borderRadius: 9 * u, border: `${u * 0.6}px solid ${C.line}`, background: "rgba(10,12,15,0.6)", fontFamily: mono, fontSize: 13 * u, lineHeight: 1.55, color: C.fg2, minHeight: 2 * 13 * u * 1.55 }}>
            {yaml
              .slice(0, yamlChars)
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
          <div style={{ marginTop: 12 * u, display: "flex", alignItems: "center", gap: 8 * u, padding: `${12 * u}px ${16 * u}px`, borderTop: `${u * 0.6}px solid ${C.line}`, background: "rgba(10,12,15,0.3)", minHeight: 60 * u }}>
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
              <span style={{ fontSize: 14 * u, color: C.allow, opacity: added, transform: `translateY(${(1 - added) * 10}px)` }}>✓ Drafts now save without asking. Never sent.</span>
            )}
          </div>
        </Panel>
      </div>
    </Layout>
  );
};

// ================================================================= 7 · proof (three one-bar beats)
const PROOF = BAR;
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
  const w = land ? 860 : 920;
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
        <Panel u={u} raised style={{ width: w, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 * u, height: 36 * u, padding: `0 ${14 * u}px`, borderBottom: `${u * 0.6}px solid ${C.line}` }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 9 * u, height: 9 * u, borderRadius: 9, background: "rgba(244,241,234,0.14)" }} />
            ))}
            <Mono style={{ marginLeft: 8 * u, fontSize: 11.5 * u, color: C.mute }}>~/garu</Mono>
          </div>
          <div style={{ padding: `${14 * u}px ${16 * u}px ${16 * u}px`, fontFamily: mono, fontSize: (land ? 14 : 12.5) * u, lineHeight: 1.75, color: C.fg2 }}>
            <div>
              <span style={{ color: C.allow }}>$</span> <span style={{ color: C.fg }}>{typed}</span>
            </div>
            <div style={{ opacity: l1 >= 20 ? 1 : 0 }}>
              <span style={{ color: C.fg }}>garu control room</span> → <span style={{ color: C.paper, textDecoration: "underline" }}>http://127.0.0.1:4000</span>
            </div>
            <div style={{ opacity: l1 >= 24 ? 1 : 0 }}>running 4 cron schedule(s)</div>
          </div>
        </Panel>
      </ProofBeat>
      <ProofBeat i={2} head="Gemini, Claude,|or fully local." accent={{ or: C.fg2, fully: C.fg2, local: C.fg2 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 * u }}>
          <Pill u={u} at={2 * PROOF + o + 6}>
            Gemini <span style={{ color: C.mute, fontWeight: 500 }}>· free tier</span>
          </Pill>
          <Pill u={u} at={2 * PROOF + o + 11}>
            Claude <span style={{ color: C.mute, fontWeight: 500 }}>· your key</span>
          </Pill>
          <Pill u={u} at={2 * PROOF + o + 16}>
            Ollama <span style={{ color: C.mute, fontWeight: 500 }}>· $0, offline</span>
          </Pill>
        </div>
      </ProofBeat>
    </AbsoluteFill>
  );
};

// ================================================================= 8 · logo + call to action
export const Logo: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = useLand();
  const ring = lerp(f, 0, 18, 0, 1, Easing.bezier(0.3, 0, 0.2, 1));
  const cat = spring({ frame: f - 8, fps, config: { damping: 13, mass: 0.6 } });
  const word = spring({ frame: f - 18, fps, config: { damping: 22, mass: 0.6 } });
  const tag = spring({ frame: f - 26, fps, config: { damping: 22, mass: 0.6 } });
  const sub = spring({ frame: f - 40, fps, config: { damping: 22, mass: 0.6 } });
  const cta = spring({ frame: f - 50, fps, config: { damping: 20, mass: 0.6 } });
  const flash = Math.max(0, 1 - f / 14);
  const end = lerp(f, S.logo.dur - 16, S.logo.dur, 1, 0);
  const size = land ? 190 : 240;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", opacity: end }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% ${land ? 38 : 40}%, rgba(244,241,234,${0.16 * flash}), rgba(244,241,234,0) 45%)` }} />
      <svg viewBox="0 0 100 100" width={size} height={size} fill="none" style={{ color: C.paper, transform: `scale(${1.15 - 0.15 * ring})` }}>
        <defs>
          <mask id="garu-cat">
            <g fill="#fff">
              <ellipse cx="48.5" cy="52.0" rx="23.0" ry="20.70" />
              <polygon points="44.82,42.34 29.64,40.96 27.80,19.34" />
              <polygon points="52.18,42.34 67.36,40.96 69.20,19.34" />
            </g>
            <g fill="#000">
              <rect x="25.04" y="41.42" width="46.92" height="4.60" rx="2.30" transform="rotate(6 48.5 43.72)" />
              <ellipse cx="39.30" cy="53.38" rx="5.98" ry="2.07" transform="rotate(12 39.30 53.38)" />
              <ellipse cx="57.70" cy="53.38" rx="5.98" ry="2.07" transform="rotate(-12 57.70 53.38)" />
              <polygon points="46.66,60.28 50.34,60.28 48.5,62.58" />
            </g>
            <g fill="#fff">
              <rect x="38.61" y="51.66" width="1.38" height="3.45" rx="0.69" />
              <rect x="57.01" y="51.66" width="1.38" height="3.45" rx="0.69" />
            </g>
          </mask>
        </defs>
        <path d="M 91.77 54.39 A 42 42 0 1 1 84.82 26.51" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ring} />
        <g style={{ transformOrigin: "48.5px 48px", transform: `scale(${0.6 + 0.4 * cat})`, opacity: Math.min(1, cat * 1.3) }}>
          <rect width="100" height="100" fill="currentColor" mask="url(#garu-cat)" />
          <g stroke="currentColor" strokeWidth="3.91" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="71.04,44.18 83.98,36.13 98.35,39.01" />
            <polyline points="71.04,44.18 83.11,47.63 96.34,53.95" />
          </g>
          <circle cx="71.04" cy="44.18" r="3.22" fill="currentColor" />
        </g>
      </svg>
      <div style={{ marginTop: 32, fontFamily: inter, fontWeight: 700, fontSize: land ? 88 : 112, letterSpacing: "-0.045em", color: C.paper, opacity: word, transform: `translateY(${(1 - word) * 30}px)` }}>Garu</div>
      <div style={{ marginTop: 6, fontFamily: inter, fontWeight: 500, fontSize: land ? 38 : 46, letterSpacing: "-0.02em", color: C.fg2, opacity: tag, transform: `translateY(${(1 - tag) * 24}px)`, textAlign: "center", padding: "0 60px" }}>Always-on agents you can actually trust.</div>
      <div style={{ marginTop: land ? 40 : 60, fontFamily: inter, fontWeight: 600, fontSize: land ? 30 : 36, color: C.paper, opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>Free · Runs on your computer</div>
      <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 16, padding: land ? "16px 28px" : "20px 32px", borderRadius: 18, background: C.panel2, boxShadow: `inset 0 0 0 2px ${C.line2}`, fontFamily: mono, fontSize: land ? 24 : 23, color: C.fg, opacity: cta, transform: `translateY(${(1 - cta) * 24}px)` }}>
        <span style={{ color: C.allow }}>$</span> git clone https://github.com/humbertovillanueva/garu
      </div>
    </AbsoluteFill>
  );
};
