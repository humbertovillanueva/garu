"""Synthesize the score for the launch video: 150 bpm, 28 bars of 1.6 s (= 48 frames at 30 fps),
arranged to the scene plan in src/theme.ts. No samples.

  bars  0–3   hook       pad + clock ticks; bar 2–3 thins out under "would you trust one?"
  bars  3–10  meet, brief  kick on 1 and 3, bass, pad, quiet arp
  bars 10–21  control, ask, learn  + hats, soft clap on 2 and 4, brighter arp
  bars 21–24  proof      build: riser, snare roll, filter opens; last half bar drops out
  bar  24–28  logo       impact, sustained chord, tail

usage: score.py <out_dir>
Writes score.wav (full mix) plus the whoosh, tick, tap and stamp one-shots.
"""
import numpy as np, wave, sys

OUT = sys.argv[1]
SR = 48000
BPM = 150
BEAT = 60 / BPM          # 0.4 s
BAR = BEAT * 4           # 1.6 s
BARS = 28
N = int(BARS * BAR * SR)
rng = np.random.default_rng(11)


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


def lp(x, cut):
    """Zero-phase 4th-order-ish low-pass via FFT. `cut` may be an array (time-varying) — then it's applied in blocks."""
    if np.isscalar(cut):
        X = np.fft.rfft(x, axis=0); f = np.fft.rfftfreq(len(x), 1 / SR)
        h = 1 / np.sqrt(1 + (f / cut) ** 8)
        return np.fft.irfft(X * (h[:, None] if x.ndim == 2 else h), len(x), axis=0)
    out = np.zeros_like(x); B = 4096
    for s in range(0, len(x), B // 2):
        seg = x[s:s + B]
        if len(seg) < 16: break
        win = np.hanning(len(seg))
        y = lp(seg * (win[:, None] if x.ndim == 2 else win), float(cut[min(len(cut) - 1, s + len(seg) // 2)]))
        out[s:s + len(seg)] += y
    return out


def hp(x, cut):
    return x - lp(x, cut)


def place(buf, s0, v, gain=1.0, pan=0.5):
    s0 = int(s0)
    if s0 >= len(buf): return
    e = min(len(buf), s0 + len(v)); v = v[: e - s0] * gain
    buf[s0:e, 0] += v * np.sqrt(1 - pan); buf[s0:e, 1] += v * np.sqrt(pan)


def at(bar, beat=0.0): return (bar * BAR + beat * BEAT) * SR


# chords: Am9 · Fmaj7 · Cmaj9 · G6sus, one per bar
CH = [[57, 64, 67, 71, 76], [53, 60, 64, 69, 72], [48, 55, 62, 64, 71], [55, 62, 64, 67, 74]]
ROOT = [45, 41, 48, 43]

mix = np.zeros((N, 2))
pad = np.zeros((N, 2)); drums = np.zeros((N, 2)); bass = np.zeros((N, 2)); arp = np.zeros((N, 2)); fx = np.zeros((N, 2))

# ---- pad (whole piece, swells in, opens up at the build, sustains at the logo)
for b in range(BARS):
    ch = CH[b % 4]; seg = t(BAR + 1.2); env = np.minimum(1, seg / 0.5) * np.exp(-np.maximum(0, seg - BAR) * 2.5)
    for j, m in enumerate(ch):
        for det, pan in [(-0.07, 0.2), (0.07, 0.8)]:
            f0 = hz(m) * 2 ** (det / 12)
            v = (np.sin(2 * np.pi * f0 * seg) + 0.3 * np.sin(2 * np.pi * 2 * f0 * seg + 1) + 0.12 * np.sin(2 * np.pi * 3 * f0 * seg)) * env
            place(pad, at(b), v, 0.14 if j else 0.2, pan)
pad_cut = np.interp(np.arange(N), [0, at(2), at(3), at(10), at(21), at(24) - 1, at(24), at(28)], [700, 900, 1400, 1800, 2400, 6000, 3500, 1800])
pad = lp(pad, pad_cut)

# ---- clock ticks in the intro (on the beat)
for k in range(8):
    tt = t(0.05); v = hp(rng.standard_normal(len(tt)), 3500) * np.exp(-tt * 140)
    place(fx, at(0, k), v, 0.18 if k % 4 else 0.26, 0.5 + 0.15 * (-1) ** k)

# ---- kick: bars 2–24 on beats 1 and 3; bars 11–20 four on the floor (soft)
def kick():
    tt = t(0.45); f = 48 + 90 * np.exp(-tt * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7) + 0.25 * np.exp(-tt * 300) * rng.standard_normal(len(tt))
K = kick()
for b in range(3, 24):
    beats = [0, 2] if b < 10 or b >= 21 else [0, 1, 2, 3]
    if b == 23: beats = [0, 1, 2]
    for bt in beats:
        place(drums, at(b, bt), K, 0.55 if bt in (0, 2) else 0.32)

# ---- hats (8ths) and clap, bars 11–20
for b in range(10, 24):
    for e in range(8):
        if b == 23 and e >= 6: continue
        tt = t(0.06); v = hp(rng.standard_normal(len(tt)), 7000) * np.exp(-tt * (90 if e % 2 else 140))
        place(drums, at(b, e / 2), v, (0.10 if e % 2 else 0.06) * (1.3 if b >= 21 else 1), 0.62)
    if b < 21:
        for bt in (1, 3):
            tt = t(0.25); v = lp(hp(rng.standard_normal(len(tt)), 900), 4500) * np.exp(-tt * 22)
            place(drums, at(b, bt), v, 0.16, 0.45)

# ---- snare roll in the build, bars 22–24
for k in range(32):
    pos = 22 * 4 + k * (8 / 32)
    if pos >= 23.5 * 4: break
    tt = t(0.12); v = lp(hp(rng.standard_normal(len(tt)), 1200), 6000) * np.exp(-tt * 30)
    place(drums, pos * BEAT * SR, v, 0.05 + 0.14 * k / 32, 0.5)

# ---- bass: plucked root on 8ths with a little movement, bars 2–24
for b in range(3, 24):
    r = ROOT[b % 4]
    for e in range(8):
        if b == 23 and e >= 6: continue
        if e in (1, 5) and b < 10: continue
        m = r + (12 if e == 7 else 0)
        tt = t(BEAT / 2 * 0.95); f0 = hz(m)
        v = (np.sin(2 * np.pi * f0 * tt) + 0.35 * np.sign(np.sin(2 * np.pi * f0 * tt)) * 0.3) * np.exp(-tt * 9)
        place(bass, at(b, e / 2), v, 0.34, 0.5)
bass = lp(bass, 900)

# ---- arp: 16ths from the chord, quiet in 2–11, brighter in 11–24
for b in range(3, 24):
    ch = CH[b % 4]; pat = [0, 2, 3, 4, 3, 2, 1, 2]
    for s in range(16):
        if b == 23 and s >= 12: continue
        m = ch[pat[s % 8]] + 12; tt = t(0.22); f0 = hz(m)
        v = (np.sin(2 * np.pi * f0 * tt) + 0.2 * np.sin(2 * np.pi * 2 * f0 * tt)) * np.exp(-tt * 18)
        g = (0.05 if b < 10 else 0.075) * (1.0 if s % 4 == 0 else 0.7)
        place(arp, at(b, s / 4), v, g, 0.3 + 0.4 * ((s * 3) % 5) / 4)
arp = lp(arp, np.interp(np.arange(N), [0, at(10), at(21), at(24)], [2200, 3500, 3500, 9000]))

# ---- riser into the logo, bars 20–24
L = int(3 * BAR * SR); tt = np.arange(L) / SR
noise = rng.standard_normal(L)
r = lp(hp(noise, 400), np.linspace(600, 9000, L)) * (tt / tt[-1]) ** 2.2
cutoff = int(at(23, 2) - at(21))
r[cutoff:] *= np.linspace(1, 0, L - cutoff) ** 4
place(fx, at(21), r, 0.22, 0.5)

# ---- logo: impact and sustained Cmaj9 at bar 24
def impact():
    tt = t(3.0); f = 32 + 70 * np.exp(-tt * 12)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 1.8)
    air = lp(rng.standard_normal(len(tt)), 3000) * np.exp(-tt * 3) * 0.3
    return boom + air
IMP = impact()
place(fx, at(24), IMP, 0.75, 0.5)

def bell(m, dur=3.5):
    tt = t(dur); f0 = hz(m); x = np.zeros(len(tt))
    for r_, g, d in [(1, 1, 1.4), (2.76, 0.32, 3.2), (5.4, 0.1, 6), (0.5, 0.2, 1.0)]:
        x += g * np.sin(2 * np.pi * f0 * r_ * tt) * np.exp(-tt * d)
    return x * np.minimum(1, tt / 0.003)
for m, d, g in [(84, 0, 0.18), (88, 0.08, 0.12), (91, 0.16, 0.1)]:
    place(fx, at(24) + d * SR, bell(m), g, 0.4 + d)

def rms(x): return float(np.sqrt(np.mean(x ** 2)))
print({k: round(rms(v), 3) for k, v in dict(pad=pad, drums=drums, bass=bass, arp=arp, fx=fx).items()})
# balance: the pad is a bed, not a lead; the section dynamics come from drums and arp
pad *= 0.32 * np.interp(np.arange(N), [0, at(2), at(3), at(21), at(24), at(28)], [0.7, 0.55, 0.8, 1.0, 1.25, 1.0])[:, None]
drums *= 1.25
bass *= 1.1
arp *= 3.5
# gentle sidechain from the kick
env = np.ones(N)
for b in range(3, 24):
    for bt in range(4):
        s0 = int(at(b, bt)); L2 = int(0.25 * SR)
        e = min(N, s0 + L2); env[s0:e] = np.minimum(env[s0:e], 1 - 0.35 * np.exp(-np.arange(e - s0) / SR * 14))
mix[:, 0] = (pad[:, 0] + arp[:, 0]) * env + drums[:, 0] + bass[:, 0] + fx[:, 0]
mix[:, 1] = (pad[:, 1] + arp[:, 1]) * env + drums[:, 1] + bass[:, 1] + fx[:, 1]
fade = np.minimum(1, np.arange(N) / (0.3 * SR)) * np.minimum(1, (N - np.arange(N)) / (1.5 * SR))
mix *= fade[:, None]
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
save("score", mix, 0.85)

# ---- one-shots for the picture
tt = t(0.6); w = lp(hp(rng.standard_normal(len(tt)), 300), 5000) * np.sin(np.pi * np.minimum(1, tt / 0.5)) ** 2
save("whoosh", w * np.linspace(0.6, 1, len(tt)), 0.6)
tt = t(0.05); save("tick", hp(rng.standard_normal(len(tt)), 4000) * np.exp(-tt * 160), 0.5)
tt = t(0.14); save("tap", lp(rng.standard_normal(len(tt)), 5000) * np.exp(-tt * 250) * 0.6 + np.sin(2 * np.pi * 190 * tt * (1 - tt * 2)) * np.exp(-tt * 40), 0.8)
tt = t(0.3); f0 = hz(79); save("stamp", (np.sin(2 * np.pi * f0 * tt) + 0.4 * np.sin(2 * np.pi * 1.5 * f0 * tt)) * np.exp(-tt * 16) + 0.3 * np.exp(-tt * 200) * rng.standard_normal(len(tt)), 0.6)
print("ok", N / SR, "s")
