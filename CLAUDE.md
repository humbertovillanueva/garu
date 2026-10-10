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
- Never force-push or rewrite history unless Humberto asks for it in so many words.
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
packages/mcp-google Gmail + Calendar MCP server (read, label, draft; no send); Garu signs in for it
agents/             real agents: tomay (fox, your day from calendar + email), bea (bee, sorts the inbox,
                    drafts replies), rook (owl, weekly repo check), atlas (octopus, Linear)
examples/           pip, nook (Ollama), tick (hourly heartbeat), vault (sandboxed)
docs/               why.md, google.md (Google setup), phone.md, android.md, privacy.html, brand/, launch/, video/
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
- Keep this file short. When a piece of work is finished, trim its section down to the lasting
  rules and delete the play-by-play (what was done, when, in what order). Work in progress gets its
  own file under `docs/` and a two-line pointer here.

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

Built: kernel, CLI, control room, Android debug app, login service, catch-up, brand, Owner's Guide,
launch video v7, onboarding and UI audit fixes (2026-10-10). Open: the run timeline still shows
seconds and "ok · 340ms" (allowed by a comment in `format.ts`, against the rule above: Humberto to
decide). The phone app on the emulator needs a rebuild to get the new intro.

Not launching yet. Order: understand → real app → Play closed test → launch → beyond. Still on the
real-app list: crash screen, accessibility pass, theme setting, release signing (Humberto makes the
keystore), support path, Why Garu page + fresh screenshots, privacy review. Then marketing (posts;
the video is done). Roadmap after that: push via a relay, hosted Garu, `garu install` registry, iOS,
two-way Slack.

## Agents rework (in progress)

New Tomay ("Your day") and Bea (inbox sorter) on Gmail and Google Calendar, switched on 2026-10-10.
Plan, Google setup steps and what's next (onboarding, video): `docs/agents-plan.md`.

## Launch video

v7 (`docs/video/garu-v7-9x16.mp4`, `garu-v7-16x9.mp4`, 2026-10-10) tells it with Tomay and Bea; v6
had the old weather Tomay. Source, commands, scenes and rules: `docs/video/remotion/README.md`.
Garu's own facts on screen are real; sample meetings and emails are made up (example.com).
