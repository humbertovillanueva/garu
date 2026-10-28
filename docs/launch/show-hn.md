# Show HN

Post Thursday between 8:00 and 9:30 am Mountain. Title under 80 characters, no exclamation marks, no "revolutionary". URL is the repo, not the site: HN readers want code. Right before posting, check the three things in the comment that drift: the test count (`npm test`), that garuagents.com and the demo answer, and that the video linked from the README plays.

## Title

Show HN: Garu – always-on agents that can only act through a policy you wrote

(alternatives, pick one)

- Show HN: Garu – systemd for AI agents, with a policy kernel in front of every tool
- Show HN: Garu – run agents 24/7 on your own machine; every tool call goes through your rules

## URL

https://github.com/humbertovillanueva/garu

## First comment (post it right after submitting)

I built this because I wanted what Dots and Muse promise, agents that run all day and act for me, but I wanted to know exactly what they could touch while I slept.

Garu is a small runtime: an agent is a YAML file with a model, some MCP tool servers, a schedule, and a policy. Every tool call goes through the policy first: allow, ask, or block, by tool name and by argument. "Ask" pauses the run and puts a review card in an inbox (browser, phone, or terminal). Silence is a deny. Approve the same thing three times and it proposes the exact rule, scoped to what you approved.

What runs on it today, on my own laptop: Bea goes through my Gmail every weekday at 8, files each thread under one of four labels and drafts the replies; every draft waits for a tap on my phone, and the Gmail server has no send tool, so a wrong rule couldn't send anything. Tomay reads my calendar at 7 and writes a prep note per meeting from my recent mail with the people in it; it can only read. Rook checks the repo on Mondays through GitHub's hosted MCP server, which offers 46 tools; Rook sees 3. Atlas reads my Linear backlog. Nudge checks at 9 PM that I committed something today and says so if not.

Things I think are worth looking at:

- Tools that no rule can ever allow aren't offered to the model at all. That's how 46 tools become 3.
- Every run is an append-only JSONL file (model turns, tool calls, decisions, approvals). The UI is a view over those files. No database.
- Declining a call can carry a note the agent reads before its next step. Rook once picked someone else's repo of the same name to write about; the card caught it, but a plain decline left the agent carrying the mistake into its next call. The note fixed that.
- Remote MCP servers over Streamable HTTP, with OAuth done once via `garu auth`. Tested against GitHub's and Linear's hosted servers.
- Budget cap per run from real token counts. The five agents above cost well under a cent a day on Gemini's free tier; Ollama runs the examples at $0.

Three questions I expect, answered up front:

- *Why not cron and a script?* A script does the same thing every night. An agent decides what to do next, which is exactly why you need a per-argument policy, a record of every decision, a cap and an inbox. Without them it works until the night it doesn't. Those four things are all Garu is.
- *Who can reach the control room?* It listens on localhost; a browser on the same machine is let in as you. Anything else needs the sign-in token. My phone gets it by scanning a code, over Tailscale, so only my own devices can resolve the address at all. No account, no cloud: everything is files under `.garu/`.
- *Always-on, on a laptop?* Mine sleeps. A run holds the Mac awake while it works, and a schedule missed while asleep runs once at wake, within six hours. A Mac mini or any box that stays on is the simpler setup.

It's a month old. TypeScript, Apache-2.0, 288 tests. The policy language is the part I most want pushed on: what can't it express that you'd need?

## Replies to have ready

**"Why not just use <framework>?"** Those are for building agents. Garu is for running them unattended with write access to things you care about. Different problem; you could build the agent with one and run it with the other if MCP is in the middle.

**"The model will just find a way around the policy."** It can't call a tool the policy blocks: the kernel sits between the model and the MCP client, not in the prompt. What it can do is pick the wrong argument for an allowed tool, which is why arguments are in the rules and why ask exists.

**"Isn't approving everything going to be annoying?"** Yes, at first. That's the point of grants (approve for 24h, scoped to this path/url/recipient) and learned rules (three approvals, no declines, propose the narrowest rule). The policy converges toward what you actually do. Bea asks about one or two drafts a day now.

**"Does it work with OpenAI / Claude / local models?"** Gemini, Anthropic and Ollama today, behind one provider interface; adding one is a ~100-line file. OpenAI is a PR away.

**"Docker sandbox is optional?"** Yes. Local tool servers run on the host unless you add a `sandbox:` block. Remote servers run on someone else's machine; the policy is the whole boundary there, which is why block is the default.

**"What about prompt injection via tool results?"** The policy doesn't trust the model, so injected instructions can still only reach allowed tools with allowed arguments, and anything marked ask stops for a human. It doesn't stop a model from being talked into misusing an allowed tool within the rule, which is the argument for narrow allows.

**"Why Gmail through your own MCP server instead of Google's?"** So that the server itself can't send, delete or unlabel: it has no such tool, and it only adds your own labels, never Inbox, Spam or Trash. The policy is the second lock, the server is the first.

**"Is there a phone app?"** The control room is a web app you add to the home screen; it also ships as an Android app in closed testing on Google Play and an iPhone app that runs in the Simulator today.
