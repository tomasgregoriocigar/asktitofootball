/* Ask Tito — Rules Quant service worker.
   Purpose: make the site installable (Chrome requires a service worker
   with a fetch handler before it will fire beforeinstallprompt) and give
   offline visitors the last good page instead of a browser error.
   Strategy, deliberately conservative so a stale page can never stick:
   - Navigations and HTML: network-first. The fresh page always wins when
     the network answers; the cache is only an offline fallback.
   - Manifest and icons: cache-first. They change rarely and version with
     the cache name below.
   Bump CACHE when this file's behavior or the precached shell changes. */
var CACHE = "rq-v8";
var PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE) return caches.delete(name);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var isPage = req.mode === "navigate" ||
    (req.headers.get("accept") || "").indexOf("text/html") !== -1;
  var isShellAsset = url.pathname === "/manifest.webmanifest" ||
    url.pathname.indexOf("/icons/") === 0;

  if (isPage) {
    /* Network-first: fresh HTML whenever the network answers. */
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("/");
        });
      })
    );
    return;
  }

  if (isShellAsset) {
    /* Cache-first: manifest and icons are stable between versions. */
    event.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
          return res;
        });
      })
    );
    return;
  }

  /* Everything else: straight to the network, cache only as fallback. */
  event.respondWith(
    fetch(req).catch(function () { return caches.match(req); })
  );
});
