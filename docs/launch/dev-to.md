---
title: I built Garu, an open-source runtime for always-on agents you can actually trust
published: false
tags: ai, opensource, typescript, agents
cover_image: https://humbertovillanueva.github.io/garu/screenshots/home.png
---

OpenAI shipped Dots and Meta shipped Muse: agents that run all day on a computer of their own and act for you. I wanted that. I also wanted to know exactly what the thing could touch while I slept, and neither of those gives you that. They're closed, tied to one vendor, and not available where a lot of people live.

So I built the open version, and I built it around the part they treat as an afterthought: control.

Garu runs agents 24/7 with any model and any MCP tool. Every action the agent takes goes through a policy I wrote. It's a week old, it runs my own agents every day, and it's Apache-2.0.

![Tomay writes the morning brief, pauses before posting it to Slack, and I approve from the browser](https://humbertovillanueva.github.io/garu/demo.gif)

That's a real run. Four fetches and a file write allowed by policy, one Slack post paused for me, approved, posted. Twenty seconds, $0.003.

## The idea in one file

An agent is a YAML file. The interesting part is the policy:

```yaml
name: tomay
model: gemini/gemini-3.5-flash-lite
triggers:
  - cron: "0 7 * * 1-5"
budget: { maxCostUsd: 0.05 }

tools:
  - name: web
    command: node
    args: ["packages/mcp-fetch/dist/index.js"]
    env: { WEBHOOK_URL: "${BRIEF_WEBHOOK_URL}" }
  - name: fs
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "./briefs"]

policy:
  - tool: "web.fetch_json"        # read from four hosts, nothing else
    action: allow
    when: { url: { matches: "^https://(api\\.github\\.com/|dev\\.to/api/|hn\\.algolia\\.com/api/|api\\.open-meteo\\.com/)" } }
  - tool: "web.post_message"      # posting to my channel: ask, every time
    action: ask
  - tool: "fs.write_file"         # only a dated brief
    action: allow
    when: { path: { matches: "briefs/\\d{4}-\\d{2}-\\d{2}\\.md$" } }
  - tool: "fs.list_*"
    action: allow
  - tool: "*"
    action: block
```

Rules are read top to bottom, first match wins, and nothing matching means ask. Never a silent allow. Rules see arguments, so I can allow a tool for one host or one path and block it everywhere else. A tool no rule can ever allow isn't shown to the model at all, so it never wastes a turn trying.

## What happens when a rule says ask

The run pauses. The request shows up in an inbox as what it is: an email looks like an email, a file write shows the file, a Slack post shows the message. Three buttons: Approve, Approve for 24 hours, Decline. If nobody answers in 30 minutes, it's a no.

The thing I didn't expect to matter this much: declining can carry a note, and the agent reads it before its next step.

Here's why. My second agent, `repo-watch`, checks my repo every hour. The first time it ran, the brief I'd given it said "the Garu repo" without naming it. It searched GitHub, found someone else's project called garu with 179 stars, and tried to write that into its log. The review card showed me the wrong numbers before anything touched disk. I declined. Then it tried to post the same wrong numbers to Slack. Declined again. The policy did its job, but the agent had no idea *why*, so it kept going with the mistake. Now a decline says "wrong repo, use humbertovillanueva/garu" and the agent corrects course instead of carrying the error into the next call.

Approve the same thing three times with no declines and Garu proposes the narrowest rule that covers what you approved, one exact value, a common directory, or the whole tool, and writes it into your file when you say so. Approving isn't a dialog box you click through. It's how the policy gets written.

## Remote servers, with a policy in front of them

Any MCP server works, local or hosted. GitHub's hosted server offers 46 tools. My repo-watch agent is allowed three of them, and only when `owner` and `repo` name my repository. The other 43 are blocked and the model never sees them.

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

A flight recorder writes every model turn, tool call, decision and approval to an append-only file per run. You can replay any run as a timeline. A budget cap stops a run before it crosses `maxCostUsd`. Tool servers can run in Docker with no network and a read-only root. Gemini's free tier runs all of mine; Ollama runs them for $0. There's a control room that works on a phone over Tailscale, so I approve things from bed.

`garu new` asks a few questions and writes a Garufile with a policy that starts closed.

## Try it

```sh
git clone https://github.com/humbertovillanueva/garu && cd garu
npm install && npm run build
printf 'GEMINI_API_KEY=your-key\nGARU_USER=YourName\n' > .env
npm run garu -- ui --up --as YourName
```

Five minutes, free key from aistudio.google.com, no card. Click `hello`, press Run job, approve the write when it asks.

I'd like to know where it breaks for you, what agent you'd actually run, and what the policy language can't express yet. Repo: [github.com/humbertovillanueva/garu](https://github.com/humbertovillanueva/garu). Site: [humbertovillanueva.github.io/garu](https://humbertovillanueva.github.io/garu/).
