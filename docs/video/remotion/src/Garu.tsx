import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from "remotion";
import { BAR, S, TOTAL, XF } from "./theme";
import { Backdrop, clamp, Scene } from "./ui";
import { Ask, ASK_TAP, Brief, Control, Hook, Learn, LEARN_TAP, Logo, Meet, Proof } from "./scenes";

// noIn/noOut: the hook opens the film, control hands off to ask by morphing (no cut),
// and the logo lands on the score's impact out of black.
const SCENES = [
  { key: "hook", C: Hook, s: S.hook, noIn: true },
  { key: "meet", C: Meet, s: S.meet },
  { key: "brief", C: Brief, s: S.brief },
  { key: "control", C: Control, s: S.control, noOut: true },
  { key: "ask", C: Ask, s: S.ask, noIn: true },
  { key: "learn", C: Learn, s: S.learn },
  { key: "proof", C: Proof, s: S.proof },
  { key: "logo", C: Logo, s: S.logo, noIn: true, noOut: true },
];

const Sfx: React.FC<{ at: number; src: string; vol: number; len?: number }> = ({ at, src, vol, len = 15 }) => (
  <Sequence from={Math.round(at)} durationInFrames={len}>
    <Audio src={staticFile(src)} volume={vol} />
  </Sequence>
);

const Sound: React.FC = () => (
  <>
    <Audio src={staticFile("audio/score.wav")} volume={(f) => 0.9 * interpolate(f, [TOTAL - 30, TOTAL], [1, 0], clamp)} />
    {[2, 3, 7, 10, 18, 21].map((b) => <Sfx key={`w${b}`} at={b * BAR - 9} src="audio/whoosh.wav" vol={b === 2 ? 0.2 : 0.32} len={20} />)}
    {[1, 2].map((k) => <Sfx key={`wp${k}`} at={21 * BAR + k * BAR - 6} src="audio/whoosh.wav" vol={0.22} len={20} />)}
    {[0, 1, 2, 3].map((i) => <Sfx key={`m${i}`} at={S.meet.from + 20 + i * 9} src="audio/tick.wav" vol={0.3} />)}
    {[0, 1, 2, 3].map((i) => <Sfx key={`b${i}`} at={S.brief.from + 22 + i * 9} src="audio/tick.wav" vol={0.22} />)}
    {[34, 70, 106].map((t) => <Sfx key={`s${t}`} at={S.control.from + t + 10} src="audio/stamp.wav" vol={0.4} />)}
    <Sfx at={S.ask.from + ASK_TAP - 1} src="audio/tap.wav" vol={0.8} />
    {[10, 16, 22].map((t) => <Sfx key={`h${t}`} at={S.learn.from + t} src="audio/tick.wav" vol={0.25} />)}
    <Sfx at={S.learn.from + LEARN_TAP - 1} src="audio/tap.wav" vol={0.7} />
  </>
);

export const GaruVideo: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    {SCENES.map(({ key, C, s, noIn, noOut }) => (
      <Sequence key={key} from={s.from} durationInFrames={s.dur} name={key}>
        <Scene dur={s.dur} xf={XF} noIn={noIn} noOut={noOut}>
          <C />
        </Scene>
      </Sequence>
    ))}
    <Sound />
  </AbsoluteFill>
);
