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
- Privacy policy URL: `https://humbertovillanueva.github.io/garu/privacy.html`
- Contact email: the one on the developer account (shown publicly)
- Website: `https://humbertovillanueva.github.io/garu/`

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
> • Garu installed on a computer: `npx garu new` to make your first agent, then
>   `garu ui --up`. The website has a five-minute start.
> • A private connection between that computer and your phone. Tailscale's
>   free plan works well and is what the guide uses.
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
> Source, docs and guides: github.com/humbertovillanueva/garu

## Graphics

- App icon: 512×512 PNG, no transparency → `packages/app/assets/icon-only.png`
  (regenerate at 512 if the console complains about size).
- Feature graphic: 1024×500 PNG. Dark background, mark on the left, line
  "Your always-on agents, in your pocket." — to make.
- Phone screenshots: at least 2, 16:9 or 9:16, 320–3840 px. Take from the
  emulator (Pixel 8, dark): Home with a decision waiting, a review card, an
  agent's conversation, the Cost page, the pairing screen. Add a one-line
  caption on each in the brand style — to make.

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

1. `npm run sync -w @garu/app`, then in Android Studio: Build → Generate Signed
   App Bundle. Create an upload key once; **back the keystore up** — losing it
   means losing the ability to update the app.
2. Play Console → Testing → Closed testing → new release → upload the `.aab`.
   Add the testers' emails as a list; share the opt-in link.
3. Fill the listing, data safety, content rating, target audience (18+ or
   13+; not for children).
4. After 14 days with ≥12 testers, apply for production access, then promote.

## Version naming

`versionName` follows the repo (`0.1.0`), `versionCode` increments by 1 per
upload; both in `packages/app/android/app/build.gradle`.
