/* Chatrix service worker: installable app + offline fallback.
   Only same-origin files are handled. Firebase, Supabase, fonts and all other
   cross-origin requests go straight to the network, so live data is never cached. */
const CACHE = "chatrix-v1";
const SHELL = ["chatrix-home.html", "chatrix-login.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "chatrix-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Pages: network first so updates show immediately, cache when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("chatrix-home.html") || caches.match("chatrix-login.html")))
    );
    return;
  }

  // Other same-origin files (icons, manifest): serve cached, refresh in background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
