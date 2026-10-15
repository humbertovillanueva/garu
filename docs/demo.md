# The public demo

A control room anyone can look at, with made-up agents and mail, so the phone app can be tried
before Garu is on a computer, and so an app reviewer has something to open. The app's pairing
screen has a **Try the demo** button that pairs with it in one tap.

## What it is

- Two copies of Garu on Humberto's Mac: `~/garu-demo` (English) and `~/garu-demo-es` (Spanish),
  each with the repo's `agents/`, `examples/`, `scripts/` and `package.json` copied, `packages/` and
  `node_modules/` symlinked, no `.env`. In the Spanish copy every `Garufile.es.yaml` has been copied
  over its `Garufile.yaml`, so the agents describe themselves, reason and write in Spanish.
- Seeded by `scripts/demo-data.mjs` (`--lang=es` for the Spanish copy): real agents and rules,
  invented people, meetings and emails (example.com), a decision waiting from Bea, runs to replay, a
  learned-rule suggestion, chat. The mail, briefs and summaries exist in both languages in the script.
- Each runs `garu ui --demo` as its own login service (`garu service install --demo`, ports 4100
  and 4101):
  schedules off, and the control room refuses to run an agent, chat, edit a Garufile or rotate
  its key. Approving or declining the sample asks works; that is the point of the demo.
- Put back every twenty minutes by `~/garu-demo/reseed.sh` (launchd job
  `io.github.humbertovillanueva.garu-demo-reseed`): wipes runs, inbox, chat and grants, seeds
  again. The sign-in token is kept, so the published link keeps working.
- Reached from the internet through Tailscale Funnel on ports 8443 (English) and 10000 (Spanish)
  of the Mac's tailnet address, which is public by design and serves only those ports. The app
  finds both addresses and tokens in `https://garuagents.com/demo.json` (`docs/demo.json` in this
  repo, with a CORS header from `docs/vercel.json`) and picks the one for its language, so the demos
  can move without an app update.

The demo contains nothing real. Its token being public is intended: anyone with the app can tap
Try the demo. The real control room on port 4000 is untouched and stays tailnet-only.

## Day to day

```
cd ~/garu-demo && npm run garu -- service status|logs|restart|uninstall      # the English demo
cd ~/garu-demo-es && npm run garu -- service status|logs|restart|uninstall   # the Spanish one
~/garu-demo/reseed.sh                                                        # put both back now
tailscale funnel status                                                   # the public address
```

After `npm run build` in the repo, restart both demos too (`service restart` from each folder):
they run the repo's `packages/` through the symlink. After editing a `Garufile.es.yaml`, copy it
over the matching `Garufile.yaml` in `~/garu-demo-es` again. A new sign-in token
(`rm ~/garu-demo/.garu/ui-token` and restart) needs `docs/demo.json` updated and the site pushed.

The demo runs only while the Mac is on, like Garu itself. The app says "The demo isn't reachable
right now" when it is off.
