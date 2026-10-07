// Garu service worker: keeps the app shell available and never caches API data.
// Everything live comes from /api (JSON + SSE); this only makes the page itself
// load instantly and open at all when the control room is briefly unreachable.
const SHELL = "garu-shell-v1";

self.addEventListener("install", (e) => { e.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Network first; fall back to the last good copy of the shell/assets.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(async () => (await caches.match(req)) ?? (req.mode === "navigate" ? caches.match("/") : undefined))
  );
});
