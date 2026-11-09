# LinkedIn post — draft (2026-11-06)

Goes before the Android app is in the store; the post says so in one line. Links are in the body
because Humberto wants them there (LinkedIn shows a link post to fewer people; if reach matters more
than the click, move the two links to the first comment). Post on a weekday morning, Mountain time.
Before posting: check that garuagents.com and the demo answer, and that Tailscale is up on the Mac.

**What to attach.** One of these, not both (LinkedIn takes a video or images per post):

- The launch video, `docs/video/garu-v8-16x9.mp4` (45 s, on this Mac). The feed autoplays it muted,
  which that cut was made for. Its music is the synthesized score from `tools/score.py`, and that is
  what sounds like every other generated video; see "Audio" below before using it.
- Four images, in this order: `docs/launch/play/home.png`, `inbox.png`, `agent.png`, `cost.png`
  (the Play cards, 1080×1920, each with its caption).
- Or the three desktop shots of the demo control room in `docs/launch/linkedin/`, same width, in
  this order: `control-room-home.jpg` (an ask from Bea with the email in it, and under it Garu
  suggesting a rule after three approvals), `control-room-runs.jpg` (a day of runs, each with what
  it said), `control-room-cost.jpg` (two weeks for three cents). Don't mix the phone cards and the
  desktop shots in one post; the grid crops whichever shape is in the minority.

## The post

Five weeks ago I started building something because I couldn't answer a question: if an AI agent
ran all day on my laptop while I wasn't looking, what exactly would I let it touch?

I didn't have a good answer. So I built the thing that makes me write one down.

It's called Garu. Each agent is one YAML file: who it is, when it runs, which tools it gets, and a
list of rules. Allow, ask, block. By tool, and by what it's about to do with it. A tool the rules
would always block is never even shown to the agent, so it can't try.

When it hits an "ask", it stops, and the question shows up on my phone with the actual thing in it:
the email it wants to draft, to whom, the text. One tap. If I don't answer in 30 minutes, that's a no.

Two of them run on my real life every weekday. Tomay reads my calendar at 7 and writes me the day.
Bea goes through my Gmail at 8, files everything into four labels and drafts replies to the ones that
need one. Neither can send email. Not "isn't allowed to". Can't: the Gmail tool they get has no send
in it.

It runs on whatever model you point it at. Mine run on Gemini's free tier, so they cost me nothing;
Garu still shows what each run would cost at list price, and it's about a cent a day. You can point
an agent at Claude instead. Or at a model running on your own machine with Ollama, and then nothing
leaves your computer at all, not even the question.

Things I didn't expect: my laptop goes to sleep after a minute idle, so a good part of the work went
into agents that survive a nap.

Everything is files on your own computer. No cloud, no account, no database. Open source, Apache-2.0.

The phone app is coming soon. It's the control room in your pocket: the asks land there, you
approve or decline with a tap, and you can see every run and what it cost from wherever you are.
It's in closed testing on Android right now, and it speaks Spanish too. The runtime and the desktop
control room are on GitHub today.

Site, with a demo you can click through: https://garuagents.com
Code: https://github.com/humbertovillanueva/garu

If you've ever wanted an agent to do something for you but didn't want to find out the hard way what
it would do: where's your line? What would you never let it do?

## Short version

I built Garu: open-source agents that run all day on your own computer, with a list of rules in
front of every tool. Allow, ask, block. The asks land on my phone. Every run is recorded and has a
price on it. Any model: mine run on Gemini's free tier for nothing, or use Claude, or a local model
with Ollama so nothing leaves your machine. Mine read my calendar and sort my inbox every morning,
and neither can send an email.
Site https://garuagents.com, code https://github.com/humbertovillanueva/garu. What would you never
let an agent do?

## En español

Hace cinco semanas empecé a construir algo porque no podía responder una pregunta: si un agente de
IA corriera todo el día en mi laptop mientras no estoy mirando, ¿qué exactamente le dejaría tocar?

No tenía una buena respuesta. Así que construí la cosa que me obliga a escribirla.

Se llama Garu. Cada agente es un archivo YAML: quién es, cuándo corre, qué herramientas recibe y una
lista de reglas. Permitir, preguntar, bloquear. Por herramienta, y por lo que está a punto de hacer
con ella. Una herramienta que las reglas siempre bloquearían ni siquiera se le muestra al agente, así
que no puede intentarlo.

Cuando llega a un "preguntar", se detiene, y la pregunta aparece en mi teléfono con la cosa real
adentro: el correo que quiere redactar, para quién, el texto. Un toque. Si no respondo en 30
minutos, es un no.

Dos de ellos corren sobre mi vida real cada día entre semana. Tomay lee mi calendario a las 7 y me
escribe el día. Bea revisa mi Gmail a las 8, archiva todo en cuatro etiquetas y redacta respuestas
para los que la necesitan. Ninguno puede enviar correos. No es que "no tenga permiso". No puede: la
herramienta de Gmail que reciben no tiene "enviar".

Corre con el modelo que tú le apuntes. Los míos corren en la capa gratuita de Gemini, así que no me
cuestan nada; Garu igual muestra lo que costaría cada corrida a precio de lista, y es como un centavo
al día. Puedes apuntar un agente a Claude. O a un modelo corriendo en tu propia máquina con Ollama, y
entonces nada sale de tu computadora, ni siquiera la pregunta.

Cosas que no esperaba: mi laptop se duerme después de un minuto sin uso, así que buena parte del
trabajo se fue en agentes que sobreviven una siesta.

Todo son archivos en tu propia computadora. Sin nube, sin cuenta, sin base de datos. Código
abierto, Apache-2.0.

La app para el teléfono viene pronto. Es la sala de control en tu bolsillo: ahí llegan las
preguntas, apruebas o rechazas con un toque, y ves cada corrida y lo que costó desde donde estés.
Está en prueba cerrada en Android ahora mismo, y también habla español. El runtime y la sala de
control de escritorio están en GitHub hoy.

Sitio, con una demo para recorrer: https://garuagents.com
Código: https://github.com/humbertovillanueva/garu

Si alguna vez quisiste que un agente hiciera algo por ti pero no querías descubrir por las malas qué
haría: ¿dónde está tu límite? ¿Qué nunca le dejarías hacer?

## Audio

The v8 score is synthesized by `docs/video/remotion/tools/score.py` (150 bpm, pad, kick, arp,
riser, impact) and it sounds like the music under every generated launch video. Three ways out, in
order of how human they sound:

1. Humberto's own voice over a much quieter bed. He reads the scene lines (they're in the video
   already) into the phone's recorder in a quiet room; the bed is the current pad with the drums and
   the arp off, at a quarter of the volume. One evening of work after the recording lands.
2. A real track with a licence that allows it (YouTube Audio Library, or a paid one from Epidemic or
   Artlist), cut to the scene plan. The scenes sit on bar lines at 150 bpm, so the track has to be
   re-timed or the scenes re-cut to its tempo; half a day.
3. A different synthesized score (slower, warmer, no riser, no impact). Fastest, still a machine.

The video stays as is until this is decided; the four-image post needs nothing.
