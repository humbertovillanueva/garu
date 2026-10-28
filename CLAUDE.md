# Garu

Open-source runtime for always-on AI agents: "systemd for your agents". An agent is one YAML file
(a Garufile); Garu keeps it running on a schedule, gives it MCP tools, and puts a policy kernel
(allow / ask / block, by tool and by argument) in front of every tool call. Asks land in an inbox
on the control room and the phone app. Everything is files on the user's machine; no database,
no account, no cloud. Tagline: "Always-on agents you can actually trust."

Owner: Humberto Villanueva (Salt Lake City). Personal project, Apache-2.0, unrelated to his employer.
Repo: https://github.com/humbertovillanueva/garu · Site: https://garuagents.com/

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
packages/app        Capacitor 8 wrapper of the UI: android/ and ios/ (appId io.github.humbertovillanueva.garu)
packages/mcp-fetch  tiny MCP server: fetch_json / fetch_text (GET only) + post_message to a webhook
packages/mcp-google Gmail + Calendar MCP server (read, label, draft; no send); Garu signs in for it
agents/             real agents: tomay (fox, your day from calendar + email), bea (bee, sorts the inbox,
                    drafts replies), rook (owl, weekly repo check), atlas (octopus, Linear), nudge (rabbit,
                    9 PM and 11 PM checks that a commit of his landed on GitHub today; posts to the brief channel if not)
examples/           pip, nook (Ollama), tick (heartbeat every 3 h), vault (sandboxed)
docs/               why.md, google.md (Google setup), phone.md, android.md, ios.md, privacy.html, brand/, launch/, video/
docs/video/remotion the launch video's source (Remotion 4, React); see "Launch video" below
```

## Commands

```
npm install && npm run build          # all workspaces
npm run typecheck && npm test         # tsc -b, vitest (293 tests); run before every commit
npx svelte-check --workspace packages/ui
npm run garu -- <cmd>                 # the CLI from the repo (no global install yet)
npm run garu -- service install|status|logs|restart|uninstall   # Garu as a login service (launchd)
npm run sync -w @garu/app             # the phone UI, built and copied into android/ and ios/
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

iPhone app in the Simulator (Xcode 27, `docs/ios.md`): `npm run open:ios -w @garu/app` and press Run,
or headless (`booted` = the simulator that's open):

```
(cd packages/app/ios/App && xcodebuild -project App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' -derivedDataPath /tmp/garu-ios build -quiet)
xcrun simctl install booted /tmp/garu-ios/Build/Products/Debug-iphonesimulator/App.app && xcrun simctl launch booted io.github.humbertovillanueva.garu
```

To pair it without showing the token, pipe the link into the simulator's clipboard (`xcrun simctl
pbcopy booted`) and paste it in the app; empty the clipboard after.

Garu on Humberto's Mac runs as the login service: after a build or a Garufile schedule change,
`npm run build && npm run garu -- service restart`. Control room: http://localhost:4000. Phone pairs
over Tailscale (the address is in `tailscale serve status`; don't write it into the repo).

Seeded screens without touching the real `.garu/`: copy `agents/ examples/ scripts/ package.json` to a
temp dir, symlink `packages` and `node_modules` into it, run `node scripts/demo-data.mjs` there (it
refuses a `.garu` that looks real; `--force` reseeds the demo copy), then
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
- Everything must run on Node 22 (`engines`, and CI tests on 22) although this Mac has Node 25: no
  regex inline modifiers like `(?i:…)`; a rule's `matches` takes `ignoreCase: true` instead.
- Policy semantics: first matching rule wins; nothing matching = ask; an unanswered ask expires as a
  deny after 30 min; a tool the policy can never allow is not shown to the model. Approving the same
  agent → tool 3 times with no decline makes Garu suggest the rule (`kernel/src/suggest.ts`,
  `ui/.../SuggestionCard.svelte`); "Add to Garufile" inserts it above the existing ask rule.
- A Garufile may say `language: es`: the kernel then hands the model the date in that language and tells
  it to write to its owner in it; the owner's name reaches the model from `--as` / `GARU_USER`, so no
  prompt names a person. Every agent and example ships a Spanish edition as `Garufile.es.yaml` beside the
  English one (discovery ignores it; `docs/google.md` says how to switch; the Spanish demo runs on them). Spanish no-reply address words live
  in `mcp-google/src/google.ts` and in Bea's block rule, both editions.
- Scheduler catch-up: a cron fire missed in the last 6 h (machine asleep/off) runs once on start,
  trigger `catch-up:<cron>`. Don't double-fire; don't run catch-ups in parallel. A run the network cut
  off (the Mac slept) before any call to a tool its server doesn't mark read-only (MCP `readOnlyHint`;
  `bus.sentSoFar()`) ends `offline`: not counted as the agent's run, backed off 10 min, caught up.
  One call to a tool without the mark and the run stands as an error: never replayed.
- On macOS a run holds the Mac out of idle sleep while it works (`kernel/src/awake.ts`, caffeinate), and a
  local server that signs in gets its access token renewed mid-run when it's about to run out (`bus.ts`).
- UI: black and white, no orange, in a dark and a light theme: every color is a token in `app.css`
  (the light theme flips them under `[data-theme="light"]`), never a hex in a component. Agent avatar
  colors come from `packages/ui/src/lib/colors.ts` (KIND_COLOR) and are used everywhere an agent is
  colored. Every sentence a person reads goes through `t("English sentence", vars)` from
  `lib/i18n.svelte.ts`, with the English as the key; the Spanish is in `lib/i18n/es.ts`, and
  `i18n.test.ts` fails on a sentence without Spanish, a stale entry or a lost placeholder. Keys are
  double-quoted literals, whole sentences, one key per plural form; agent names, tool ids, paths and
  commands are never wrapped. The terminal has the same layer (`packages/cli/src/i18n.ts`, language from
  `GARU_LANG` / `LANG`, Spanish in `cli/src/i18n/es.ts`, same test), and the reading material ships a Spanish
  twin beside each English file (`README.es.md`, `docs/*.es.md`, `docs/index.es.html`) with a link at the
  top of both. Times are human (`humanTime`, `clock`,
  `until` in `lib/format.ts`): never ISO strings, never UTC, and no seconds in the UI, with one exception:
  the run timeline is the log of one run, so its exact stamps and `ok · 340ms` stay. `until()` already
  returns "in 25 min", so never write "in {until(...)}". Monospace is for code, ids and paths only.
  No CLI commands or shell flags on phone screens; say "needs setup on your computer" and keep the
  commands under Settings → Advanced on the desktop.
- Review cards name the thing ("wants to post a message", "an email", the file name) with the tool id
  as a small tag beside it, never "wants to post post_message". Long mono labels (grants, paths) must
  wrap: the Inbox has to fit a 240 pt-wide phone (large display zoom) without sideways scroll.
- Phone-side preferences live in `lib/prefs.svelte.ts` (localStorage), not on the server.
- Commit messages: a short title, then a plain paragraph on what changed and why. Written as
  Humberto would write them; match the style in `git log` (e.g. "review card: … ; …").

## Status (2026-10-27)

Built and running: kernel, CLI, control room, Android app (debug and the signed Play build), iPhone app
in the Simulator, login service with catch-up, the Google agents, Nudge, the public demos, brand, Owner's
Guide, launch video v8, Spanish end to end. Both audits are done (`docs/audit-2026-10-12.md`,
`docs/audit-2026-10-27.md`), including their last two decisions: the v6 videos and the WAV left the
tree, and the iPhone pairs by scanning a `garu://pair` code with its own camera (the pairing panel's
"Code is for" switch; `docs/ios.md`). No Apple developer account yet, so the iPhone app stays in the
Simulator; the launch is Android only. On 2026-10-27 Tailscale was found stopped on the Mac, which takes both demos and the phone offline:
check its menu-bar icon before the Play application and before posting.

Play: build 4 is on the closed-testing track "Alpha" since 2026-10-15 with the Spanish listing and
Spanish screenshots; the opt-in link is https://play.google.com/apps/testing/io.github.humbertovillanueva.garu;
twelve family testers have been opted in since 2026-10-16, so "Apply for production" opens on
2026-10-30. The answers are in `docs/launch/play-store.md` ("Applying for production"): the family
testers installed and opened the app and no more, said as it is. The upload key is `~/garu-upload.jks`
(`docs/android.md`). After approval: promote to production, then the launch posts in `docs/launch/`
(drafts; "A Policy Kernel, Not a Prompt" is already on dev.to). Roadmap after that: push notifications
via a relay, hosted Garu, `garu install` registry, iPhone on a real device and TestFlight, two-way Slack.

Weekly chore: the Google OAuth app stays in Testing (`docs/google.md` says why), so the three Google
sign-ins (Tomay's calendar and Gmail, Bea's Gmail) die every seven days; the home screen warns from
day six and `garu auth <Garufile> <server>` renews one in place. Last renewed Sunday 2026-10-25 night.

His Mac is a laptop that sleeps after a minute idle, on power too, and spends nights on battery
napping every quarter hour; runs that fire in a nap are late or cut off, and catch-up, the awake hold
and the read-only retry are the seatbelts. He declined changing the setting; don't re-ask.

## The public demo

Two more Garus, `~/garu-demo` (English) and `~/garu-demo-es` (Spanish), run `garu ui --demo` as their
own login services behind Tailscale Funnel; the app's "Try the demo" button picks one via `docs/demo.json`. How it
runs and how to reset or move it: `docs/demo.md`.

## The Google agents

Tomay ("Your day") and Bea (inbox sorter) run on Gmail and Google Calendar through `packages/mcp-google`,
since 2026-10-10. What they do, the rules learned on real mail, and the setup: `docs/agents-plan.md`.

## Launch video

v8 (`docs/video/garu-v8-9x16.mp4`, `garu-v8-16x9.mp4`, 2026-10-27) tells it with Tomay and Bea, with
room to read and nothing under the Shorts and Reels buttons; beside it a 15-second cut
(`garu-v8-15s-9x16.mp4`), two posters and a 1.7 MB web encode (`garu-v8-16x9-web.mp4`) that the site
plays. Only the web encode and the two posters are tracked; the full v8 renders, the 15-second cut, v7,
v6 and `score.wav` stay on this Mac, gitignored, and the README links the site's copy. Source, commands,
scenes and rules: `docs/video/remotion/README.md`.
Garu's own facts on screen are real; sample meetings and emails are made up (example.com).
