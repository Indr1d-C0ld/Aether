// Service worker minimale: cache dello shell per l'avvio offline della PWA.
// Il gioco resta online (WebSocket), ma l'interfaccia si apre anche senza rete.
// Gli indirizzi partono dall'ambito del service worker: il gioco può stare sotto un percorso (es. /aether/).
const CACHE = "aether-v3";
const BASE = new URL(self.registration.scope).pathname;
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, `${BASE}manifest.webmanifest`, `${BASE}icon.svg`])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith(BASE) || url.pathname === `${BASE}ws`) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r ?? caches.match(BASE))),
  );
});
