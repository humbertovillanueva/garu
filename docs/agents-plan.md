# Agents rework (in progress, 2026-10-10)

The demo agents (weather, GitHub stars, a heartbeat) prove Garu works but take nothing off anyone's
plate. Humberto wants agents that do real chores, on Gmail and Google Calendar:

- **Tomay → "Your day"**: `agents/tomay/Garufile.next.yaml`. Weekdays 7:00: reads today's calendar,
  writes a prep note per meeting from recent email with the attendees, lists free blocks. Read-only
  scopes; writes only `briefs/<date>.md`; posts nothing (the brief stays in Garu, by his choice).
- **Bea (bee)**: `agents/bea/Garufile.next.yaml`. Weekdays 7:15: files new threads under Gmail labels
  Garu/Needs reply, Garu/FYI, Garu/Receipts, Garu/Newsletters (he creates them once) and drafts
  replies; `create_draft` is `ask`, labeling is `allow`, nothing can send (Google's Gmail MCP has no
  send tool). Scopes include gmail.modify for labeling; check at first sign-in whether it's needed.
- Switched on 2026-10-10 after test runs on real mail (they were `.next.yaml` until then, which Garu
  ignores). The old Tomay (weather and GitHub stars, posted to Slack) is in git history.
- They use Google's official remote MCP servers (`calendarmcp.googleapis.com`, `gmailmcp.googleapis.com`),
  in the Workspace Developer Preview. Humberto's steps (his account, so he does them himself): join
  the Developer Preview Program; create a Google Cloud project "Garu"; enable the Gmail and Calendar
  APIs and their MCP services; OAuth consent screen in Testing with himself as test user; create an
  OAuth client of type Desktop app with "Use this client for an AI-powered agent" ticked (Google's
  Workspace MCP servers only accept agentic clients); `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` go into `.env`,
  copied from the client's downloaded JSON by script (never retyped from the screen). Done 2026-10-10.
  Then `npm run garu -- auth agents/<name>/Garufile.next.yaml <server>` and he signs in.
  In Testing mode Google expires the sign-in every 7 days (Gmail is a restricted scope); the agent then
  shows "needs sign-in". Their email text goes to the model (Gemini today); a local model avoids that.
- Answered 2026-10-10: the gate is real and it's per project. Sign-in works with a personal account
  (Calendar signed in, read-only scopes, refresh token saved), but every tool call answers "your Google
  Cloud project (1071926667581) must be enrolled in the Google Workspace Developer Preview Program".
  Listing tools works without any sign-in, which is why `garu auth` used to think it was signed in
  (fixed: it now starts the sign-in when nothing is saved, and runs stop with "needs sign-in").
- Background (found 2026-10-10): Google lists Developer Preview membership as required for these
  servers, and its sign-up form asks for a Google Workspace account. It doesn't say a personal
  @gmail.com account is refused, but it may be. Garu signs in through a Desktop app client (it
  listens on `127.0.0.1:47831`), not the Web application client Google's guide shows for hosted apps.
  The Cloud project, the Gmail and Calendar APIs, the consent screen and the client are needed
  whichever way this goes.
- Decided 2026-10-10: don't wait for the preview. `packages/mcp-google` is Garu's own Gmail + Calendar
  server on Google's regular APIs (work with a personal account today). Same tool names as Google's
  MCP servers, so the policies didn't change; no send, delete, unlabel or calendar-write tool exists;
  `label_thread` adds only your own labels. Garu signs in for it (`auth: oauth` + `oauth.issuer` on a
  local server) and starts it with a one-hour token in GARU_OAUTH_ACCESS_TOKEN; the refresh token
  stays in `.garu/auth`. Sign-ins are filed by issuer + permissions, so Tomay's read-only Gmail and
  Bea's are separate. Bea needs `gmail.modify` (the only scope that allows labeling; Google lists it
  as "read, compose and send").
- Done 2026-10-10: all three signed in (Tomay calendar + read-only Gmail, Bea Gmail) and checked with
  real calls. Humberto creates the four labels in Gmail (Garu, with the four nested under it).
- Test runs 2026-10-10: Tomay wrote the brief ($0.001). Bea's first run hit its 24 turns filing one
  thread per call, so `label_thread` now takes a batch (second run: 7 threads, 9 turns, $0.004). She
  drafted a reply to invitations@linkedin.com, so her prompt now says automated senders are
  Newsletters and never get a draft.
- Next, in order: watch the first weekday mornings and tune → update the onboarding (Intro slides,
  Help) and the launch video around these agents instead of weather.
