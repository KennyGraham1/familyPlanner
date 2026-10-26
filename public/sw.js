/* Reminders, and (in production) the app's own files so it opens offline.
   Family data, /api/ responses and other sites are never cached here. */
const OFFLINE = new URL(self.location).searchParams.get("offline") === "1";
const CACHE = "kinfolk-app-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (OFFLINE)
    event.waitUntil(
      caches
        .open(CACHE)
        .then((cache) =>
          cache.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"]),
        )
        .catch(() => {}),
    );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Remove older copies of the app (and everything when offline use is off).
      for (const name of await caches.keys())
        if (name.startsWith("kinfolk-app-") && (!OFFLINE || name !== CACHE))
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // Offline: the saved page, or the app's start page (it routes with #hash).
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      Response.error()
    );
  }
}
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (saved) {
    event.waitUntil(fresh.catch(() => {}));
    return saved;
  }
  return fresh;
}
self.addEventListener("fetch", (event) => {
  if (!OFFLINE) return;
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") event.respondWith(networkFirst(request));
  // Built files have content hashes in their names, so a saved copy is never stale.
  else if (url.pathname.startsWith("/_next/static/"))
    event.respondWith(cacheFirst(request));
  else if (
    /^\/(icons|images|fonts)\/|\.(webmanifest|svg|png|webp|jpg|woff2)$/.test(
      url.pathname,
    )
  )
    event.respondWith(staleWhileRevalidate(request, event));
});
function reminderPath(value) {
  if (
    typeof value !== "string" ||
    !/^\/#(?:calendar|chores)(?:\?|$)/.test(value)
  )
    return "/#calendar";
  return value;
}
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    /* Show a generic reminder. */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Kinfolk reminder", {
      body: payload.body || "Open your family planner for details.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag || "kinfolk-reminder",
      data: { url: reminderPath(payload.url) },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = reminderPath(event.notification.data?.url);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          const navigated = await client.navigate(target);
          return (navigated || client).focus();
        } catch {
          // Tabs this worker doesn't control (e.g. after a hard reload) can't be navigated.
          break;
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
