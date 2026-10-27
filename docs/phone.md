*En español: [phone.es.md](phone.es.md)*

# Garu on your phone

The control room is a web app that installs to your home screen. Approve what an agent asks from wherever you are, watch a run live, check the spend. Nothing moves to a cloud: your phone talks to the same `garu ui` process on your computer, over a private connection.

## The private connection: Tailscale

The browser on the computer running Garu is trusted automatically. Any other device has to sign in with the control room's token, a key Garu makes on first start and keeps in `.garu/ui-token`. That token is the only thing standing between a stranger and your approve button, so the control room should still live on a network that is yours. [Tailscale](https://tailscale.com) gives every device you own a private address and makes them reachable from each other and nothing else. The free plan covers this.

1. Install Tailscale on the computer running Garu and on your phone, signed in to the same account.
2. On the computer, with `garu ui --up` running on its default host and port:

   ```sh
   tailscale serve --bg 4000
   ```

   Tailscale prints an address like `https://your-mac.tail1234.ts.net`. It carries a real HTTPS certificate and only your devices can resolve it.

3. On the computer, in the control room you already have open (localhost is fine), go to **Settings → Your phone & other devices** and press *Show pairing code*. Garu asks Tailscale for the address it is serving and points the code there.
4. Scan the code with your phone's camera. It opens the control room already signed in.

The code is a link that carries the token, which is why it should be scanned by you and nobody else. If you'd rather not scan (an iPhone, or an emulator with no camera), press *Copy link* there and paste it into the phone's sign-in screen. A phone stays signed in for a year; *Sign out* is on the same Settings panel. If the token ever leaks, stop Garu, delete `.garu/ui-token`, start it again, and every device has to sign in afresh.

`--bg` keeps it serving after you close the terminal; `tailscale serve off` stops it. The control room itself keeps listening on `127.0.0.1:4000`, so nothing on your local network can reach it directly.

To make the other half survive a reboot too, run `garu service install` in your Garu folder once: the control room and the schedules then start at login (and restart if they crash), with their output in `.garu/ui.log`. Stop the `garu ui` you had in a terminal first, since the service takes the port.

## Install it

**iPhone (Safari):** Share → *Add to Home Screen*. It opens full-screen with its own icon.

**Android (Chrome):** the menu offers *Install app*, or *Add to Home screen*.

**The apps.** The same control room also ships as an app. Android is in closed testing on Google Play: opt in at https://play.google.com/apps/testing/io.github.humbertovillanueva.garu, then install it from the store. The iPhone app runs in the Simulator today; a real device and TestFlight are on the roadmap. Both pair the same way, from their pairing screen.

HTTPS is what makes the install possible, which is one more reason to go through `tailscale serve` rather than binding Garu to another address.

**No Garu on a computer yet?** The app's pairing screen has a *Try the demo* button: a control room with made-up agents and mail, to look around and answer a sample ask. Nothing in it is real, and it can't run anything.

## Notifications

The phone app shows what is waiting when you open it. For a push when an agent pauses, run the control room with `--notify https://ntfy.sh/<your-topic>` and subscribe to the topic in the [ntfy](https://ntfy.sh) app. Each notification links back to the control room, so it's one tap from the lock screen to the review card.

## Without Tailscale

`garu ui --host 0.0.0.0` binds to every interface. Devices on the network can load the page but can't see or approve anything without the token. It is plain HTTP, so the token travels unencrypted on that network and the phone can't install the page as an app; use it only on a network you fully control, and prefer the setup above. `garu ui --require-login` makes even the local browser sign in, for a shared computer.
