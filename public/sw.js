// Optima service worker.
//
// Caches ONLY immutable static assets (content-hashed /_next/static files and
// icons). Page navigations, RSC payloads and API calls always go to the network.
// The previous version precached and served HTML pages, which stored the auth
// redirect (/dashboard → /login) and replayed it after sign-in — making sign-in
// look broken. Bumping the cache name makes activate() delete that old cache.
const CACHE = "optima-static-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  return /\.(png|svg|ico|woff2?)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isStaticAsset(url)) return; // pages, RSC, API, manifest → network as usual

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
    )
  );
});
