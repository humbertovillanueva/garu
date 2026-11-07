# The voice-over

The launch video's music is synthesized (`tools/score.py`), and it sounds like the music under
every generated video. A real voice fixes that. Humberto records the lines below; the render then
plays his voice over a quiet bed (the same pad, no drums, no arp, no riser) with the taps and ticks
kept low.

## Recording

- Phone, Voice Memos (or any recorder), in a quiet room with soft things in it (a bedroom beats a
  kitchen). Phone about a hand's width from the mouth, a little off to the side so the p's don't pop.
- Read the whole script twice through at a normal speaking pace, as if telling a friend. Leave a
  breath of silence between lines. Mistakes: pause, say the line again, keep going; the good take
  is picked later.
- One file. AirDrop or copy it to `docs/video/remotion/public/audio/voice-raw.m4a` (gitignored like
  the score). The cut per scene, the levels and the render are done from there.

## The script

Each line has to fit its scene; the seconds are the room it has. Read it a touch faster than feels
natural if a line runs long. The words on screen are in brackets where the line doesn't repeat them.

| Scene | Starts at | Room | Line |
|---|---|---|---|
| Hook | 0:00 | 4.8 s | AI agents can work while you sleep. But would you trust one? |
| Meet | 0:05 | 4.8 s | Garu runs agents on your own computer. On your schedule, by your rules. |
| Brief | 0:10 | 3.2 s | Tomay reads my calendar, and my day is ready when I wake up. |
| Control | 0:13 | 6.4 s | Bea reads my email and files it. A draft reply asks me first. And she can't send anything: I never gave her a send tool. |
| Ask | 0:19 | 6.4 s | Nothing goes out without my OK. One tap on my phone. Saved, not sent. |
| Learn | 0:26 | 4.8 s | Say yes to the same thing three times, and Garu suggests the rule. |
| Proof | 0:30 | 8.0 s | Free and open source. Runs on your own computer. Gemini, Claude, or a model that never leaves your machine. |
| Logo | 0:38 | 6.4 s | Garu. Always-on agents you can actually trust. |

The Spanish video, if there is one later, takes the same lines in Spanish, read by him too.

## After the recording lands

1. Cut one WAV per scene from the raw file (`voice-hook.wav` … `voice-logo.wav`, 48 kHz, mono is
   fine), trimmed to the first clean take, peaks at about −3 dBFS.
2. `python tools/score.py public/audio` already writes `bed.wav` beside `score.wav`.
3. Render with the voice: `npm run render:16x9 -- --props='{"voice":true}'` (and the same for 9x16).
   Without the prop the video renders exactly as v8.
4. Check the mix (`ffmpeg -i x.mp4 -af loudnorm=print_format=json -f null -`): the voice should sit
   around −16 LUFS, the bed well under it.
