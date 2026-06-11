/* Recoup — minimal service worker: makes the app installable (Windows / Linux / Android via
   Chrome's Install App) and serves a network-first passthrough. No offline caching of API data —
   money data must always be live. */
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
