# LinkedIn post — draft (2026-11-06)

Goes before the Android app is in the store: the app is in closed testing until mid November, and
the post says so in one line instead of waiting for it. Attach the 16:9 video from this Mac
(`docs/video/garu-v8-16x9.mp4`, 2026-10-27; LinkedIn plays native video in the feed and
autoplays it muted, which this one was cut for) or, if the upload is a bother, the poster
`docs/video/garu-v8-16x9-poster.jpg`. Links in the first comment keep the post's reach; LinkedIn
shrinks a post with a link in the body. Post on a weekday morning, Mountain time.
Before posting: check that garuagents.com and the demo answer, and that Tailscale is up on the Mac.

## The post

A month ago I started building something I wanted for myself: agents that run all day on my own
computer, and that I can actually trust.

It's called Garu, and it's open source.

An agent is one YAML file. Garu keeps it running on a schedule, gives it tools, and puts a policy I
wrote in front of every single thing it does: allow, ask, or block, by tool and by argument. When
an agent wants to do something I marked "ask", it stops, and the question lands on my phone. I
approve or decline with a tap. Every run is recorded step by step, and every run has a price on it.

Two of my agents go through my real calendar and my real email every weekday morning. One writes
my day. The other files the mail and drafts replies. Neither of them can send anything, because the
tool they talk to has no "send". That's the part I care about most: safety that's in the rules,
not in the prompt.

No cloud, no account, no database. Everything is files on your machine.

It's five weeks old, it runs my own agents every day, and it's Apache-2.0. The phone app is in
closed testing on Google Play and should be in the store later this month. The runtime and the
control room work today.

If you run agents, or want to and haven't dared yet, I'd like to hear what you'd want one to do
for you, and what you'd never let it do.

Site and repo in the first comment.

## First comment

Site: https://garuagents.com (there's a demo you can click through on the home page)
Code: https://github.com/humbertovillanueva/garu
A longer write-up on the policy kernel: https://dev.to/ (link to "A Policy Kernel, Not a Prompt")

## Short version (if the long one feels like too much)

I built Garu: open-source, always-on agents that run on your own computer, where every tool call
goes through a policy you wrote. Allow, ask, or block. The asks land on your phone. Every run is
recorded and priced. No cloud, no account. Five weeks in, it runs my calendar and inbox agents
every morning. Site and code in the first comment.

## En español

Hace un mes empecé a construir algo que quería para mí: agentes que corren todo el día en mi propia
computadora, y en los que puedo confiar de verdad.

Se llama Garu y es de código abierto.

Un agente es un archivo YAML. Garu lo mantiene corriendo en un horario, le da herramientas y pone
una política que yo escribí delante de cada cosa que hace: permitir, preguntar o bloquear, por
herramienta y por argumento. Cuando un agente quiere hacer algo que marqué como "preguntar", se
detiene y la pregunta llega a mi teléfono. Apruebo o rechazo con un toque. Cada corrida queda
grabada paso a paso, y cada corrida tiene su precio.

Dos de mis agentes revisan mi calendario y mi correo reales cada mañana entre semana. Uno escribe
mi día. El otro archiva el correo y redacta respuestas. Ninguno puede enviar nada, porque la
herramienta con la que hablan no tiene "enviar". Esa es la parte que más me importa: la seguridad
está en las reglas, no en el prompt.

Sin nube, sin cuenta, sin base de datos. Todo son archivos en tu máquina.

Tiene cinco semanas, corre mis propios agentes todos los días y es Apache-2.0. La app para el
teléfono está en prueba cerrada en Google Play y debería estar en la tienda este mes. El runtime y
la sala de control funcionan hoy.

Si usas agentes, o quieres y no te has animado, me gustaría saber qué querrías que uno hiciera por
ti, y qué nunca le dejarías hacer.

Sitio y código en el primer comentario.
