# Garu on iPhone (the app)

The same app as on Android: `packages/app`, the control room UI built with
`GARU_APP=1` and wrapped with [Capacitor](https://capacitorjs.com). The iPhone
project is `packages/app/ios`. It runs in the iOS Simulator today; a real iPhone,
TestFlight and the App Store come later (see *Not yet*).

Like the Android app, it talks straight to the Garu on your computer over your
private network (see [phone.md](phone.md) for Tailscale) and stores one thing on
the phone: your control room's address and token.

## What you need once

- Xcode, from the Mac App Store. Open it once so it installs the iOS simulator.
- Node 22+ and `npm install` at the repo root. The iPhone project uses Swift
  Package Manager and finds Capacitor's plugins in `node_modules`.

## Build and run

```sh
npm run sync -w @garu/app        # builds the UI for the app and copies it into android/ and ios/
npm run open:ios -w @garu/app    # opens the project in Xcode
```

In Xcode, pick an iPhone simulator at the top of the window and press **Run** (▶).
The first build fetches Capacitor's Swift packages and takes a few minutes.

To pair: an iPhone's web view can't scan codes, so the app asks for the link. On
your computer, Garu → **Settings → Your phone & other devices → Show pairing
code → Copy link**, then paste it into the app. The Simulator shares your Mac's
clipboard (in the Simulator app: **Edit → Automatically Sync Pasteboard**). Once
pasted, the key in the link shows as dots, with the address under it.

Changed the UI? Run `npm run sync -w @garu/app` again and press Run again.

## How it differs from Android

- The app's own origin is `capacitor://localhost` (Android's is `https://localhost`);
  the control room already allows both.
- No QR scanner: WebKit has no `BarcodeDetector`, so the app shows only the paste
  field and the tour says so. A native scanner plugin would bring scanning back.
- iPhones zoom into any text box set under 16 px when it's tapped. `app.css` gives
  text boxes a 16 px floor on iOS only.

## Not yet

- **Keyboard.** With the keyboard open, the tab bar floats above it. Capacitor's
  Keyboard plugin can resize the page the way Android does.
- **A real iPhone.** Plug it in, pick it in Xcode, and sign with your Apple ID
  (target *App* → *Signing & Capabilities* → *Team*). Free signing stops working
  after 7 days; a paid developer account doesn't.
- **TestFlight and the App Store.** Apple Developer Program ($99 a year), then
  *Product → Archive* in Xcode and upload.
- **Push notifications.** Same as Android: they need a relay.
