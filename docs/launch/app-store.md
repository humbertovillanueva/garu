# App Store listing — draft (2026-11-01)

Everything App Store Connect asks for, ready to paste, in the order it comes up.
Same honest tone as the Play listing (`play-store.md`): the app is a companion to
software you run yourself; it is not a cloud service. The text below is the Play
text where the fields match, so the two stores say the same thing.

## What Apple needs that Google didn't

- **No closed test, no tester count, no 14 days.** Apple's review is a person
  opening the app, usually within a day or two of submitting.
- **The Apple Developer Program**, $99 a year, Individual, at
  https://developer.apple.com/programs/enroll/ with the Apple ID the Mac and the
  iPhone use. Identity check through the Apple Developer app; active in a day or
  two. Nothing below works before it is active: not a real iPhone past 7 days,
  not TestFlight, not App Store Connect.
- **A real iPhone.** Everything so far ran in the Simulator, which does not draw
  the launch image (`ios.md`); the first run on the phone checks it, and pairs
  by pointing the camera at the code on the Mac.

## Account and app setup

- Bundle id: `io.github.humbertovillanueva.garu` (same as Android; Xcode
  registers it with the team on first signed build).
- App Store Connect → My Apps → + → New App: iOS, name **Garu**, primary
  language English (U.S.), bundle id above, SKU `garu-ios`.
- iPhone only: `TARGETED_DEVICE_FAMILY = 1` in the Xcode project since
  2026-11-01, so Apple asks for no iPad screenshots of a stretched phone layout.
  (An iPhone app still installs on iPads, in a phone-sized window.)
- Version `0.1.0`, build `1` (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`
  in `packages/app/ios/App/App.xcodeproj/project.pbxproj`); the build number
  goes up by one per upload, like Android's `versionCode`.
- Export compliance: the app only talks HTTPS, so `ITSAppUsesNonExemptEncryption`
  is `false` in `Info.plist` and no upload asks the encryption question.
- Category: Productivity; secondary Developer Tools. Free, no in-app purchases,
  no ads.
- Copyright: `2026 Humberto Villanueva`.
- Age rating: the questionnaire (no violence, gambling, user-generated content,
  medical or contests; no unrestricted web access) comes out **4+**. Play's
  "18+" was a target audience, not a content rating; Apple has no such field.

## Product page

Limits: name 30, subtitle 30, promotional text 170, keywords 100, description
4000. Promotional text can change without a new version; the rest ships with
each version.

**Name:** Garu

**Subtitle (30):**

> Your agents, in your pocket

**Promotional text (170):**

> Approve what your agents want to do, watch their runs and see what each one
> cost, from your phone. No cloud, no account: it talks to the Garu you run.

**Keywords (100, comma-separated, no spaces after commas, not repeating the name):**

> ai agents,agent,automation,mcp,approve,control room,open source,self-hosted,policy,ollama,gemini

**Description (4000):** the Play full description, word for word
(`play-store.md`, "Store listing text"). Apple shows it as plain text: keep the
`•` bullets and the capitalized headings, no Markdown.

**Support URL:** `https://garuagents.com/` · **Marketing URL:** the same ·
**Privacy policy URL:** `https://garuagents.com/privacy.html`

### Spanish (Mexico)

Apple's localization list has Spanish (Mexico) and Spanish (Spain); Mexico is
the match for Play's es-419. The app follows the phone's language.

**Subtitle:**

> Tus agentes, en tu bolsillo

**Promotional text:**

> Aprueba lo que tus agentes quieren hacer, mira sus ejecuciones y ve cuánto
> costó cada una, desde tu teléfono. Sin nube ni cuenta: habla con el Garu que
> tú ejecutas.

**Keywords:**

> agentes,agente ia,automatización,mcp,aprobar,sala de control,código abierto,política,ollama

**Description:** the Spanish Play description, word for word.

## Screenshots (ready in `docs/launch/app-store/`)

- `en/` and `es/`: six each, 1320×2868 (the 6.9-inch iPhone size; App Store
  Connect scales it for every smaller iPhone), in this order: `home.png`,
  `inbox.png`, `agent.png`, `agents.png`, `cost.png`, `pair.png`. Made
  2026-11-01 with `scripts/play-shots.mjs --frame ios`, the same script and
  captions as the Play set: the phone build in a browser paired to the demo,
  reseeded first, shot as an iPhone web view (no scanner, so the pairing screen
  says to use the camera, as it does on the phone) and framed under its caption.
  Retake after any big UI change.
- Upload them under the 6.9" slot of each localization. No iPad set (iPhone only).
- App icon: Xcode takes it from `Assets.xcassets/AppIcon` (1024×1024 from
  `packages/app/assets/icon-only.png` through `npm run assets -w @garu/app`).
  App Store Connect reads it from the uploaded build; nothing to upload there.

## App Privacy

- Data collection: **Data Not Collected.** The app stores one thing, the
  address and token of the user's own control room, on the device, and sends it
  only to that computer. Local storage is not collection under Apple's
  definitions either, same answer as Play's data safety form.
- The camera permission string is in `Info.plist` already ("Garu uses the camera
  to pair this phone by scanning the code shown on your computer."); on iPhone
  the app does not scan itself, but the string stays so the build never fails
  review for a missing purpose string.

## App Review Information

- Sign-in required: **No.** No accounts exist.
- Contact: Humberto Villanueva, support@garuagents.com, and a phone number
  (Apple requires one; it is not shown publicly).
- Notes (the Play sign-in instructions, Apple's box takes 4000):

> Garu is the companion app for open-source software the user runs on their own
> computer (github.com/humbertovillanueva/garu). It has no accounts and no
> server of ours, so there are no credentials to provide. To review every screen
> without a computer, open the app and tap "Try the demo" on the first screen:
> it connects to a public demo with made-up agents and data, in the phone's
> language (English or Spanish), where you can approve or decline a sample
> request, open an agent, read its rules and chat with it. With a real
> computer, the app pairs by pointing the camera at a code shown there; the
> camera permission exists for that and nothing is stored or sent. The app talks
> only to the computer it is paired with, over the user's private network.

This is the paragraph that matters most. Apple rejects apps a reviewer cannot
use (guideline 2.1, app completeness, and 4.2, minimum functionality) and a
companion app with no computer is exactly that case; the demo button is the
answer, and the note has to point at it.

## Release checklist (once the account is active)

1. Xcode → target *App* → *Signing & Capabilities* → Team: the paid team,
   automatic signing. Run once on the real iPhone (plugged in, chosen at the
   top): check the launch image and pair by camera.
2. `npm run sync -w @garu/app`, then Product → Archive with *Any iOS Device*
   selected, then Distribute App → App Store Connect → Upload. Processing takes
   about ten minutes; App Store Connect emails when the build is ready.
3. TestFlight tab → the build → add Humberto as an internal tester (no review
   for internal testers; up to 100). Install through the TestFlight app on the
   iPhone. Family on iPhones can be added the same way if wanted; nothing
   requires it.
4. App Store tab → version 0.1.0: screenshots, the product page above, the
   build, App Privacy, age rating, review information. Set the release to
   **Manually release this version**, so approval and the launch day stay apart.
5. Submit for review. Typically one to two days; the answer comes by email.
6. On approval: Release this version. Then the README and the site say "on the
   App Store" beside Google Play, and the launch posts drop "runs in the
   Simulator today".

## Not yet

- Push notifications (same as Android: a relay).
- TestFlight external testing (public link; a short review of its own).
