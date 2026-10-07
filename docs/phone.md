# Garu on your phone

The control room is a web app that installs to your home screen. Approve what an agent asks from wherever you are, watch a run live, check the spend. Nothing moves to a cloud: your phone talks to the same `garu ui` process on your computer, over a private connection.

## The private connection: Tailscale

Garu's control room has no login. It is meant to be reached only from localhost or from devices that are yours, so don't expose it on a LAN or the public internet. [Tailscale](https://tailscale.com) gives every device you own a private address and makes them reachable from each other and nothing else. The free plan covers this.

1. Install Tailscale on the computer running Garu and on your phone, signed in to the same account.
2. On the computer, with `garu ui --up` running on its default host and port:

   ```sh
   tailscale serve --bg 4000
   ```

   Tailscale prints an address like `https://your-mac.tail1234.ts.net`. It carries a real HTTPS certificate and only your devices can resolve it.

3. Open that address on your phone.

`--bg` keeps it serving after you close the terminal; `tailscale serve off` stops it. The control room itself keeps listening on `127.0.0.1:4000`, so nothing on your local network can reach it directly.

## Install it

**iPhone (Safari):** Share → *Add to Home Screen*. It opens full-screen with its own icon.

**Android (Chrome):** the menu offers *Install app*, or *Add to Home screen*.

HTTPS is what makes the install possible, which is one more reason to go through `tailscale serve` rather than binding Garu to another address.

## Notifications

The phone app shows what is waiting when you open it. For a push when an agent pauses, run the control room with `--notify https://ntfy.sh/<your-topic>` and subscribe to the topic in the [ntfy](https://ntfy.sh) app. Each notification links back to the control room, so it's one tap from the lock screen to the review card.

## Without Tailscale

`garu ui --host 0.0.0.0` binds to every interface and prints a warning, because anyone on the same network could then approve actions as you. Use it only on a network you fully control, and prefer the setup above.
