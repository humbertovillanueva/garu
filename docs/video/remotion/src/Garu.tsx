import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { BAR, S, SH, SHORT_TOTAL, TOTAL, XF } from "./theme";
import { Backdrop, clamp, GaruMark, lerp, Scene, useLand } from "./ui";
import { Ask, ASK_TAP, Brief, BRIEF_AT, BRIEF_N, Control, Hook, Learn, LEARN_AT, LEARN_TAP, Logo, Meet, Proof, PROOF_BEAT } from "./scenes";

type Span = { from: number; dur: number };
type Shot = { key: string; s: Span; el: React.ReactNode; noIn?: boolean; noOut?: boolean };

// The mix peaks at about -1.4 dBTP and sits near -14 LUFS: score.wav is written with a 0.85 peak
// and plays as is; the one-shots play at 0.7 of their listed level so a tap on top of the groove
// never clips (at full level the sum reached 0 dBTP).
const SCORE = 1;
const SFX = 0.7;

const Sfx: React.FC<{ at: number; src: string; vol: number; len?: number }> = ({ at, src, vol, len = 15 }) => (
  <Sequence from={Math.round(at)} durationInFrames={len}>
    <Audio src={staticFile(src)} volume={vol * SFX} />
  </Sequence>
);

/** A small mark top-left from frame 0 (the thumbnail carries it); it leaves as the big one lands. */
const Mark: React.FC<{ until: number }> = ({ until }) => {
  const f = useCurrentFrame();
  const land = useLand();
  return (
    <div style={{ position: "absolute", left: land ? 110 : 84, top: land ? 60 : 56, opacity: lerp(f, until - 10, until, 1, 0) }}>
      <GaruMark size={land ? 56 : 64} />
    </div>
  );
};

const Film: React.FC<{ shots: Shot[]; sound: React.ReactNode; markUntil: number }> = ({ shots, sound, markUntil }) => (
  <AbsoluteFill>
    <Backdrop />
    {shots.map(({ key, s, el, noIn, noOut }) => (
      <Sequence key={key} from={s.from} durationInFrames={s.dur} name={key}>
        <Scene dur={s.dur} xf={XF} noIn={noIn} noOut={noOut}>
          {el}
        </Scene>
      </Sequence>
    ))}
    <Mark until={markUntil} />
    {sound}
  </AbsoluteFill>
);

// ---------------------------------------------------------------- the film (28 bars)
// noIn/noOut: the hook opens the film, control hands off to ask by morphing (no cut),
// and the logo lands on the score's impact out of black.
const SHOTS: Shot[] = [
  { key: "hook", s: S.hook, el: <Hook />, noIn: true },
  { key: "meet", s: S.meet, el: <Meet /> },
  { key: "brief", s: S.brief, el: <Brief /> },
  { key: "control", s: S.control, el: <Control />, noOut: true },
  { key: "ask", s: S.ask, el: <Ask />, noIn: true },
  { key: "learn", s: S.learn, el: <Learn /> },
  { key: "proof", s: S.proof, el: <Proof /> },
  { key: "logo", s: S.logo, el: <Logo />, noIn: true, noOut: true },
];

const Sound: React.FC = () => (
  <>
    <Audio src={staticFile("audio/score.wav")} volume={(f) => SCORE * interpolate(f, [TOTAL - 30, TOTAL], [1, 0], clamp)} />
    {/* a whoosh on every cut: the question, then each scene's bar line */}
    {[2, 3, 6, 8, 12, 16, 19].map((b) => <Sfx key={`w${b}`} at={b * BAR - 9} src="audio/whoosh.wav" vol={b === 2 ? 0.2 : 0.32} len={20} />)}
    {[1, 2].map((k) => <Sfx key={`wp${k}`} at={S.proof.from + XF / 2 + k * PROOF_BEAT - 6} src="audio/whoosh.wav" vol={0.22} len={20} />)}
    {[0, 1, 2, 3].map((i) => <Sfx key={`m${i}`} at={S.meet.from + 20 + i * 9} src="audio/tick.wav" vol={0.3} />)}
    {Array.from({ length: BRIEF_N }, (_, i) => <Sfx key={`b${i}`} at={S.brief.from + BRIEF_AT(i)} src="audio/tick.wav" vol={0.22} />)}
    {[34, 70, 106].map((t) => <Sfx key={`s${t}`} at={S.control.from + t + 10} src="audio/stamp.wav" vol={0.4} />)}
    <Sfx at={S.ask.from + ASK_TAP - 1} src="audio/tap.wav" vol={0.8} />
    {LEARN_AT.map((t) => <Sfx key={`h${t}`} at={S.learn.from + t} src="audio/tick.wav" vol={0.25} />)}
    <Sfx at={S.learn.from + LEARN_TAP - 1} src="audio/tap.wav" vol={0.7} />
  </>
);

export const GaruVideo: React.FC = () => <Film shots={SHOTS} sound={<Sound />} markUntil={S.logo.from} />;

// ---------------------------------------------------------------- the 15-second cut
const SHORT_ASK_TAP = 36;
const SHORT_SHOTS: Shot[] = [
  { key: "hook", s: SH.hook, el: <Hook question={BAR} />, noIn: true },
  { key: "control", s: SH.control, el: <Control />, noOut: true },
  { key: "ask", s: SH.ask, el: <Ask tap={SHORT_ASK_TAP} short />, noIn: true },
  { key: "logo", s: SH.logo, el: <Logo dur={SH.logo.dur} fast />, noIn: true, noOut: true },
];

/**
 * The score, spliced on bar lines so it still lands: its first two bars (ticks, pad) under the
 * hook; bars 11–17 (the groove; bar 2 ends on C, bar 11 starts on G, the next chord anyway) under
 * control and ask, with the kick on each cut; the impact and its tail from bar 24 under the card.
 */
const Part: React.FC<{ from: number; dur: number; bar: number; fadeOut?: number }> = ({ from, dur, bar, fadeOut = 0 }) => (
  <Sequence from={from} durationInFrames={dur}>
    <Audio src={staticFile("audio/score.wav")} startFrom={bar * BAR} volume={(f) => SCORE * (fadeOut ? interpolate(f, [dur - fadeOut, dur], [1, 0], clamp) : 1)} />
  </Sequence>
);
const ShortSound: React.FC = () => (
  <>
    <Part from={0} dur={2 * BAR} bar={0} />
    <Part from={2 * BAR} dur={6 * BAR} bar={11} />
    <Part from={8 * BAR} dur={SHORT_TOTAL - 8 * BAR} bar={24} fadeOut={24} />
    {[1, 2, 6].map((b) => <Sfx key={`w${b}`} at={b * BAR - 9} src="audio/whoosh.wav" vol={b === 1 ? 0.2 : 0.32} len={20} />)}
    {[34, 70, 106].map((t) => <Sfx key={`s${t}`} at={SH.control.from + t + 10} src="audio/stamp.wav" vol={0.4} />)}
    <Sfx at={SH.ask.from + SHORT_ASK_TAP - 1} src="audio/tap.wav" vol={0.8} />
  </>
);

export const GaruShort: React.FC = () => <Film shots={SHORT_SHOTS} sound={<ShortSound />} markUntil={SH.logo.from} />;
