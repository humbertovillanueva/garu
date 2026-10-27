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

To pair a real iPhone: on your computer, Garu → **Settings → Your phone & other
devices → Show pairing code**, switch *Code is for* to **the iPhone app**, and
point the iPhone's camera at the code. The banner says *Open in Garu*; tap it and
the app opens, paired. That code is a `garu://pair?base=…&token=…` link, a scheme
only the app registers, which is how the camera knows to hand it over instead of
opening Safari (the plain code is an https link, and Safari is where the camera
sends those). The web view can't scan on its own, so the app has no scanner of
its own there.

The Simulator has no camera, so hand it the link instead. Either paste it: **Copy
link** on the computer, then into the app (the Simulator shares your Mac's
clipboard: in the Simulator app, **Edit → Automatically Sync Pasteboard**; the key
shows as dots once pasted, with the address under it). Or open the app link
headlessly, which is also how the handler is tested:

```sh
xcrun simctl openurl booted 'garu://pair?base=https://your-mac.tail1234.ts.net&token=…'
```

It works with the app closed (the link starts it) and with it open. Use a token
you don't mind in your shell history, not the one in `.garu/ui-token`.

Changed the UI? Run `npm run sync -w @garu/app` again and press Run again.

## How it differs from Android

- The app's own origin is `capacitor://localhost` (Android's is `https://localhost`);
  the control room already allows both.
- No QR scanner: WebKit has no `BarcodeDetector`, so the app shows only the paste
  field and the tour says to use the phone's camera on the app code instead. The
  `garu` scheme is in `Info.plist` (`CFBundleURLTypes`); Capacitor's App plugin
  delivers the link to the page as `appUrlOpen`, and `lib/native.ts` hands it to
  the pairing action. The link never reaches the page's address bar or a log.
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
