# Garu for your phone

The control room as a native app. It is the same Svelte UI as `garu ui`, built
with `GARU_APP=1`, wrapped with [Capacitor](https://capacitorjs.com). On first
launch it asks you to pair: scan the code from **Settings → Your phone** on the
computer running Garu, and from then on the app talks to that computer over your
private network (Tailscale) with the control room's token.

See [`docs/android.md`](../../docs/android.md) for building and running it.
