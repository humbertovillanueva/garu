# The public demo

A control room anyone can look at, with made-up agents and mail, so the phone app can be tried
before Garu is on a computer, and so an app reviewer has something to open. The app's pairing
screen has a **Try the demo** button that pairs with it in one tap.

## What it is

- A second copy of Garu on Humberto's Mac, in `~/garu-demo`: the repo's `agents/`, `examples/`,
  `scripts/` and `package.json` copied, `packages/` and `node_modules/` symlinked, no `.env`.
- Seeded by `scripts/demo-data.mjs`: real agents and rules, invented people, meetings and emails
  (example.com), a decision waiting from Bea, runs to replay, a learned-rule suggestion, chat.
- Run with `garu ui --demo` (installed as a login service with `garu service install --demo`):
  schedules off, and the control room refuses to run an agent, chat, edit a Garufile or rotate
  its key. Approving or declining the sample asks works; that is the point of the demo.
- Put back every twenty minutes by `~/garu-demo/reseed.sh` (launchd job
  `io.github.humbertovillanueva.garu-demo-reseed`): wipes runs, inbox, chat and grants, seeds
  again. The sign-in token is kept, so the published link keeps working.
- Reached from the internet through Tailscale Funnel on port 8443 of the Mac's tailnet address,
  which is public by design and serves only this port. The app finds the address and the demo's
  token in `https://garuagents.com/demo.json` (`docs/demo.json` in this repo, with a CORS header
  from `docs/vercel.json`), so the demo can move without an app update.

The demo contains nothing real. Its token being public is intended: anyone with the app can tap
Try the demo. The real control room on port 4000 is untouched and stays tailnet-only.

## Day to day

```
cd ~/garu-demo && npm run garu -- service status|logs|restart|uninstall   # the demo service
~/garu-demo/reseed.sh                                                     # put the data back now
tailscale funnel status                                                   # the public address
```

After `npm run build` in the repo, restart the demo too (`service restart` from `~/garu-demo`):
it runs the repo's `packages/` through the symlink. A new sign-in token
(`rm ~/garu-demo/.garu/ui-token` and restart) needs `docs/demo.json` updated and the site pushed.

The demo runs only while the Mac is on, like Garu itself. The app says "The demo isn't reachable
right now" when it is off.
