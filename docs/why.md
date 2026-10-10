# Garu, explained

This is the document to read before you explain Garu to anyone else. It covers where the idea came from, what each piece is and why it exists, what we're trying to achieve, how Garu differs from everything near it, and the hard questions people will ask. Read it twice. The last section gives you the one-sentence, one-paragraph and one-minute versions to say out loud.

## Where it came from

In the five weeks before Garu existed, two of the largest companies in the world shipped the same product. OpenAI announced Dots at DevDay: always-on agents, each with its own cloud computer, that work for you around the clock. Meta shipped Muse: a personal agent on Meta's cloud that books, fills forms, and buys, with approvals through an app or WhatsApp. Both told the same story: you will have agents working for you while you sleep.

Both have the same shape of problem. They are closed. They are tied to one vendor's models. Neither is available across most of Europe, Switzerland or the UK. Dots doesn't let you see or delete individual memories. And the sharpest complaint from people who actually used Dots was not about the AI at all: "my throughput is limited by my approval." The agent generates work faster than a human can review it, so you either rubber-stamp everything or you become the bottleneck.

The question Garu started from is simpler than any of that. If a thing is going to run all night with access to my files, my email, my repos, my Slack: what exactly can it touch, who decided that, and where is the record? Dots and Muse treat that as a settings page. Garu treats it as the product.

So the bet was: build the open version, and build it around control. Not "an agent that chats with you". A runtime that runs agents, and a kernel that sits between every agent and every tool.

## What Garu is, in one line

Garu is a runtime for always-on agents where every action passes through a policy you wrote, is recorded, is cost-capped, and can be sandboxed. The short form: Garu is systemd for your agents.

The systemd analogy is worth understanding because it's precise. systemd doesn't write your programs. It runs them: starts them on a schedule, restarts them, isolates them, logs what they do, and lets you say what they're allowed to touch. Garu is that layer for agents. The agent's intelligence comes from whichever model you point it at. Garu is everything around the model that makes it safe to leave running.

## The four pieces

**The Garufile.** An agent is one YAML file. It names a model, lists the MCP tool servers the agent can use, sets a schedule, caps the cost, and, most importantly, carries the policy. Because it's a file, it's diffable, reviewable, versionable, and shareable. Someone else's agent is a file you can read before you run it. That matters more than it sounds: the alternative, which is how Dots works, is configuration you can't see living inside someone else's cloud.

**The policy kernel.** This is the heart. Every tool call the model wants to make goes to the kernel first. The kernel reads the rules top to bottom; the first rule that matches decides: allow, ask, or block. Rules match on the tool name and on the arguments, so you can allow a fetch tool for four specific hosts and block it everywhere else, or allow a file write only for paths matching `briefs/2026-10-07.md`. Three properties make it a kernel rather than a filter. It sits between the model and the MCP client in code, not in the prompt, so the model cannot talk its way past it. Nothing matching means ask, never a silent allow. And a tool that no rule could ever allow is never shown to the model at all, so the model can't waste a turn trying, and GitHub's 46-tool server shows up as 3 tools.

**The flight recorder.** Every run writes an append-only file: the model's turns with token counts and cost, every tool request, every policy decision, every approval and who gave it, every result. The control room is a view over those files. The CLI's `garu log` is another view. There is no database, so there's nothing to corrupt, nothing to migrate, and the record is a folder you can grep. If an agent did something at 3am, you can replay exactly what it saw and decided.

**The control room.** A web app, also a phone app, that shows agents as what they are: named things with a status, a conversation, and a history. When a rule says ask, the run pauses and a review card appears that looks like the thing being asked: an email looks like an email, a file write shows the file, a draft reply shows who it's to and what it says. Approve, approve for 24 hours, or decline with a note the agent reads. It also runs the schedules, so "my agents are running" and "I can see my agents" are the same process.

## Why MCP is the reason this works

Garu doesn't ship integrations. It speaks the Model Context Protocol, which is the standard way models talk to tools; it moved to the Linux Foundation in late 2025 and there are over ten thousand servers for it. Because every tool, local or hosted, arrives through the same protocol, the kernel is universal: one policy language covers a filesystem on your laptop, GitHub's hosted server, Linear, your company's internal API. Remote servers connect over Streamable HTTP; servers that want a login use OAuth, which `garu auth` does once in a browser. Without MCP, Garu would need an adapter per service and the policy would be bespoke per adapter. With it, the policy is the product and the tools are someone else's problem.

## The approval philosophy

The Dots complaint, "my throughput is limited by my approval", is the design brief for everything in Garu's inbox. Three ideas answer it.

First, ask should be rare and specific. Reads are usually allowed outright; writes to the agent's own folder are usually allowed; the things that leave the machine or touch something shared are what ask. A well-written Garufile asks about one or two things per run, not twenty.

Second, approvals should write the policy. "Approve for 24h" creates a grant scoped to this agent, this tool, this exact path or URL or recipient, until tomorrow. Approve the same thing three times with no declines and Garu proposes the narrowest rule that covers what you actually approved, and writes it into your Garufile, comments preserved, when you say so. The policy converges toward what you do instead of staying a document you wrote once.

Third, a decline should teach. Declining a call used to stop that call and nothing else. Our own agent proved why that's not enough: told to watch "the Garu repo" without being given the name, it found someone else's project called garu and tried to log its stats. The review card caught the wrong numbers, I declined, and the agent then tried to post the same wrong numbers to Slack, because nothing told it why. Now a decline carries a note, "wrong repo, use humbertovillanueva/garu", that goes back to the model before its next step. A declined call becomes a correction, not just a wall.

And always: silence is a deny. A request nobody answers in thirty minutes is refused. An unattended agent never gets a yes by default.

## What we are trying to achieve

Near term, the goal is for Garu to be the thing people actually run when they want an agent working unattended with write access to something they care about. The test is simple: would you let it run overnight? If the answer is yes because of the policy, the recorder and the cap, Garu is doing its job.

Medium term, two things. A registry, `garu install <url>`, so a Garufile someone else wrote is one command away and you can read its policy before you run it. And a hosted Garu for people who don't want to keep a laptop open: agents that keep running, tap-to-approve on the phone, available in the places Dots and Muse aren't.

The north star: anyone can have agents working for them around the clock without handing over the keys to a company whose rules they can't read. The policy file is the user's. The record is the user's. The model is whichever one they choose, including one running on their own machine for free.

## How Garu is different

Against **Dots and Muse**: they are closed, single-vendor, and regionally restricted; the policy and the memory live in their cloud. Garu is open, runs any model including local ones, runs where you are, and the policy is a file you own.

Against **agent frameworks** like LangGraph, CrewAI or the OpenAI Agents SDK: those are for building an agent, the loop and the prompts and the orchestration. Garu is for running one unattended. They solve build-time; Garu solves run-time. Because MCP sits in the middle, an agent built with one of them could in principle run under Garu's kernel.

Against **OpenDots** (CopilotKit), the closest open-source neighbor: it's an always-on coworker app, Slack and voice and channels, with permissions per Dot. Garu is a runtime with a policy kernel: per-tool and per-argument rules, static hiding, a flight recorder, budget caps, a sandbox, cron, local models. They'll win "friendly coworker in Slack" on brand and funding; Garu shouldn't fight there. An app like that could run on Garu.

Against **open-multi-agent**: strong on governance, durable approvals, verifiable journal, but built for teams orchestrating pipelines. Garu is personal and always-on: one YAML file, one command, an inbox, your phone.

Against **workflow tools** like n8n or Zapier: those run fixed graphs you drew. Garu runs a model that decides what to do next, inside limits you set. The policy exists precisely because the agent isn't a fixed graph.

Against **running an AI coding tool in cron**: no per-argument policy, no record of decisions, no cap, no inbox, no learning from approvals. It works until the night it doesn't.

The sentence that captures all of it: everyone else is building the agent; Garu is the thing you can trust to run it.

## What we've proven so far

Not slides; runs. Tomay reads the calendar every weekday at 7 and writes a prep note for each meeting from recent email with the people in it; it can only read, so it never pauses; its first run cost $0.0013. Bea files the last day's mail under four labels at 7:15 and drafts replies that wait for a tap; Garu's Gmail server has no send tool, so she can't send even if a rule were wrong. Her first runs on real mail are why she files in batches now: seven threads, nine turns, $0.004. repo-watch reads GitHub's hosted MCP server, is allowed 3 of its 46 tools and only for one repository, and logs stars, forks, issues and PRs every hour. Planner reads a Linear workspace over OAuth, lists the backlog, and files an issue when asked, with the issue shown in full before it's created. Local models through Ollama run the examples for nothing. Docker sandboxing runs tool servers with the network off. The free Gemini tier runs all of it. Twenty-seven test files and 189 tests cover the kernel, the inbox, grants, suggestions, the scheduler, remote servers, OAuth and the Google server.

## The hard questions, answered honestly

*Can't the model get around the policy?* It cannot call a tool the policy blocks; the kernel is code between the model and the tools, not an instruction in the prompt. What it can do is pick a wrong argument for an allowed tool, which is why rules see arguments and why ask exists for the calls that matter.

*What about prompt injection in tool results?* Injected text can only reach allowed tools with allowed arguments, and anything marked ask stops for a human. It does not stop a model being talked into misusing an allowed tool within its rule. The defense is narrow allows, which is the whole design.

*Won't approving everything be annoying?* At first. Grants and learned rules exist to make it converge. A good Garufile asks about one or two things per run after the first week.

*Is the sandbox mandatory?* No. Local tool servers run on the host unless you add a sandbox block. Remote servers run on someone else's machine, so the policy is the entire boundary there, which is why block is the default.

*Why no login on the control room?* It binds to localhost. For the phone, it goes over Tailscale, which means only your own devices can reach it. Binding it to a network address prints a warning because there is no authentication yet. That is a real gap for any hosted version.

*Is a week old enough to trust?* Trust the design, not the age. The design is the smallest thing that answers the overnight question, and every part of it is readable: a YAML file, a JSONL log, a few thousand lines of TypeScript.

## Vocabulary

A **Garufile** is the YAML file that defines an agent. A **tool server** is an MCP server, local (a command) or remote (a URL). The **policy** is the ordered list of rules; **allow**, **ask** and **block** are the three decisions. **Static hiding** means tools that can never be allowed are not offered to the model. The **inbox** holds asks waiting for a human; a **review card** is one of them. A **grant** is a temporary scoped allow made by "Approve for 24h". A **suggestion** is a rule Garu proposes after repeated approvals. The **flight recorder** is the per-run JSONL log; a **run** is one execution with its own id. A **trigger** is what starts a run: cron, a message, or Run now. The **control room** is the web and phone UI; `garu ui --up` runs it together with the schedules.

## How to say it

One sentence: Garu runs agents around the clock, and every action they take goes through a policy you wrote.

One paragraph: Garu is an open-source runtime for always-on agents. An agent is a YAML file with a model, some MCP tool servers, a schedule and a policy. Every tool call goes through the policy first: allow, ask, or block, by tool name and by argument. Ask pauses the run and puts a review card in your inbox, on your phone if you like; silence is a no. Every run is recorded, every run is cost-capped, tool servers can run in Docker, and any model works, including local ones for free. It's systemd for your agents.

One minute: start with the question. "If an agent is going to run all night with access to my files and my accounts, what exactly can it touch, who decided, and where's the record?" Say that OpenAI and Meta just shipped always-on agents and neither answers that well: closed, one vendor, not available in much of the world, approval as an afterthought. Then Garu: an agent is a file you can read; every action goes through a policy kernel that sits in code between the model and the tools; the things that matter pause for you and the rest doesn't; approvals write the policy over time; everything is recorded; it runs on free or local models. Close with the demo: an agent that files last night's email into four labels and drafts the replies, every draft waiting for your tap and no way to send at all, for under half a cent. Then the line: everyone else is building the agent; Garu is the thing you can trust to run it.
