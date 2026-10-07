# Garu

**The open personal agent cloud.** Always-on agents that run on your machine or your server, use any model and any MCP tool, and put every single action through a policy kernel you control.

> OpenAI shipped Dots: always-on agents, each with its own computer, locked to one vendor and one plan. Garu is the open version. Any model. Any tools. Yours.

## What you get

- **Agents that run 24/7** in their own sandbox, with their own memory and working directory.
- **Any model.** Claude, GPT, Gemini, local models. Swap per agent, or per task by cost.
- **Any tool, via MCP.** An agent only ever touches the world through the Model Context Protocol.
- **A policy kernel.** Every tool call is checked against rules you wrote: `allow`, `ask`, or `block`, by tool name and by argument. Nothing slips past it.
- **An approval inbox.** When a rule says `ask`, the agent pauses and you decide.
- **A flight recorder.** Every call, decision, approval and model turn is written to an append-only log. Searchable. Diffable. Yours.
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
packages/cli      # `garu run`, `garu log`, `garu validate`
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
```

Providers today: `gemini/*` and `anthropic/*`. Local models via Ollama are next.

## Develop

```sh
npm install
npm run typecheck
npm test
```

## License

Apache-2.0. Built by [Humberto Villanueva](https://humbertovillanueva.dev).
