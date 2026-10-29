# Garu on Android (the app)

`packages/app` is the control room as a native Android app. It is the same UI as
`garu ui`, built with `GARU_APP=1`, wrapped with [Capacitor](https://capacitorjs.com).
On first launch it asks you to pair with the Garu running on your computer; after
that it talks to that computer over your private network (see [phone.md](phone.md)
for Tailscale) using the control room's token.

Nothing goes through a cloud. The app stores the address and token of your control
room, and your display preferences, on the phone.

## What you need once

- [Android Studio](https://developer.android.com/studio) with the default SDK
  (the setup wizard installs it).
- Node 22+ and `npm install` at the repo root (installs Capacitor).

## Quickest look: install the built APK on an emulator

A debug build is produced from the repo (`packages/app/garu-debug.apk` when present,
or build one as below). In Android Studio open **Device Manager**, start a Pixel
emulator, and drag the `.apk` onto its window: it installs and appears in the app
drawer as Garu. Pair it by pasting the sign-in link (emulators have no real camera).

## Build and run

```sh
npm run sync -w @garu/app       # builds the UI for the app and syncs it into android/ (and ios/)
npm run open -w @garu/app       # opens the project in Android Studio
```

In Android Studio: pick a device (an emulator from *Device Manager*, or your phone
with USB debugging on) and press **Run**. The first Gradle build downloads
dependencies and takes a few minutes; later builds are fast.

To pair the running app: on your computer, Garu → **Settings → Your phone & other
devices → Show pairing code**, then in the app press **Scan the code**. No camera on an emulator?
Press *Copy link* on the computer and paste it into the app instead, or hand the
emulator the app link (the code with *Code is for* switched to the iPhone app; the
Android app answers it too, from the camera app or like this):

```sh
adb shell am start -a android.intent.action.VIEW -d 'garu://pair?base=https://your-mac.tail1234.ts.net\&token=…'
```

Changed the UI? Run `npm run sync -w @garu/app` again and press Run again.

## A release for Google Play

Play wants an app bundle (`.aab`) signed with an upload key you keep. Once:

```sh
keytool -genkeypair -v -keystore ~/garu-upload.jks -alias garu -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a password and your name; remember the password and back the file up somewhere that
isn't this repo (losing it means a support request to Google to reset the upload key). Then write
`packages/app/android/keystore.properties` (ignored by git):

```
storeFile=/Users/you/garu-upload.jks
storePassword=…
keyAlias=garu
keyPassword=…
```

Each upload needs a higher `versionCode` in `app/build.gradle` (1, 2, 3…; `versionName` follows
the repo's version). Then:

```sh
npm run sync -w @garu/app
cd packages/app/android && ./gradlew bundleRelease
```

The bundle lands at `app/build/outputs/bundle/release/app-release.aab`. Upload it in Play Console
under the testing track; Google signs what users install with its own key (Play App Signing), your
key only proves the upload came from you.

## How the pieces fit

- `capacitor.config.ts`: app id `io.github.humbertovillanueva.garu`, web assets from
  `packages/ui/dist-app`, served inside the app from `https://localhost`.
- The control room allows that origin for CORS (and `capacitor://localhost`,
  `http://localhost:*` for development) and accepts `Authorization: Bearer <token>`.
  Live updates use the same token on `/api/events?token=…`, because EventSource
  cannot send headers.
- `android/` is the generated native project, committed so the build is
  reproducible. `npm run assets -w @garu/app` regenerates icons and splash screens
  from `assets/` (made from `docs/brand/mark.svg`): `splash.png` is the light one,
  `splash-dark.png` the dark one, and the system splash color in `values/colors.xml`
  and `values-night/colors.xml` follows the phone's theme the same way.
- Camera permission is declared for the pairing scanner; the page uses the
  browser's `BarcodeDetector`, so no native plugin is involved.
- The manifest also claims the `garu://pair` scheme (the pairing code made for the
  iPhone app), so a camera app that reads it offers to open Garu; the page gets the
  link through Capacitor's `appUrlOpen` event, same as on iPhone.

## Not yet

- **Push notifications.** Real push needs Google's FCM, which needs a server that
  holds Firebase credentials. The app shows what is waiting when you open it; for a
  push today, run the control room with `--notify https://ntfy.sh/<topic>` and the
  ntfy app. A Garu relay for proper push is on the roadmap.
- **iOS.** Set up, and runs in the iOS Simulator: see [ios.md](ios.md).
- **Play Store, in production.** Build 4 has been on the closed-testing track since
  October 15 with the English and Spanish listings; anyone can opt in at
  https://play.google.com/apps/testing/io.github.humbertovillanueva.garu. The
  production application opens when the fourteen-day test ends; the notes for it
  are in [launch/play-store.md](launch/play-store.md).

## Installing a build without dragging

Dragging an `.apk` onto the emulator works but gives no feedback. From a
terminal on the Mac, with the emulator running:

```sh
~/Library/Android/sdk/platform-tools/adb install -r packages/app/garu-debug.apk
```

`Success` means it is on the device. `-r` replaces the installed copy and keeps
its data (the pairing). To check what is installed, open the app's **Settings →
This app**: it shows version · commit · build time, which should match the
latest commit on `main`. If the emulator is sluggish, give it more memory in
Device Manager (⋮ → Edit → Show Advanced Settings → RAM 4096 MB) or cold-boot it
(⋮ → Cold Boot Now).
