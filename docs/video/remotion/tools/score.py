"""Synthesize the score for the launch video: 150 bpm felt in half time, 28 bars of 1.6 s (= 48
frames at 30 fps), arranged to the scene plan in src/theme.ts. No samples.

v10: cinematic. Piano broken chords from the first frame, strings that swell in under the meet
scene and open at the build, a soft heartbeat kick, a snare roll into the hit.

  bars  0–3   hook       piano alone over clock ticks; bar 2–3 thins under "would you trust one?"
  bars  3–10  meet, brief  heartbeat kick, strings swell in, the piano melody on top
  bars 10–21  control, ask, learn  + snare on 3, hats, a second piano voice
  bars 21–24  proof      build: riser, snare roll, the strings open; last half bar drops out
  bar  24–28  logo       impact, piano and strings hold, tail

usage: score.py <out_dir>
Writes score.wav (full mix), bed.wav (piano and strings only, under the voice-over) plus the
whoosh, tick, tap, stamp and pop one-shots.
"""
import numpy as np, wave, sys

OUT = sys.argv[1]
SR = 48000
BPM = 150
BEAT = 60 / BPM          # 0.4 s
BAR = BEAT * 4           # 1.6 s
BARS = 28
N = int(BARS * BAR * SR)
rng = np.random.default_rng(5)


def save(name, x, peak=0.89):
    x = np.asarray(x, np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    x = x / (np.abs(x).max() + 1e-9) * peak
    with wave.open(f"{OUT}/{name}.wav", "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def t(sec): return np.arange(int(sec * SR)) / SR
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def at(bar, beat=0.0): return (bar * BAR + beat * BEAT) * SR


def lp(x, cut):
    """Zero-phase low-pass via FFT. `cut` may be an array (time-varying): then it's applied in blocks."""
    if np.isscalar(cut):
        X = np.fft.rfft(x, axis=0); f = np.fft.rfftfreq(len(x), 1 / SR)
        h = 1 / np.sqrt(1 + (f / cut) ** 8)
        return np.fft.irfft(X * (h[:, None] if x.ndim == 2 else h), len(x), axis=0)
    out = np.zeros_like(x); B = 4096
    for s in range(0, len(x), B // 2):
        seg = x[s:s + B]
        if len(seg) < 16: break
        win = np.hanning(len(seg))
        out[s:s + len(seg)] += lp(seg * (win[:, None] if x.ndim == 2 else win), float(cut[min(len(cut) - 1, s + len(seg) // 2)]))
    return out


def hp(x, cut):
    return x - lp(x, cut)


def place(buf, s0, v, gain=1.0, pan=0.5):
    s0 = int(s0)
    if s0 >= len(buf): return
    e = min(len(buf), s0 + len(v)); v = v[: e - s0] * gain
    if v.ndim == 2:
        buf[s0:e] += v
    else:
        buf[s0:e, 0] += v * np.sqrt(1 - pan); buf[s0:e, 1] += v * np.sqrt(pan)


# ---- instruments
def piano(m, dur=2.5, bright=1.0):
    """Six slightly stretched partials, each fading faster than the last, with a touch of hammer noise."""
    tt = t(dur); f0 = hz(m); x = np.zeros(len(tt))
    for k in range(1, 7):
        x += (1 / k ** 1.4) * np.sin(2 * np.pi * f0 * k * (1 + 0.0004 * k * k) * tt) * np.exp(-tt * (2.5 + 1.6 * k)) * (bright if k > 1 else 1)
    return x * np.minimum(1, tt / 0.004) + 0.05 * hp(rng.standard_normal(len(tt)), 2000) * np.exp(-tt * 300)


def strings(ch, dur, attack=0.5):
    """Three detuned saws per note, slow attack, low-passed: a section, not a synth."""
    tt = t(dur); x = np.zeros((len(tt), 2))
    env = np.minimum(1, tt / attack) * np.minimum(1, np.maximum(0, (dur - tt) / 0.6))
    for m in ch:
        for det, pan in [(-0.09, 0.2), (0.0, 0.5), (0.09, 0.8)]:
            f0 = hz(m) * 2 ** (det / 12)
            saw = 2 * (np.mod(f0 * tt + rng.random(), 1.0)) - 1
            x[:, 0] += saw * env * np.sqrt(1 - pan); x[:, 1] += saw * env * np.sqrt(pan)
    return lp(x, 2200) / len(ch)


def kick():
    tt = t(0.4); f = 50 + 80 * np.exp(-tt * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 10) + 0.1 * np.exp(-tt * 350) * rng.standard_normal(len(tt))


def snare():
    tt = t(0.22); n = lp(hp(rng.standard_normal(len(tt)), 900), 3500) * np.exp(-tt * 24)
    return n + 0.5 * np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 40)


def hat():
    tt = t(0.05); return hp(rng.standard_normal(len(tt)), 7000) * np.exp(-tt * 140)


def impact():
    tt = t(3.2); f = 34 + 80 * np.exp(-tt * 13)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 1.8) + 0.25 * lp(rng.standard_normal(len(tt)), 2500) * np.exp(-tt * 4)


def riser(bars=3, cut0=500, cut1=8000):
    L = int(bars * BAR * SR); tt = np.arange(L) / SR
    r = lp(hp(rng.standard_normal(L), 300), np.linspace(cut0, cut1, L)) * (tt / tt[-1]) ** 2
    c = int(L * 5 / 6); r[c:] *= np.linspace(1, 0, L - c) ** 3
    return r


# ---- the arrangement: Am · F · C · G, one chord a bar
CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
keys = np.zeros((N, 2)); strs = np.zeros((N, 2)); drums = np.zeros((N, 2)); fx = np.zeros((N, 2))

# clock ticks in the intro (on the beat, bars 0–2)
for k in range(8):
    tt = t(0.05); v = hp(rng.standard_normal(len(tt)), 3500) * np.exp(-tt * 140)
    place(fx, at(0, k), v, 0.15 if k % 4 else 0.22, 0.5 + 0.15 * (-1) ** k)

# piano: a slow broken chord each bar from bar 0; the melody on top from bar 3
for b in range(0, 24):
    ch = CH[b % 4]
    for i, m in enumerate([ch[0] - 12, ch[0], ch[1], ch[2]]):
        if b == 23 and i >= 2: continue
        place(keys, at(b, i * 0.75), piano(m, 2.5, 0.8), 0.2 if i else 0.26, 0.42 + 0.06 * i)
    if 3 <= b < 23:
        top = [72, 71, 72, 74][b % 4] if b % 2 == 0 else [76, 72, 71, 69][b % 4]
        place(keys, at(b, 2), piano(top, 2.0, 1.1), 0.22, 0.6)
        if b >= 10: place(keys, at(b, 3.5), piano(top - 3, 1.2, 1.0), 0.14, 0.4)

# strings: swell in under bar 3, open at the build, hold at the logo
for b in range(3, 24, 2):
    g = 0.05 if b < 10 else 0.075 if b < 21 else 0.11
    place(strs, at(b), strings([m + 12 for m in CH[b % 4]] + [CH[(b + 1) % 4][0] + 12], 2 * BAR + 0.5, attack=0.8 if b == 3 else 0.3), g)
place(strs, at(24), strings([60, 64, 67, 72, 76], 4 * BAR, attack=0.05), 0.12)

# drums: a heartbeat kick (1 and the and-of-1), half time; a soft snare and hats from bar 10
K = kick()
for b in range(3, 24):
    place(drums, at(b, 0), K, 0.5); place(drums, at(b, 0.5), K, 0.3)
    if 10 <= b < 23: place(drums, at(b, 2), snare(), 0.22, 0.5)
    if b >= 10:
        for e in range(4):
            if b == 23 and e >= 3: continue
            place(drums, at(b, e), hat(), 0.05, 0.6)

# build and impact
place(fx, at(21), riser(3), 0.2)
for k in range(24):
    pos = 22 * 4 + k / 3
    if pos >= 23.5 * 4: break
    place(drums, pos * BEAT * SR, snare(), 0.06 + 0.16 * k / 24, 0.5)
place(fx, at(24), impact(), 0.8)
place(keys, at(24), piano(48, 4, 0.7), 0.4, 0.5); place(keys, at(24), piano(72, 4, 0.9), 0.3, 0.5)


def rms(x): return float(np.sqrt(np.mean(x ** 2)))
print({k: round(rms(v), 3) for k, v in dict(keys=keys, strings=strs, drums=drums, fx=fx).items()})
# a gentle duck under each kick
env = np.ones(N)
for b in range(3, 24):
    for bt in (0, 2):
        s0 = int(at(b, bt)); e = min(N, s0 + int(0.22 * SR))
        env[s0:e] = np.minimum(env[s0:e], 1 - 0.15 * np.exp(-np.arange(e - s0) / SR * 16))
fade = np.minimum(1, np.arange(N) / (0.2 * SR)) * np.minimum(1, (N - np.arange(N)) / (1.5 * SR))
mix = (keys * 1.0 + strs * 1.2 + drums * 1.3 + fx) * env[:, None] * fade[:, None]
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
save("score", mix, 0.85)

# ---- the bed for the voice-over: the piano and the strings, nothing that marks time.
bed = lp(keys * 0.8 + strs * 1.2, 2400) * fade[:, None]
save("bed", bed, 0.45)

# ---- one-shots for the picture
tt = t(0.6); w = lp(hp(rng.standard_normal(len(tt)), 300), 5000) * np.sin(np.pi * np.minimum(1, tt / 0.5)) ** 2
save("whoosh", w * np.linspace(0.6, 1, len(tt)), 0.6)
tt = t(0.05); save("tick", hp(rng.standard_normal(len(tt)), 4000) * np.exp(-tt * 160), 0.5)
tt = t(0.14); save("tap", lp(rng.standard_normal(len(tt)), 5000) * np.exp(-tt * 250) * 0.6 + np.sin(2 * np.pi * 190 * tt * (1 - tt * 2)) * np.exp(-tt * 40), 0.8)
tt = t(0.3); f0 = hz(79); save("stamp", (np.sin(2 * np.pi * f0 * tt) + 0.4 * np.sin(2 * np.pi * 1.5 * f0 * tt)) * np.exp(-tt * 16) + 0.3 * np.exp(-tt * 200) * rng.standard_normal(len(tt)), 0.6)
save("pop", piano(88, 0.35, 1.0), 0.6)
print("ok", N / SR, "s")
