---
title: I built Garu, an open-source runtime for always-on agents you can actually trust
published: false
tags: ai, opensource, typescript, agents
cover_image: https://garuagents.com/screenshots/og.png
---

The big labs are shipping agents that run all day on a computer of their own and act for you. I wanted that. I also wanted to know exactly what the thing could touch while I slept, and none of them gives you that. They're closed, tied to one vendor, and not available where a lot of people live.

So I built the open version, and I built it around the part they treat as an afterthought: control.

Garu runs agents on your own computer, on a schedule, with Gemini, Claude or a local model and any MCP tool. Every action the agent takes goes through a policy I wrote. It's three weeks old, it runs my own agents every day, and it's Apache-2.0.

![Bea's rules in plain words: reading and filing mail allowed, sending impossible, a draft asks first. Then a draft reply waits for a tap, and once approved it is saved in Drafts, not sent](https://garuagents.com/demo.gif)

That's from the launch video, built from Bea's real Garufile; the email is an example. Bea is the agent I use most: every weekday at 8 she goes through what arrived in my Gmail since yesterday, files each thread under one of four labels, and writes a draft reply for the ones that need one. Every draft waits for me. Sending isn't something she can be allowed to do, because the Gmail server she talks to has no send tool.

## The idea in one file

An agent is a YAML file. The interesting part is the policy. This is Bea's, with one long list of no-reply address words shortened:

```yaml
name: bea
model: gemini/gemini-3.5-flash-lite
triggers:
  - cron: "0 8 * * 1-5"
budget: { maxCostUsd: 0.05 }

tools:
  - name: gmail
    command: node
    args: ["packages/mcp-google/dist/index.js", "gmail"]
    auth: oauth                  # Google's client id and secret come from .env
    oauth:
      issuer: https://accounts.google.com
      clientId: ${GOOGLE_CLIENT_ID}
      clientSecret: ${GOOGLE_CLIENT_SECRET}
      scopes: [https://www.googleapis.com/auth/gmail.modify]

policy:
  - tool: "gmail.search_threads"   # reading: always fine
    action: allow
  - tool: "gmail.get_thread"
    action: allow
  - tool: "gmail.list_labels"
    action: allow
  - tool: "gmail.label_thread"     # filing: a label comes off in one click
    action: allow
  - tool: "gmail.create_draft"     # a reply to an address no one reads goes nowhere
    when: { to: { matches: "(no-?reply|do-?not-?reply|notifications?|newsletters?)", ignoreCase: true } }
    action: block
    reason: a reply to an automated sender goes nowhere
  - tool: "gmail.create_draft"     # words in my name: I see each one first
    action: ask
    reason: a draft reply in your name
  - tool: "gmail.*"
    action: block
    reason: Bea only reads, files and drafts
  - tool: "*"
    action: block
```

Rules are read top to bottom, first match wins, and nothing matching means ask. Never a silent allow. Rules see arguments, so a draft to a no-reply address is blocked before the model wastes a turn on it, and I could allow a tool for one host or one path and block it everywhere else. A tool no rule can ever allow isn't shown to the model at all.

## What happens when a rule says ask

The run pauses. The request shows up in an inbox as what it is: an email looks like an email, a file write shows the file, a message shows the message. Three buttons: Approve, Approve for 24 hours, Decline. If nobody answers in 30 minutes, it's a no.

The thing I didn't expect to matter this much: declining can carry a note, and the agent reads it before its next step.

Here's why. My repo watcher, `rook`, checks the Garu repository through GitHub's hosted MCP server (every Monday now; it started hourly). The first time it ran, the brief I'd given it said "the Garu repo" without naming it. It searched GitHub, found someone else's project called garu with 179 stars, and tried to write that into its log. The review card showed me the wrong numbers before anything touched disk. I declined. Then it tried to post the same wrong numbers. Declined again. The policy did its job, but the agent had no idea *why*, so it kept going with the mistake. Now a decline says "wrong repo, use humbertovillanueva/garu" and the agent corrects course instead of carrying the error into the next call.

Approve the same thing three times with no declines and Garu proposes the narrowest rule that covers what you approved, one exact value, a common directory, or the whole tool, and writes it into your file when you say so. Approving isn't a dialog box you click through. It's how the policy gets written.

## Remote servers, with a policy in front of them

Any MCP server works, local or hosted. GitHub's hosted server offers 46 tools. Rook is allowed three of them, and only when `owner` and `repo` name my repository. The other 43 are blocked and the model never sees them.

```yaml
tools:
  - name: github
    url: https://api.githubcopilot.com/mcp/
    headers: { Authorization: "Bearer ${GITHUB_TOKEN}" }
  - name: linear
    url: https://mcp.linear.app/mcp
    auth: oauth
```

Servers that want a login use OAuth. `garu auth` opens a browser once; runs use the saved tokens after that. An unattended run that would need a browser stops with the exact command to run.

## Everything else

A flight recorder writes every model turn, tool call, decision and approval to an append-only file per run. You can replay any run as a timeline. A budget cap stops a run before it crosses `maxCostUsd`; my five agents together cost well under a cent a day on Gemini's free tier, and Ollama runs the examples for $0. Tool servers can run in Docker with no network and a read-only root. There's a control room that works on a phone over Tailscale, so I approve things from bed.

`garu new` asks a few questions and writes a Garufile with a policy that starts closed.

## The three questions I get

*Why not cron and a script?* A script does the same thing every night. An agent decides what to do next, which is exactly why you need a per-argument policy, a record of every decision, a cap and an inbox. Without them it works until the night it doesn't.

*Who can reach the control room?* It listens on localhost, and a browser on the same computer is let in as you. Anything else needs the sign-in token; my phone gets it by scanning a code, over Tailscale, so only my own devices can resolve the address at all. No account, no cloud, no database: everything is files under `.garu/`.

*Always-on, on a laptop?* Mine sleeps. A run holds the Mac awake while it works, and a schedule missed while asleep runs once at wake, within six hours.

## Try it

```sh
git clone https://github.com/humbertovillanueva/garu && cd garu
npm install && npm run build
printf 'GEMINI_API_KEY=your-key\nGARU_USER=YourName\n' > .env
npm run garu -- ui --up --as YourName
```

Five minutes, free key from aistudio.google.com, no card. Click `pip`, press Run now, approve the write when it asks. Bea and Tomay need a free Google Cloud project once; the guide takes about fifteen minutes.

I'd like to know where it breaks for you, what agent you'd actually run, and what the policy language can't express yet. Repo: [github.com/humbertovillanueva/garu](https://github.com/humbertovillanueva/garu). Site: [garuagents.com](https://garuagents.com/).
