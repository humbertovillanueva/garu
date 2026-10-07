<p align="center">
  <img src="docs/demo.gif" alt="Tomay, a morning-brief agent, is told to write today's brief and post it. It fetches four sources and writes the file under allow rules, then pauses on post_message, which the policy marks ask. One click approves it and the brief appears in Slack." width="900">
</p>
<p align="center"><sub>Real run, real model, real Slack: four fetches and a file write allowed by policy, one post paused for a human, $0.003.</sub></p>

<h1 align="center">Garu</h1>

<p align="center"><strong>Always-on agents you can actually trust.</strong><br>
Any model. Any MCP tool. Every action through a policy you wrote, recorded, capped, and sandboxed.</p>

<p align="center">
  <a href="https://humbertovillanueva.github.io/garu/">Website</a> ·
  <a href="#try-it-in-five-minutes-free">Quickstart</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#the-garufile">Garufile</a> ·
  <a href="#approvals-that-get-smarter">Approvals</a> ·
  <a href="#where-garu-fits">Where Garu fits</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

OpenAI shipped Dots and Meta shipped Muse: agents that run all day on a computer of their own and act for you. Both are closed, tied to one vendor, and unavailable in much of the world. Garu is the open version, built around the part they treat as an afterthought: **control**.

- **Agents that run 24/7.** A cron trigger in a small YAML file and `garu ui --up` keeps the agent alive. One run at a time, every fire logged, clean shutdown.
- **A policy kernel in front of every tool.** `allow`, `ask`, or `block`, by tool name *and* by argument. Tools that can never pass policy are never shown to the model.
- **An inbox, not a firehose.** When a rule says `ask`, the run pauses. You see the email as an email, the file as a file. Approve once, approve for 24 hours, or decline. Silence is a deny.
- **Policy that learns, with you in control.** Approve the same thing three times and Garu proposes the exact rule, scoped to what you actually approved, and writes it into your file when you say so.
- **A flight recorder.** Every model turn, tool call, decision and approval in an append-only log. Replay any run as a timeline.
- **A budget cap.** Cost is estimated from real token counts; a run stops the moment it would cross `maxCostUsd`.
- **A sandbox.** Each tool server in its own Docker container: no network, read-only root, only the agent's workspace mounted, destroyed after the run.
- **Any model.** Gemini (free tier), Claude, or local models through Ollama at $0. Switch by changing one line.
- **Talk to your agents.** Each agent has a thread. Ask it a question, give it work, or just read what it did while you were away.

## Try it in five minutes (free)

You need Node 22+ and a free Gemini key from [aistudio.google.com](https://aistudio.google.com) (no card).

```sh
git clone https://github.com/humbertovillanueva/garu && cd garu
npm install && npm run build
printf 'GEMINI_API_KEY=your-key\nGARU_USER=YourName\n' > .env

npm run garu -- ui --up --as YourName       # control room at http://localhost:4000
```

Open the control room, click **hello** in the sidebar, and press **Run job**. It reads `examples/hello/workspace/notes.md`, pauses to ask before writing a summary, and you approve from the browser. Then type a message to it.

Prefer the terminal?

```sh
npm run garu -- validate examples/hello/Garufile.yaml
npm run garu -- run      examples/hello/Garufile.yaml   # approve the write when asked
npm run garu -- log      hello                          # replay the flight recorder
```

**Fully local, $0:** install [Ollama](https://ollama.com), `ollama pull qwen3:8b`, then `npm run garu -- run examples/hello-local/Garufile.yaml`.

**Your own agent:** `npm run garu -- new` asks what it should do, when, which model, which folder and which hosts, and writes `agents/<name>/Garufile.yaml` with a policy that starts closed — only the tools you named, writes ask first, everything else blocked. Then `Run job` in the control room.

**Sandboxed:** with Docker running, `npm run garu -- sandbox build` once, then `npm run garu -- run examples/hello-sandboxed/Garufile.yaml`.

## How it works

```
 you ──▶ control room / CLI ──▶ agent loop ──▶ model (Gemini · Claude · Ollama)
                                     │
                                     ▼
                              policy kernel  ──▶ allow ─▶ MCP tool server (optionally in Docker)
                                     │           ask   ─▶ inbox ─▶ you (browser · CLI · phone push)
                                     │           block ─▶ never executed
                                     ▼
                              flight recorder (.garu/runs/<agent>/<run>.jsonl)
```

An agent only ever touches the world through the [Model Context Protocol](https://modelcontextprotocol.io). The policy kernel sits between the model and every MCP server. The flight recorder sees everything the kernel sees. The control room is a view over those files; so is `garu log`. There is no database.

<p align="center"><img src="docs/screenshots/run.png" alt="A run replayed as a timeline: each model turn, each tool call with its policy decision and result" width="900"></p>

## The Garufile

One file describes an agent: who it is, what it may touch, when it wakes up, and how much it may spend. This is a real one from this repo, the agent that writes the author's morning brief:

```yaml
name: tomay
description: Writes a short morning brief — weather, Garu repo, dev.to, AI news.
model: gemini/gemini-3.5-flash-lite

triggers:
  - cron: "0 7 * * 1-5"          # weekdays at 7, in your local time

budget:
  maxCostUsd: 0.05               # per run; the run stops if it would cross this

tools:
  - name: web
    command: node
    args: ["packages/mcp-fetch/dist/index.js"]
  - name: fs
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "./agents/tomay/briefs"]

policy:
  - tool: "web.fetch_json"       # read only from these four hosts
    action: allow
    when:
      url: { matches: "^https://(api\\.github\\.com/|dev\\.to/api/|hn\\.algolia\\.com/api/|api\\.open-meteo\\.com/)" }
  - tool: "web.*"
    action: block
  - tool: "fs.write_file"        # write only a dated brief, nothing else
    action: allow
    when:
      path: { matches: "briefs/\\d{4}-\\d{2}-\\d{2}\\.md$" }
  - tool: "fs.list_*"
    action: allow
  - tool: "*"
    action: block

prompt: |
  You are Tomay. Write Humberto's morning brief for today…
```

Rules are evaluated top to bottom; the first match wins; nothing matching means `ask`, never a silent allow. `when` predicates (`eq`, `matches`, `gt`, `in`, …) let you allow a tool for one path or one host and block it everywhere else. `garu validate` lints the file and tells you which rules are unreachable.

Other fields: `sandbox:` (image, network, workspace, memory, cpus), `modelOptions:` (provider knobs, e.g. Ollama `think: false`), `maxTurns:`.

<p align="center"><img src="docs/screenshots/agent.png" alt="An agent's page: its identity, permissions, a conversation thread, and the brief it wrote" width="900"></p>

## Approvals that get smarter

The complaint practitioners make about always-on agents is that *their* throughput becomes the bottleneck: the agent works all night and you spend the morning clicking Approve. Garu treats approval as the product, not a dialog box.

1. **`ask` pauses the run** and the request appears in the inbox as what it is: an email with To/Subject/Body, a file with its path and content, a command. The agent is told it's waiting; nothing else happens.
2. **Approve · Approve for 24h · Decline.** "For 24h" creates a *grant*: this agent, this tool, this exact path/url/recipient, until tomorrow. Later identical asks are answered by the grant and logged as `approved by grant …`. `garu grants` lists and revokes them. **Decline can carry a note** ("wrong repo — use humbertovillanueva/garu"): the agent reads it before its next step, so a decline corrects the run instead of just stopping one call. Same from the terminal: `garu deny <id> --note "…"`.
3. **Learned rules.** Approve the same agent + tool three times with no declines and Garu proposes the narrowest rule that covers your approvals: one exact value, a common directory, or the whole tool. **Add to Garufile** inserts it above the current `ask` rule and keeps your comments. **Not now** hides it.
4. **Unanswered requests expire as a deny** (30 minutes by default). Silence never means yes.
5. **Phone:** `--notify https://ntfy.sh/<your-topic>` pushes each request to the free [ntfy](https://ntfy.sh) app.

<p align="center"><img src="docs/screenshots/inbox.png" alt="The inbox: pending approvals, a learned-rule suggestion, and temporary grants" width="900"></p>

## Commands

| Command | What it does |
|---|---|
| `garu new [name]` | Make your own agent: a few questions, then a Garufile with a closed policy. Flags for scripting (`--task`, `--when`, `--web`, `--fs`, `-y`). |
| `garu ui [--up] [--as Name] [--notify URL]` | Control room at localhost:4000. `--up` also runs every cron schedule found under the current folder. |
| `garu run <Garufile> [-i note]` | Run an agent once, approving in the terminal. |
| `garu up <Garufiles…>` | Run schedules without the UI; `--on-ask inbox\|deny\|allow\|terminal`. |
| `garu inbox` · `garu approve <id> [--for 24h]` · `garu deny <id>` | The inbox from the terminal. |
| `garu grants [list\|revoke <id>]` | Temporary allows. |
| `garu log [agent] [run]` | Replay a flight recorder. |
| `garu validate <Garufile>` | Lint policy, cron, budget, sandbox. |
| `garu sandbox build` | Build the default Docker image for tool servers. |

## Where Garu fits

Be clear about what this is and isn't. Dots and Muse are polished consumer products with thousands of integrations, running on their makers' clouds with their makers' models. OpenDots is a friendly open-source coworker that lives in Slack and voice calls. open-multi-agent is a serious framework for orchestrating teams of agents inside a company, with audit trails to match.

Garu is the layer underneath all of that: *systemd for your agents*. It runs on your laptop or your server, with any model including local ones, and its whole design is about one question: **can I let this thing run unattended with write access to something I care about?** Per-argument policy, rules learned from your own approvals, a cost cap on every run, a sandbox with the network off by default, and a flight recorder that misses nothing. If that's the question you're asking, this is the runtime for it.

## Status and roadmap

Garu is a week old and already runs the author's own agents every day. Expect sharp edges. What's next, in order:

1. **Remote MCP servers** (Streamable HTTP + OAuth) so agents can use the 10,000+ servers in the MCP registry: Gmail, Calendar, GitHub with write access.
2. **`garu install <url>`**: a registry of Garufiles you can install, fork and publish.
3. **Phone:** installable control room (PWA) with push, reachable over Tailscale.
4. **Hosted Garu:** agents that keep running when your laptop is closed, tap-to-approve from anywhere, EU-friendly by default.
5. Delegation between agents over A2A; transparent, editable memory.

## Layout

```
packages/kernel     Garufile schema · policy engine · flight recorder · MCP bus · agent loop · scheduler · inbox · grants · suggestions · sandbox · providers
packages/cli        the garu command
packages/ui         the control room (Svelte 5 + Tailwind 4)
packages/mcp-fetch  a tiny MCP server: fetch_json / fetch_text, GET only
agents/             real agents that run from this repo (tomay)
examples/           Garufiles to learn from
docker/sandbox      the default sandbox image
```

## Contributing

Issues and PRs welcome. Run `npm run typecheck && npm test` before opening one. The flight recorder format and the Garufile schema are the two things we try not to break.

## License

Apache-2.0. Built by [Humberto Villanueva](https://humbertovillanueva.dev) in Salt Lake City.
