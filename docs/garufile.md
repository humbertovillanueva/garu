*En español: [garufile.es.md](garufile.es.md)*

# The Garufile

One agent is one YAML file: what it does, when it runs, which tools it gets and what it may do with them. This page is written from the schema itself, so it says exactly what Garu accepts. An editor can check a file as you type: the schema is at https://garuagents.com/garufile.schema.json, and a Garufile points at it with this first line:

```yaml
# yaml-language-server: $schema=https://garuagents.com/garufile.schema.json
```

A `${VAR}` anywhere in `tools` is read from `.env` at run time, so keys never sit in the file.

## Top level

What every Garufile has. `name`, `model` and `prompt` are required; everything else has a default.

| Key | Type | Default | What it is |
|---|---|---|---|
| `name` | text | required | The agent's name: lowercase letters, digits and hyphens. It is what you call it, and its folder under agents/. |
| `description` | text | `""` | What it does, in one line; shown under its name. |
| `language` | text |  | What it writes to you in, as a code (es, pt-BR); it gets the date in that language too. Unset: English. |
| `memory` | true / false | `false` | A small notebook it keeps between runs (garu.remember and garu.forget, policed like any tool; you read and edit it on its page). |
| `paused` | true / false | `false` | Kept on the schedule but skipped, until you resume it. |
| `persona` | object |  | Its face and one line of character; what it may do is the policy. |
| `model` | text | required | provider/model, like gemini/gemini-2.5-flash-lite, anthropic/claude-haiku-4-5, openai/gpt-5-mini or ollama/qwen3:8b. |
| `prompt` | text | required | The job, as the model reads it. Garu adds the date, your name and the tools on its own. |
| `tools` | list | none | The MCP tool servers it may use: a command Garu runs, or a URL it connects to. Empty: it can only think and reply. |
| `triggers` | list | `[{"manual":true}]` | When it runs: a cron schedule, a webhook door, or only when told. |
| `policy` | list | `[{"tool":"*","action":"ask"}]` | The rules in front of every tool call, read top to bottom; the first match wins, and a call no rule matches asks you. |
| `maxTurns` | whole number | `25` | At most this many model turns in a run, so it can never loop forever. |
| `budget` | object | none | The money guard: a cap per run, a cap on runs a day, your own prices. |
| `modelOptions` | map | none | Knobs for the model: temperature, maxOutputTokens, thinkingBudget, and Ollama's own options as they are. A key a provider has no place for is left out. |
| `sandbox` | object |  | Run every tool server inside its own Docker container. Omit to run them on this computer; set (even {}) to contain them. |

## `persona`

Its face and one line of character. What it may do is the policy, not the persona.

| Key | Type | Default | What it is |
|---|---|---|---|
| `kind` | `owl` · `fox` · `turtle` · `bee` · `cat` · `octopus` · `rabbit` · `bear` · `frog` · `penguin` · `raccoon` · `whale` | required | Its face in the control room: owl (watcher), fox (messenger), turtle (keeper), bee (worker), cat (reader), octopus (planner), rabbit (runner), bear (guardian), frog (connector), penguin (organizer), raccoon (tinkerer), whale (deep reader). |
| `tagline` | text |  | One line of character, shown under its name. |

## `tools`: a server that runs on your computer

A program Garu starts (and can sandbox). With `auth: oauth`, Garu signs in for it once and hands it a short-lived access token at the start of each run; the server never sees the secret.

| Key | Type | Default | What it is |
|---|---|---|---|
| `name` | text | required | The server's name in rules and in the log: lowercase, digits, - or _. Tools are "<name>.<tool>". |
| `command` | text | required | The program that runs the MCP server (node, npx, python…). |
| `args` | list of text | none | Its arguments; ${VAR} reads a value from .env. |
| `env` | map | none | Environment variables for the server; ${VAR} reads a value from .env, so secrets never sit here. |
| `cwd` | text |  | The folder it starts in. |
| `auth` | `none` · `oauth` |  | oauth: Garu signs in for it once (garu auth, or the agent's page) and hands it a short-lived access token at the start of each run. |
| `oauth` | object |  | Your own OAuth client, for a server that does not hand one out. |

## `tools`: a server you connect to

A URL that speaks MCP over Streamable HTTP. Headers carry keys from `.env`; `auth: oauth` keeps the sign-in from `garu auth`. Nothing runs locally, so the sandbox does not apply.

| Key | Type | Default | What it is |
|---|---|---|---|
| `name` | text | required |  |
| `url` | text | required |  |
| `headers` | map | none | Static headers, like an API key as ${VAR} from .env. |
| `auth` | `none` · `oauth` | `"none"` | oauth: Garu signs in to it once (garu auth) and keeps the tokens. |
| `oauth` | object |  | Your own OAuth client, when the server needs one. |

## `oauth`

Your own OAuth client, for a server that does not hand one out (Google, for one). Values may be `${VAR}` from `.env`, so no secret sits in the file.

| Key | Type | Default | What it is |
|---|---|---|---|
| `clientId` | text | required | Your OAuth client id; ${VAR} reads it from .env. |
| `clientSecret` | text |  | Your OAuth client secret, as ${VAR} from .env; never written here. |
| `scopes` | list of text |  | The permissions the sign-in asks for (the scope). |
| `authorizationParams` | map | none | Extra sign-in parameters, like Google's access_type: offline so runs can refresh the token without you. |
| `issuer` | text |  | Who you sign in with, like https://accounts.google.com. A local server needs it; a remote one finds it on its own. |

## `triggers`: one of

When it runs. A trigger has one of these; an agent can have several.

| Key | Type | Default | What it is |
|---|---|---|---|
| `cron` | text |  | A schedule (minute hour day month weekday), in this computer's time zone; runs while the control room is up with --up or as the login service. |
| `webhook` | text |  | A door: POST /api/agents/<agent>/hooks/<name> on the control room starts a run, with the body's message as its input. |
| `manual` | true / false |  | Runs when told: Run now, a message, garu run. |

## `policy`: a rule

Rules are read top to bottom; the first whose tool glob and conditions match a call decides it. A call no rule matches asks you. A tool no rule can ever allow is not shown to the model.

| Key | Type | Default | What it is |
|---|---|---|---|
| `tool` | text | required | A glob over "<server>.<tool>": "gmail.send", "fs.*", "*". The first rule whose glob and conditions match a call decides it. |
| `action` | `allow` · `ask` · `block` | required | allow: the call goes through on its own. ask: it waits for your approval in the inbox. block: it is refused, and a tool no rule can ever allow is not shown to the model. |
| `when` | map |  | Conditions on the call's arguments, by dotted path ("to", "recipients.length"); every one must hold for the rule to match. |
| `reason` | text |  | Why, in your words: shown on the review card, in the log and in the push. |

## `when`: a condition

Keyed by a dotted path into the call's arguments (`to`, `recipients.length`); every condition must hold for the rule to match.

| Key | Type | Default | What it is |
|---|---|---|---|
| `eq` | any value |  | The argument equals this value (deep equality for lists and objects). |
| `neq` | any value |  | The argument differs from this value. |
| `gt` | number |  | The argument is a number greater than this. |
| `gte` | number |  | The argument is a number greater than or equal to this. |
| `lt` | number |  | The argument is a number less than this. |
| `lte` | number |  | The argument is a number less than or equal to this. |
| `matches` | text |  | The argument, as text, matches this regular expression (JavaScript syntax; no inline modifiers). |
| `ignoreCase` | true / false |  | For matches: upper and lower case count the same. |
| `in` | list of any value |  | The argument is one of these values. |
| `exists` | true / false |  | true: the argument is present; false: it is absent. |

## `budget`

The money guard. Every always-on agent should have a cap per run.

| Key | Type | Default | What it is |
|---|---|---|---|
| `maxCostUsd` | number |  | A run stops before its estimated cost crosses this many dollars. |
| `maxRunsPerDay` | whole number |  | At most this many runs a day, whatever starts them; a run the network cut off does not count. |
| `pricing` | object |  | Your own price for this model, in dollars per million tokens (both 0 on a free tier); otherwise Garu's table. |

## `budget.pricing`

| Key | Type | Default | What it is |
|---|---|---|---|
| `inputPerMTok` | number | required | Dollars per million input tokens. |
| `outputPerMTok` | number | required | Dollars per million output tokens. |

## `sandbox`

Set it (even to `{}`) to run every tool server inside its own Docker container. `garu sandbox build` makes the default image.

| Key | Type | Default | What it is |
|---|---|---|---|
| `image` | text | `"garu-sandbox"` | The Docker image with the tool servers in it; garu sandbox build makes the default one. |
| `network` | `none` · `bridge` | `"none"` | none: no network at all. bridge: normal outbound internet. |
| `workspace` | text |  | A folder on this computer mounted read-write at /workspace inside the container. |
| `mounts` | list | none | More folders to mount. |
| `memory` | text | `"512m"` | Memory for the container, like 512m or 2g. |
| `cpus` | number | `1` | CPUs for the container. |

## `sandbox.mounts`

| Key | Type | Default | What it is |
|---|---|---|---|
| `host` | text | required | A folder on this computer. |
| `container` | text | required | Where it appears inside the container (an absolute path). |
| `readonly` | true / false | `false` | Mount it read-only. |

`garu validate <Garufile>` lints a file; `garu try <agent> <server.tool>` says what its rules would do with a call; `garu new` writes one from a few questions, and so does "New agent" in the control room.
