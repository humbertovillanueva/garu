# Garu launch video

Remotion project for `docs/video/garu-v8-9x16.mp4` (1080×1920) and `garu-v8-16x9.mp4` (1920×1080). v7 (same story, kept beside it) was re-rendered in place on 2026-10-14 (end card says garuagents.com) and on 2026-10-27 (Bea's time, the startup line, the suggestion card's confirmation and the brief's date made true); v8 is the pacing and safe-zone pass of 2026-10-27. v6 told the same story with the old weather-brief Tomay.

```
npm install
npm run dev                                   # Remotion Studio: scrub frame by frame
npm run render:9x16                           # → ../garu-v8-9x16.mp4 (crf 16)
npm run render:16x9                           # → ../garu-v8-16x9.mp4
```

## Design

No footage and no phone mockups: the control room's own surfaces (panels, chips, avatars, type) are rebuilt as components in `src/ui.tsx` from `packages/ui/src/app.css` tokens and `Creature.svelte`, then shown large enough to read. One idea per scene, Inter headlines revealed word by word, colour only for status (green allow, amber ask, red block). The small Garu mark sits top-left from frame 0 and leaves as the big one lands.

## Scenes (30 fps; boundaries on the score's bar lines, 1 bar = 48 frames, `src/theme.ts`)

Written for people who aren't developers first, with the real UI and a little real config kept as proof for those who are.

| Scene | Bars | What |
|---|---|---|
| Hook | 0–3 | "AI agents can work while you sleep." and the clock are there from frame 0 (the thumbnail), the clock rolls to 7:00 AM; then "But would you trust one?" |
| Meet | 3–6 | "Garu runs AI agents on your computer. On your schedule. By your rules." Tomay, Bea, Rook and Atlas, one line each and when. |
| Brief | 6–8 | "Wake up to your day, ready." Tomay's brief: the schedule and one prep note. |
| Control | 8–12 | "It only touches what you allow." Bea's policy in plain words; she files newsletters (allowed), can't send email (not possible: Garu gives her no send tool), wants to draft (asks); the ask row grows into the approval card (no cut). |
| Ask | 12–16 | "Nothing goes out without your OK." Bea's draft to Lena; tap Approve. "One tap on your phone. Saved, not sent." |
| Learn | 16–19 | "It learns what you trust." Three approved drafts to Lena, Garu's suggestion (`gmail.create_draft` → allow, scoped to her address), Add to Garufile. |
| Proof | 19–24 | Three equal beats: free and open source (Apache-2.0) · runs on your own computer (`npm run garu -- ui --up`) · Gemini, Claude, or fully local. |
| Logo | 24–28 | Lands on the score's impact; tagline; "Free · Runs on your computer"; garuagents.com, second in size only to the wordmark. |

Garu's own facts are real: agent names, descriptions, schedules and rules from the Garufiles, tool names from `packages/mcp-google`, the suggestion card as `SuggestionCard.svelte` draws it and the rule `suggest.ts` proposes for three approved drafts to the same address (`narrowestRule` scopes it to that address; three different people would give the whole tool and the card's amber warning), the startup lines `garu ui` prints, the models from the README. The meetings, people and emails are made up, the same ones `scripts/demo-data.mjs` seeds (example.com addresses). Bea's real Garufile keeps drafts on `ask`; the Learn scene shows what Garu offers after three approvals.

`tools/score.py` synthesizes the score (150 bpm, 28 bars) and the one-shots into `public/audio/`; no samples. Run it with a Python that has `numpy`: `python tools/score.py public/audio`. The score was arranged to v7's bars (groove from bar 10, build from bar 21, impact on 24); v8 moved control two bars earlier and gave proof five bars inside the same music, so `score.wav` did not change. The mix in `src/Garu.tsx` peaks at about −1.4 dBTP and sits near −14 LUFS; check a render with `ffmpeg -i x.mp4 -af loudnorm=print_format=json -f null -`.

## Rules for the next cut

- Transitions are 0.4 s. In 9:16, keep headlines to lines of about 19 characters at 104 px (two lines, three at most).
- 9:16 safe zones (`SAFE` in `src/scenes.tsx`): nothing to read in the bottom 300 px or the right 120 px, where Shorts, Reels and TikTok put their controls. The content panel is 880 px wide between them.
- Every name, schedule, rule, command and model on screen is Garu's real data.
- Earlier cuts (tilted phone frames, composited stock clips, floating UI) were judged dated; don't go back.
- The source clips in `docs/video/` (`01-nightstand.mp4`, `02-approve.mp4`, `06-outro.mp4`, `garu-v1.mp4`)
  are untracked and unused; leave them. Only final renders get committed.
