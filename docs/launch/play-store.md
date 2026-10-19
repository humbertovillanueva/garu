# Google Play listing — draft

Everything the Play Console asks for, ready to paste. Keep the honest tone: the
app is a companion to software you run yourself; it is not a cloud service.

## Account and app setup

- Developer account: personal, one-time $25. Google requires new personal
  accounts to run a **closed test with at least 12 testers for 14 days** before
  the app can go to production. Line up a dozen friends with Android phones
  before creating the release; the clock starts when they opt in.
- App name: **Garu**
- Package name: `io.github.humbertovillanueva.garu` (set; cannot change later)
- Default language: English (United States)
- App or game: App · Free · Category: **Productivity** (alt: Tools)
- Contains ads: No · In-app purchases: No
- Privacy policy URL: `https://garuagents.com/privacy.html`
- Contact email: `support@garuagents.com`, a Namecheap forwarder to Humberto's Gmail (2026-10-14).
  Also in `packages/ui/src/lib/support.ts`, which puts an "Email support" link on the Help and About
  screens. Shown publicly.
- Website: `https://garuagents.com/`

## Store listing text

**Short description (80 chars max):**

> Your always-on agents, in your pocket. Approve, watch, and talk to them.

**Full description (4000 chars max):**

> Garu runs agents around the clock on your own computer, and every action they
> take goes through a policy you wrote: allow, ask, or block. This app is the
> control room for your phone.
>
> When an agent wants to do something your policy marks as "ask" — post a
> message, create an issue, write a file — it pauses and the request shows up
> here as a review card you can read and approve or decline, with a note the
> agent will see. Watch a run live, turn by turn. Chat with an agent. See what
> every run cost, to the fraction of a cent.
>
> HOW IT WORKS
>
> Garu is open source (Apache-2.0) and runs on your laptop or server with any
> model, including free and local ones. The app pairs with it by scanning a code
> and then talks to that computer directly over your private network (for
> example Tailscale). There is no Garu cloud, no account, and nothing is
> collected: the only thing the app stores is the address and key of your own
> control room.
>
> WHAT YOU NEED
>
> • Garu installed on a computer. The website has a five-minute start.
> • A private connection between that computer and your phone. Tailscale's
>   free plan works well and is what the guide uses.
> • No computer yet? Tap "Try the demo" on the first screen: a sample control
>   room with made-up agents and data, in your language. It is the one thing
>   the app reaches that isn't yours, and it stores nothing about you.
>
> WHY GARU
>
> An agent that runs all night with access to your files and accounts should be
> able to answer three questions: what exactly can it touch, who decided, and
> where is the record? Garu's policy engine sits between the model and every
> tool, so the model can't talk its way past it. Every run is written to a
> flight recorder you can replay. Every run has a cost cap. Tool servers can run
> in a sandbox with the network off. Approvals teach the policy over time, so
> "ask" gets rarer as your agents earn trust.
>
> Everyone else is building the agent. Garu is the thing you can trust to run it.
>
> Website and guides: garuagents.com · Source: github.com/humbertovillanueva/garu

## Store listing text, Spanish (es-419 / es-ES)

The app follows the phone's language (English or Spanish) and Settings can pin one.

**Short description (80 chars max):**

> Tus agentes siempre activos, en tu bolsillo. Aprueba, mira y habla con ellos.

**Full description:**

> Garu ejecuta agentes de IA las veinticuatro horas en tu propia computadora, y
> cada acción que hacen pasa por una política que tú escribiste: permitir,
> preguntar o bloquear. Esta app es la sala de control para tu teléfono.
>
> Cuando un agente quiere hacer algo que tu política marca como "preguntar"
> (publicar un mensaje, crear un borrador, escribir un archivo), se detiene y la
> solicitud aparece aquí como una tarjeta que puedes leer y aprobar o rechazar,
> con una nota que el agente verá. Mira una ejecución en vivo, turno por turno.
> Conversa con un agente. Ve cuánto costó cada ejecución, hasta la fracción de
> centavo.
>
> CÓMO FUNCIONA
>
> Garu es de código abierto (Apache-2.0) y corre en tu laptop o servidor con
> cualquier modelo, incluidos los gratuitos y los locales. La app se empareja
> con él escaneando un código y después habla directamente con esa computadora
> por tu red privada (por ejemplo, Tailscale). No hay nube de Garu, ni cuenta,
> ni se recopila nada: lo único que la app guarda es la dirección y la clave de
> tu propia sala de control.
>
> QUÉ NECESITAS
>
> • Garu instalado en una computadora. El sitio web explica cómo empezar en
>   cinco minutos.
> • Una conexión privada entre esa computadora y tu teléfono. El plan gratuito
>   de Tailscale funciona bien y es el que usa la guía.
> • ¿Todavía no tienes computadora? Toca "Probar la demo" en la primera
>   pantalla: una sala de control de muestra con agentes y datos inventados,
>   en tu idioma. Es lo único que la app toca que no es tuyo, y no guarda nada
>   sobre ti.
>
> POR QUÉ GARU
>
> Un agente que trabaja toda la noche con acceso a tus archivos y cuentas
> debería poder responder tres preguntas: qué puede tocar exactamente, quién lo
> decidió y dónde está el registro. El motor de políticas de Garu está entre el
> modelo y cada herramienta, así que el modelo no puede convencerlo de nada. Cada
> ejecución queda grabada y se puede repasar paso a paso. Cada ejecución tiene un
> tope de gasto. Las aprobaciones le enseñan a la política con el tiempo, así que
> "preguntar" se vuelve cada vez menos frecuente a medida que tus agentes se
> ganan tu confianza.
>
> Todos los demás están construyendo el agente. Garu es lo que te permite
> confiar en ejecutarlo.
>
> Sitio web y guías: garuagents.com · Código: github.com/humbertovillanueva/garu

## Sign in details (was "App access")

Declared as restricted, one entry, "No login (companion app)", username and
password "none", with these instructions (500 characters max, English), updated
2026-10-18 for the demo button:

> Garu is the companion app for open-source software the user runs on their own
> computer (github.com/humbertovillanueva/garu). It has no accounts and no
> server of ours, so there are no credentials to provide. To review every screen
> without a computer, open the app and tap "Try the demo" on the first screen:
> it connects to a public demo with made-up agents and data, in the phone's
> language (English or Spanish). With a real computer, the app pairs by scanning
> a code shown there.

## Graphics (ready in `docs/launch/play/`)

- App icon: `icon-512.png` (512×512, opaque).
- Feature graphic: `feature-graphic.png` (1024×500).
- Phone screenshots, 1080×1920 with captions, in this order: `home.png`,
  `inbox.png`, `agent.png`, `agents.png`, `cost.png`, `pair.png`. Made 2026-10-12
  from the demo data (`scripts/demo-data.mjs`) by capturing each screen at phone
  size from the demo control room and framing it with its caption; retake after
  any big UI change.
- The Spanish set, same six screens and captions in Spanish, is `es/` beside
  them, made 2026-10-19 with `scripts/play-shots.mjs`: the phone build in a
  browser (`GARU_APP=1 npm run dev -w @garu/ui -- --port 5174`) paired to the
  Spanish demo, reseeded first so the inbox has a fresh ask, each screen shot at
  390×844 at 3× and framed at 1080×1920. The script takes `--lang en` too, so
  both sets come from the same place next time.

## Data safety form (answers)

- Does your app collect or share any of the required user data types? **No.**
  (The app stores a server address and token locally; neither leaves the device
  except to that server, which the user runs. Local-only storage is not
  "collection" under Play's definitions.)
- Is all of the user data collected by your app encrypted in transit? N/A (no
  collection); note that traffic to the user's own server is HTTPS over Tailscale.
- Do you provide a way for users to request that their data is deleted? N/A;
  "Forget it" in Settings removes the stored pairing.
- Camera: declared permission, used only for scanning the pairing code;
  no images are stored or transmitted. Expect a permissions declaration question
  if the console flags CAMERA — answer "core functionality: pairing by QR code".

## Content rating questionnaire

Utility/productivity app, no user-generated content shared between users, no
violence, no gambling, no personal information collected → expect **Everyone**.

## Release checklist

1. Make the upload key once and build the bundle: `docs/android.md`, "A release
   for Google Play" (keytool, `keystore.properties`, `./gradlew bundleRelease`).
   **Back the keystore up**; losing it means a support request to reset it.
2. Play Console → Testing → Closed testing → new release → upload the `.aab`.
   Add the testers' emails as a list; share the opt-in link.
3. Fill the listing, data safety, content rating, target audience (18+ or
   13+; not for children).
4. After 14 days with ≥12 testers continuously opted in (if one drops out before
   day 14, the count restarts), apply for production access on the dashboard,
   then promote the release.

## Before the first upload (status 2026-10-14)

Done in the app: a crash screen instead of a blank page, dark and light themes
(follows the phone, or pinned in Settings), an accessibility pass (screen-reader
announcements, names, focus, 44 px targets, reduced motion), release signing
wired in Gradle, no cloud backup of the pairing token, the privacy page matching
what the app stores. Done on Humberto's side: the developer account (identity
verified 2026-10-14), the app created in the console with its content
declarations (sign-in details, ads, content rating Everyone, 18+, data safety
"no data collected"), the support alias (support@garuagents.com), the upload
key and the signed bundle (`app-release.aab`, versionCode 1), and the store
listing as a draft in English and Spanish (Latin America) with the icon, the
feature graphic and the six screenshots. Still to do: the closed-testing track,
twelve testers with Android phones, then upload the bundle.

## The closed test (status 2026-10-15)

Build 4 (versionCode 4, with the Try-the-demo button) is published on the
closed-testing track "Alpha" for 178 countries; the listing, the declarations
and the earlier builds went through review the same day. The tester list is an
email list called "Garu Testers" (family and friends, 14 addresses) with
feedback to support@garuagents.com; both were submitted for review on
2026-10-15. Testers join at
https://play.google.com/apps/testing/io.github.humbertovillanueva.garu, signed in
to the Google account on the list, and install from the Play Store afterwards.
Only Google accounts count, one per person: a second address for the same
person adds nothing to the twelve. Addresses can be added anytime (Testers →
the list → Save; adding to a list needs no review). The dashboard shows the
opted-in count, never the names, and installs reach Statistics a day or two
late. The twelfth tester opted in on 2026-10-16, so the fourteen days end on
2026-10-30 if nobody leaves; the list has 15 addresses as a margin. Then
"Apply for production" on the dashboard: Google asks about the test (how
feedback came in, what changed because of it), so keep notes of both.

## Version naming

`versionName` follows the repo (`0.1.0`), `versionCode` increments by 1 per
upload; both in `packages/app/android/app/build.gradle`.
