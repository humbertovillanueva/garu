# Garu launch video

Remotion project for `docs/video/garu-v7-9x16.mp4` (1080×1920) and `garu-v7-16x9.mp4` (1920×1080, for the README). v6 told the same story with the old weather-brief Tomay.

```
npm install
npm run dev                                   # Remotion Studio: scrub frame by frame
npx remotion render src/index.ts Garu-9x16 ../garu-v7-9x16.mp4 --crf=16
npx remotion render src/index.ts Garu-16x9 ../garu-v7-16x9.mp4 --crf=16
```

## Design

No footage and no phone mockups: the control room's own surfaces (panels, chips, avatars, type) are rebuilt as components in `src/ui.tsx` from `packages/ui/src/app.css` tokens and `Creature.svelte`, then shown large enough to read. One idea per scene, Inter headlines revealed word by word, colour only for status (green allow, amber ask, red block).

## Scenes (30 fps; boundaries on the score's bar lines, 1 bar = 48 frames, `src/theme.ts`)

Written for people who aren't developers first, with the real UI and a little real config kept as proof for those who are.

| Scene | Bars | What |
|---|---|---|
| Hook | 0–3 | "AI agents can work while you sleep." over a clock rolling to 7:00 AM; then "But would you trust one?" |
| Meet | 3–7 | "Garu runs AI agents on your computer. On your schedule. By your rules." Tomay, Bea, Rook and Atlas, with what each does and when. |
| Brief | 7–10 | "Wake up to your day, ready." Tomay's brief: schedule, free blocks, prep notes. |
| Control | 10–14 | "It only touches what you allow." Bea's policy in plain words; she files newsletters (allowed), can't send email (not possible: Garu gives her no send tool), wants to draft (asks); the ask row grows into the approval card (no cut). |
| Ask | 14–18 | "Nothing goes out without your OK." Bea's draft to Lena; tap Approve. "One tap. Saved, not sent." |
| Learn | 18–21 | "It learns what you trust." Three approved drafts, Garu's suggestion (`gmail.create_draft` → allow), Add to Garufile. |
| Proof | 21–24 | Free and open source (Apache-2.0) · runs on your own computer (`npm run garu -- ui --up`) · Gemini, Claude, or fully local. |
| Logo | 24–28 | Lands on the score's impact; tagline; "Free · Runs on your computer"; `git clone https://…`. |

Garu's own facts are real: agent names, descriptions, schedules and rules from the Garufiles, tool names from `packages/mcp-google`, the suggestion card and the rule `suggest.ts` proposes for three drafts to different people (the whole tool), the startup lines `garu ui` prints, the models from the README. The meetings, people and emails are made up, the same ones `scripts/demo-data.mjs` seeds (example.com addresses). Bea's real Garufile keeps drafts on `ask`; the Learn scene shows what Garu offers after three approvals.

`tools/score.py` synthesizes the score (150 bpm, arranged to the scenes) and the one-shots into `public/audio/`; no samples. Run it with a Python that has `numpy`: `python tools/score.py public/audio`.

## Rules for the next cut

- Transitions are 0.4 s. In 9:16, keep headlines to two lines of about 19 characters at 104 px.
- Every name, schedule, rule, command and model on screen is Garu's real data.
- Earlier cuts (tilted phone frames, composited stock clips, floating UI) were judged dated; don't go back.
- The source clips in `docs/video/` (`01-nightstand.mp4`, `02-approve.mp4`, `06-outro.mp4`, `garu-v1.mp4`)
  are untracked and unused; leave them. Only final renders get committed.
