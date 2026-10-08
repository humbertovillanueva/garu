# Garu on Android (the app)

`packages/app` is the control room as a native Android app. It is the same UI as
`garu ui`, built with `GARU_APP=1`, wrapped with [Capacitor](https://capacitorjs.com).
On first launch it asks you to pair with the Garu running on your computer; after
that it talks to that computer over your private network (see [phone.md](phone.md)
for Tailscale) using the control room's token.

Nothing goes through a cloud. The app stores one thing: the address and token of
your control room, on the phone.

## What you need once

- [Android Studio](https://developer.android.com/studio) with the default SDK
  (the setup wizard installs it).
- Node 22+ and `npm install` at the repo root (installs Capacitor).

## Build and run

```sh
npm run sync -w @garu/app       # builds the UI for the app and syncs it into android/
npm run open -w @garu/app       # opens the project in Android Studio
```

In Android Studio: pick a device (an emulator from *Device Manager*, or your phone
with USB debugging on) and press **Run**. The first Gradle build downloads
dependencies and takes a few minutes; later builds are fast.

To pair the running app: on your computer, Garu → **Settings → Your phone → Show
sign-in code**, then in the app press **Scan the code**. No camera on an emulator?
Press *Copy link* on the computer and paste it into the app instead.

Changed the UI? Run `npm run sync -w @garu/app` again and press Run again.

## How the pieces fit

- `capacitor.config.ts`: app id `io.github.humbertovillanueva.garu`, web assets from
  `packages/ui/dist-app`, served inside the app from `https://localhost`.
- The control room allows that origin for CORS (and `capacitor://localhost`,
  `http://localhost:*` for development) and accepts `Authorization: Bearer <token>`.
  Live updates use the same token on `/api/events?token=…`, because EventSource
  cannot send headers.
- `android/` is the generated native project, committed so the build is
  reproducible. `npm run assets -w @garu/app` regenerates icons and splash screens
  from `assets/` (made from `docs/brand/mark.svg`).
- Camera permission is declared for the pairing scanner; the page uses the
  browser's `BarcodeDetector`, so no native plugin is involved.

## Not yet

- **Push notifications.** Real push needs Google's FCM, which needs a server that
  holds Firebase credentials. The app shows what is waiting when you open it; for a
  push today, run the control room with `--notify https://ntfy.sh/<topic>` and the
  ntfy app. A Garu relay for proper push is on the roadmap.
- **iOS.** Same Capacitor project can target iOS with Xcode and an Apple developer
  account; not set up yet.
- **Play Store listing.** Needs a developer account, a privacy policy page, store
  graphics and the closed-testing period Google requires for new accounts.
