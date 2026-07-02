/* MyChecklist service worker — v2.
 * Shell assets (HTML/JS/CSS/manifest) are served NETWORK-FIRST so new
 * deploys reach users immediately; the cache is the offline fallback.
 * Icons/fonts stay cache-first. Bumping CACHE also purges v1 caches. */

const CACHE = "mychecklist-v2";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
];

// Same-origin destinations that must always be fresh when online.
const NETWORK_FIRST = ["document", "script", "style", "manifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let sameOrigin = false;
  try {
    sameOrigin = new URL(request.url).origin === self.location.origin;
  } catch {
    /* opaque URL — treat as cross-origin */
  }
  const netFirst =
    request.mode === "navigate" || (sameOrigin && NETWORK_FIRST.includes(request.destination));

  if (netFirst) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((m) => m || caches.match("./index.html")),
        ),
    );
    return;
  }

  // Everything else (icons, fonts): cache-first with background fill.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});

// Focus/open the app when a notification is tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    }),
  );
});
