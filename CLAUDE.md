# Garu

Open-source runtime for always-on AI agents: "systemd for your agents". An agent is one YAML file
(a Garufile); Garu keeps it running on a schedule, gives it MCP tools, and puts a policy kernel
(allow / ask / block, by tool and by argument) in front of every tool call. Asks land in an inbox
on the control room and the phone app. Everything is files on the user's machine; no database,
no account, no cloud. Tagline: "Always-on agents you can actually trust."

Owner: Humberto Villanueva (Salt Lake City). Personal project, Apache-2.0, unrelated to his employer.
Repo: https://github.com/humbertovillanueva/garu · Site: https://humbertovillanueva.github.io/garu/

## Non-negotiables

- Commits are authored by `Humberto Villanueva <umbertocornejo8@gmail.com>` only. No Co-Authored-By,
  no AI mention in commits, code comments, docs, UI or posts (this file is the one exception). Set `TZ=America/Denver` before
  committing so timestamps fall on his day. Only touch this repo.
- Never force-push or rewrite history unless Humberto asks for it in so many words. (Once, on
  2026-10-10, two pushed commits carried a Co-Authored-By trailer; he asked for it gone, and main was
  rewritten with `--force-with-lease`. That is the exception, not a precedent.)
- Never print, log or paste secrets. They live in `.env` (gitignored): `GEMINI_API_KEY`, `GITHUB_TOKEN`,
  `GARU_USER`, `BRIEF_WEBHOOK_URL`, `REPO_WATCH_WEBHOOK_URL`. The control-room sign-in token is
  `.garu/ui-token`; never show it in screenshots or recordings.
- Nothing gets posted, published or purchased without Humberto saying so. Launch posts in
  `docs/launch/` are drafts. Pushing to GitHub counts: commit when asked, and before any push show
  Humberto each commit's message and the files it changes, then push only after he says so.
- `git add -A -- . ':!.github'` (never commit workflow files; the PAT has no workflow scope).
  Check `git status` first: untracked files that aren't part of the change stay out of the commit.
- Edits by script with fail-loud asserts on every anchor, never `sed` for anything structural.
- Don't delete files you didn't create without asking (e.g. the source clips in `docs/video/`).

## Layout

```
packages/kernel     Garufile schema (zod) · policy engine · flight recorder · MCP bus · agent loop
                    scheduler (with catch-up) · inbox · grants · suggestions · chat · store · sandbox
packages/cli        the `garu` command; ui-server.ts (control room API), ui-auth.ts, service.ts
packages/ui         control room, Svelte 5 runes + Tailwind v4 + Vite; also the phone PWA
packages/app        Capacitor 8 Android wrapper of the UI (appId io.github.humbertovillanueva.garu)
packages/mcp-fetch  tiny MCP server: fetch_json / fetch_text (GET only) + post_message to a webhook
agents/             real agents: tomay (fox, weekday brief), rook (owl, weekly repo check), atlas (octopus, Linear)
examples/           pip, nook (Ollama), tick (hourly heartbeat), vault (sandboxed)
docs/               why.md, phone.md, android.md, privacy.html, brand/, launch/, video/
docs/video/remotion the launch video's source (Remotion 4, React); see "Launch video" below
```

## Commands

```
npm install && npm run build          # all workspaces
npm run typecheck && npm test         # tsc -b, vitest (162 tests); run before every commit
npx svelte-check --workspace packages/ui
npm run garu -- <cmd>                 # the CLI from the repo (no global install yet)
npm run garu -- service install|status|logs|restart|uninstall   # Garu as a login service (launchd)
GARU_APP=1 npm run build:app -w @garu/ui && (cd packages/app && npx cap sync android)   # app bundle
```

Phone app on the emulator (no more dragging APKs): boot `~/Library/Android/sdk/emulator/emulator
-avd Pixel_8` (the AVD with Tailscale, already paired), then build and install over the old copy:

```
export ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
(cd packages/app/android && ./gradlew assembleDebug -q)
~/Library/Android/sdk/platform-tools/adb install -r packages/app/android/app/build/outputs/apk/debug/app-debug.apk
~/Library/Android/sdk/platform-tools/adb exec-out screencap -p > /tmp/shot.png   # to look at it
```

Debug builds are signed with `~/.android/debug.keystore` (made 2026-10-10). Keep it: an APK signed
with another key won't install over the old one, and replacing means uninstalling, which wipes the
pairing. To try UI changes without touching the running Garu: `npm run dev -w @garu/ui -- --port 5173`
(proxies /api to :4000); add `GARU_APP=1` and `--port 5174` for the phone build in a browser.

Garu on Humberto's Mac runs as the login service: after a build or a Garufile schedule change,
`npm run build && npm run garu -- service restart`. Control room: http://localhost:4000. Phone pairs
over Tailscale (the address is in `tailscale serve status`; don't write it into the repo).

Seeded screens without touching the real `.garu/`: copy `agents/ examples/ scripts/ package.json` to a
temp dir, symlink `packages` and `node_modules` into it, run `node scripts/demo-data.mjs` there, then
`npm run garu -- ui -p 4100` from it. The greeting ("Still up" / "Good morning" …) follows the
browser's clock and schedules follow the server's `TZ`, so set both to the same zone for captures.

## Working with Humberto

- He's new to AI and agents and wants to learn the process to teach it. Narrate in plain words what
  you're doing and why (look → find the root cause → propose → change → verify like a user → report);
  don't explain code.
- Ask before changing his project. Small fixes he already approved can go ahead.
- Before any push, show each commit's message and the files it changes; push only when he says so.
- He follows along in VS Code (`code ~/garu`, Source Control panel). Name the files you touch.

## Conventions

- The two things that must not break: the Garufile schema and the flight-recorder format.
- Policy semantics: first matching rule wins; nothing matching = ask; an unanswered ask expires as a
  deny after 30 min; a tool the policy can never allow is not shown to the model. Approving the same
  agent → tool 3 times with no decline makes Garu suggest the rule (`kernel/src/suggest.ts`,
  `ui/.../SuggestionCard.svelte`); "Add to Garufile" inserts it above the existing ask rule.
- Scheduler catch-up: a cron fire missed in the last 6 h (machine asleep/off) runs once on start,
  trigger `catch-up:<cron>`. Don't double-fire; don't run catch-ups in parallel.
- UI: black and white, no orange. Agent avatar colors come from `packages/ui/src/lib/colors.ts`
  (KIND_COLOR) and are used everywhere an agent is colored. Times are human (`humanTime`, `clock`,
  `until` in `lib/format.ts`): never ISO strings, never seconds, never UTC in the UI. `until()` already
  returns "in 25 min", so never write "in {until(...)}". Monospace is for code, ids and paths only.
  No CLI commands or shell flags on phone screens; say "needs setup on your computer" and keep the
  commands under Settings → Advanced on the desktop.
- Review cards name the thing ("wants to post a message", "an email", the file name) with the tool id
  as a small tag beside it, never "wants to post post_message". Long mono labels (grants, paths) must
  wrap: the Inbox has to fit a 240 pt-wide phone (large display zoom) without sideways scroll.
- Phone-side preferences live in `lib/prefs.svelte.ts` (localStorage), not on the server.
- Commit messages: a short title, then a plain paragraph on what changed and why. Written as
  Humberto would write them; match the style in `git log` (e.g. "review card: … ; …").

## Status (2026-10-10)

Done: kernel, CLI, control room, Android debug app (pair by QR, intro, reconnect, pull-to-refresh,
diff review cards, Help/About/Report a problem), login service, catch-up, agents that know their own
runs, brand (ninja cat in a ring, `docs/brand/mark.svg`), Owner's Guide, review-card copy and
narrow-screen fixes, launch video v6 (below). On 2026-10-10 also: a UI audit fixed in four batches
(the app works when the computer is unreachable, approvals can't double-fire, days are local not UTC,
no CLI or .env on phone screens, plain-language run page, 44 px tap targets); Tick replies in plain
words and machine timestamps in summaries show as times; remote servers can bring their own OAuth
client (`oauth:` block, for Google). Not fixed yet: the "The website" link on the intro's pairing
slide doesn't look like a link; the run timeline still shows seconds (allowed by a comment in
`format.ts`, against the rule above: Humberto to decide).

Not launching yet. Order: understand → real app → Play closed test → launch → beyond. Still on the
real-app list: crash screen, accessibility pass, theme setting, release signing (Humberto makes the
keystore), support path, Why Garu page + fresh screenshots, privacy review. Then marketing (posts;
the video is done). Roadmap after that: push via a relay, hosted Garu, `garu install` registry, iOS,
two-way Slack.

## Agents rework (in progress, 2026-10-10)

The demo agents (weather, GitHub stars, a heartbeat) prove Garu works but take nothing off anyone's
plate. Humberto wants agents that do real chores, on Gmail and Google Calendar:

- **Tomay → "Your day"**: `agents/tomay/Garufile.next.yaml`. Weekdays 7:00: reads today's calendar,
  writes a prep note per meeting from recent email with the attendees, lists free blocks. Read-only
  scopes; writes only `briefs/<date>.md`; posts nothing (the brief stays in Garu, by his choice).
- **Bea (bee)**: `agents/bea/Garufile.next.yaml`. Weekdays 7:15: files new threads under Gmail labels
  Garu/Needs reply, Garu/FYI, Garu/Receipts, Garu/Newsletters (he creates them once) and drafts
  replies; `create_draft` is `ask`, labeling is `allow`, nothing can send (Google's Gmail MCP has no
  send tool). Scopes include gmail.modify for labeling; check at first sign-in whether it's needed.
- Both are `.next.yaml` so Garu ignores them (it loads only `Garufile.yaml`); the current Tomay keeps
  running. They are untracked on purpose: commit once they've run for real. Switching on = rename,
  then `npm run garu -- service restart`.
- They use Google's official remote MCP servers (`calendarmcp.googleapis.com`, `gmailmcp.googleapis.com`),
  in the Workspace Developer Preview. Humberto's steps (his account, so he does them; guide him): join
  the Developer Preview Program; create a Google Cloud project "Garu"; enable the Gmail and Calendar
  APIs and their MCP services; OAuth consent screen in Testing with himself as test user; create an
  OAuth client of type Desktop app; he pastes `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into
  `.env` himself. Then `npm run garu -- auth agents/<name>/Garufile.next.yaml <server>` and he signs in.
  In Testing mode Google expires the sign-in every 7 days (Gmail is a restricted scope); the agent then
  shows "needs sign-in". Their email text goes to the model (Gemini today); a local model avoids that.
- Next, in order: Google setup → test both agents on real mail and tune → switch on → update the
  onboarding (Intro slides, Help) and the launch video around these agents instead of weather.

## Launch video (done: v6, committed 2026-10-10; to be updated for the new agents)

`docs/video/garu-v6-9x16.mp4` (1080×1920, socials) and `garu-v6-16x9.mp4` (1920×1080, README), 45 s,
with sound. Source: `docs/video/remotion/` (its README has the scene table).

```
cd docs/video/remotion && npm install
npm run dev                                                   # Remotion Studio, scrub frame by frame
npx remotion render src/index.ts Garu-9x16 ../garu-v6-9x16.mp4 --crf=16
npx remotion render src/index.ts Garu-16x9 ../garu-v6-16x9.mp4 --crf=16
python tools/score.py public/audio                            # regenerate the score (needs numpy)
```

- Written for non-developers first, with real UI and a little real config as proof for developers:
  hook ("AI agents can work while you sleep. But would you trust one?") → meet the agents → morning
  brief → "It only touches what you allow" (Tomay's policy in plain words; the ask row morphs into the
  approval card) → one-tap approve → "It learns what you trust" → free / runs on your computer /
  Gemini, Claude or local → logo + `git clone`.
- Look: no phone mockups, no stock or generated footage, no fake 3D. The control room's surfaces are
  rebuilt as React components from the `app.css` tokens and `Creature.svelte` (`src/ui.tsx`), shown
  large; one idea per scene; Inter headlines revealed word by word; color only for allow/ask/block.
  Earlier cuts (tilted phone frames, the Higgsfield clips composited, floating UI) were judged dated.
- Timing: 30 fps, scene changes on the score's bar lines (150 bpm, 1 bar = 48 frames), 0.4 s
  transitions. The score and effects are synthesized by `tools/score.py` (no samples, no licensing).
  In 9:16, keep headlines to two lines of ~19 characters at 104 px.
- Truthfulness: every name, schedule, rule, command and model on screen is Garu's real data. Tomay's
  post rule is shown as `ask` (as it first shipped), then the learned `allow` goes in above it, which
  is how the real Garufile got to `allow`.
- The source clips (`01-nightstand.mp4`, `02-approve.mp4`, `06-outro.mp4`, `garu-v1.mp4`) are untracked
  and unused by v6; leave them unless Humberto says otherwise. Only final renders get committed.
