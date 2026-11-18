# The video, posted — drafts (2026-11-17)

Nothing here is posted. These are the words that go with the v10 launch video on each channel,
ready to paste once Humberto says so. The files are in `docs/video/`:

| Channel | File | Notes |
|---|---|---|
| YouTube (the main upload) | `garu-v10-16x9.mp4` | 45 s, 1920×1080, with the score. Unlisted first, then public with the posts. |
| YouTube Shorts, Instagram Reels, TikTok | `garu-v10-9x16.mp4` | 45 s, 1080×1920. Nothing readable sits under their buttons. |
| Reels and X, the short one | `garu-v10-15s-9x16.mp4` | 15 s: hook, control, ask, end card. |
| X, LinkedIn (in the post itself) | `garu-v10-16x9.mp4` | Feeds autoplay muted; the cut reads without sound. |
| Thumbnail | `garu-v10-16x9-poster.jpg`, `garu-v10-9x16-poster.jpg` | The first held frame: the headline and the night clock. |

Before posting anything: garuagents.com and the demo answer, Tailscale is up on the Mac, and the
Play listing is where the post says it is (the app is still in closed testing until Play approves it;
the posts below say "on Android soon", change that line the day it is live).

The video says what the app says: nothing goes out without your OK, and Bea can't send email because
Garu gives her no send tool. Keep that claim in the captions; it is the one line people repeat.

## YouTube

**Title (under 70 characters):** Garu: AI agents that work while you sleep, and ask before they act

**Description:**

AI agents can work while you sleep. But would you trust one?

Garu runs agents on your own computer, on your schedule, by your rules. Each agent is one YAML
file. Every tool call goes through a policy you wrote: allow, ask, or block. The asks land in an
inbox on your phone, you can edit what the agent wrote before approving it, and nothing goes out
without your OK. Say yes to the same thing three times and Garu suggests the rule.

In the video: Tomay reads your calendar and has your day ready when you wake up. Bea sorts your
inbox and drafts replies that wait for one tap, saved, never sent: she has no send tool.

Free and open source (Apache-2.0). Runs on your computer with Gemini, Claude, OpenAI or a local
model through Ollama. No account, no cloud, no database.

Site: https://garuagents.com
Code: https://github.com/humbertovillanueva/garu
Try the demo: https://garuagents.com (the "Try it in five minutes" button)
Android: on Google Play soon.

0:00 While you sleep
0:05 Meet the agents
0:10 Your day, ready
0:13 It only touches what you allow
0:19 Nothing goes out without your OK
0:26 It learns what you trust
0:30 Free, open source, your computer
0:38 Garu

The music is synthesized for the video; the meetings and emails on screen are examples.

**Tags:** AI agents, autonomous agents, MCP, open source, local AI, Gemini, Claude, Ollama,
automation, productivity, privacy, self-hosted

## Shorts, Reels, TikTok (the 45-second vertical, or the 15-second cut)

**Caption:**

AI agents can work while you sleep. But would you trust one?

Garu runs them on your own computer, by rules you wrote. Every action is allowed, asked, or
blocked. The asks come to your phone. Nothing goes out without your OK.

Free, open source, no cloud. garuagents.com

#AIagents #opensource #automation #productivity #localAI #MCP #privacy #indiedev #buildinpublic

**Pinned comment:** Site and code in the bio. The email agent in the video has no send tool: it
can only draft, and a draft waits for your tap.

## X

**The post with the video (16:9 or the 15-second cut):**

AI agents can work while you sleep. But would you trust one?

I built Garu so I could: agents on my own computer, every action allowed / asked / blocked by rules I
wrote, the asks on my phone. Nothing goes out without my OK.

Free, open source. garuagents.com

**The thread under it (one post each):**

1. Each agent is one YAML file: what it does, when it runs, which tools it gets, what it may do
   with them. Garu keeps it running on a schedule, on your machine. No account, no cloud.

2. The policy sits in front of every tool call. Allow, ask, or block, by tool and by argument. An
   ask goes to the inbox on your phone; you can edit what the agent wrote before approving it.

3. Bea, the inbox agent in the video, can't send email. Not "won't": Garu gives her no send tool.
   She drafts, the draft waits in Gmail, you decide.

4. Say yes to the same thing three times and Garu suggests the rule, scoped to what you actually
   approved. Add it or not.

5. Gemini (free tier), Claude, OpenAI or any compatible API, or a local model through Ollama for
   $0, offline. Code and docs: github.com/humbertovillanueva/garu

## LinkedIn

The LinkedIn post is its own draft in `linkedin.md`; attach `garu-v10-16x9.mp4` to it. Its "Audio"
section predates the v10 score and is kept there for the record.

---

# El video, publicado — borradores

Nada de esto está publicado. Son las palabras que acompañan al video v10 en cada canal, listas para
pegar cuando Humberto lo diga. Los archivos son los mismos de la tabla de arriba.

## YouTube

**Título:** Garu: agentes de IA que trabajan mientras duermes y preguntan antes de actuar

**Descripción:**

Los agentes de IA pueden trabajar mientras duermes. ¿Pero confiarías en uno?

Garu ejecuta agentes en tu propia computadora, con tu horario y tus reglas. Cada agente es un
archivo YAML. Cada llamada a una herramienta pasa por una política que escribiste tú: permitir,
preguntar o bloquear. Las preguntas llegan a una bandeja en tu teléfono, puedes editar lo que el
agente escribió antes de aprobarlo, y nada sale sin tu visto bueno. Di que sí a lo mismo tres veces
y Garu te sugiere la regla.

En el video: Tomay lee tu agenda y tiene tu día listo cuando despiertas. Bea ordena tu bandeja y
redacta respuestas que esperan un toque, guardadas, nunca enviadas: no tiene herramienta para
enviar.

Gratis y de código abierto (Apache-2.0). Corre en tu computadora con Gemini, Claude, OpenAI o un
modelo local con Ollama. Sin cuenta, sin nube, sin base de datos.

Sitio: https://garuagents.com/index.es.html
Código: https://github.com/humbertovillanueva/garu
Android: pronto en Google Play.

**Etiquetas:** agentes de IA, código abierto, IA local, Gemini, Claude, Ollama, automatización,
productividad, privacidad

## Shorts, Reels, TikTok

Los agentes de IA pueden trabajar mientras duermes. ¿Pero confiarías en uno?

Garu los ejecuta en tu propia computadora, con reglas que escribiste tú. Cada acción se permite,
se pregunta o se bloquea. Las preguntas llegan a tu teléfono. Nada sale sin tu visto bueno.

Gratis, código abierto, sin nube. garuagents.com

#agentesIA #codigoabierto #automatizacion #productividad #IAlocal #privacidad

## X

Los agentes de IA pueden trabajar mientras duermes. ¿Pero confiarías en uno?

Construí Garu para poder hacerlo: agentes en mi propia computadora, cada acción permitida,
preguntada o bloqueada por reglas que escribí yo, las preguntas en mi teléfono. Nada sale sin mi
visto bueno.

Gratis, código abierto. garuagents.com
