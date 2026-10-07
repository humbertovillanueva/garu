# Garu

**The open personal agent cloud.** Always-on agents that run on your machine or your server, use any model and any MCP tool, and put every single action through a policy kernel you control.

> OpenAI shipped Dots: always-on agents, each with its own computer, locked to one vendor and one plan. Garu is the open version. Any model. Any tools. Yours.

## What you get

- **Agents that run 24/7.** Give an agent a cron trigger and `garu up` keeps it alive: one run at a time, every fire and skip logged, clean shutdown.
- **Any model.** Claude, GPT, Gemini, local models. Swap per agent, or per task by cost.
- **Any tool, via MCP.** An agent only ever touches the world through the Model Context Protocol.
- **A policy kernel.** Every tool call is checked against rules you wrote: `allow`, `ask`, or `block`, by tool name and by argument. Nothing slips past it, and tools that are always blocked are never even shown to the model.
- **An approval inbox.** When a rule says `ask`, the agent pauses. `garu inbox` shows what's waiting, `garu approve <id>` lets it through, and it resumes. Unanswered requests expire as a deny. Add `--notify https://ntfy.sh/<your-topic>` and the request lands on your phone.
- **A flight recorder.** Every call, decision, approval and model turn is written to an append-only log. Searchable. Diffable. Yours.
- **A budget cap.** Each run's cost is estimated from real token counts and shown in the log; set `budget.maxCostUsd` and the run stops the moment it would cross it.
- **Garufile.** One portable manifest describes an agent: prompt, tools, triggers, policy, memory. Publish it, install it, fork it.

## Status

Early. The kernel is being built in the open. Follow along, open issues, or wait for `v0.1`.

## A Garufile

```yaml
name: inbox-triage
description: Reads new mail, drafts replies, never sends without asking.
model: anthropic/claude-sonnet-4-5

tools:
  - name: gmail
    command: npx
    args: ["-y", "@example/mcp-gmail"]

triggers:
  - cron: "*/15 * * * *"

budget:
  maxCostUsd: 0.25             # the run stops the moment it would cost more

policy:
  - tool: "gmail.list_*"       # read freely
    action: allow
  - tool: "gmail.send"         # sending always needs a human
    action: ask
  - tool: "gmail.delete*"      # never
    action: block
  - tool: "*"
    action: ask                # default: when in doubt, ask

prompt: |
  You triage my inbox. Draft replies for anything that needs one.
  Never send anything yourself.
```

## Layout

```
packages/kernel   # Garufile schema, policy engine, flight recorder, MCP tool bus, agent loop
packages/cli      # garu run · up · inbox · approve · deny · log · validate
examples/         # Garufiles you can run today
```

## Try it (free)

```sh
git clone https://github.com/humbertovillanueva/garu && cd garu
npm install && npm run build

# a free Gemini key from https://aistudio.google.com works for the example
printf 'GEMINI_API_KEY=your-key\n' > .env

npm run garu -- validate examples/hello/Garufile.yaml
npm run garu -- run      examples/hello/Garufile.yaml   # approve the write when asked
npm run garu -- log      hello                          # replay the flight recorder

# always-on: keep an agent running on its cron schedule until Ctrl-C
npm run garu -- up examples/heartbeat/Garufile.yaml

# in another terminal, when the agent hits an `ask` rule:
npm run garu -- inbox              # see what's waiting
npm run garu -- approve <id>       # or: deny <id>
```

Unattended `ask` decisions go to the inbox and expire as a deny after 30 minutes (`--ask-timeout`). Want them on your phone? Install the free [ntfy](https://ntfy.sh) app, pick a topic, and run `garu up … --notify https://ntfy.sh/<topic>`. `--on-ask allow|deny|terminal` are there for agents you fully trust, don't trust at all, or are watching live.

Providers today: `gemini/*`, `anthropic/*`, and `ollama/*` for local models. For a fully local, $0 run:

```sh
ollama pull llama3.1:8b                                # once, ~4.9 GB
npm run garu -- run examples/hello-local/Garufile.yaml
```

## Develop

```sh
npm install
npm run typecheck
npm test
```

## License

Apache-2.0. Built by [Humberto Villanueva](https://humbertovillanueva.dev).
