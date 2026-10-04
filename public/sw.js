/* Push only: private family responses are never cached by this service worker. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* Show a generic reminder. */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'Kinfolk reminder', {
    body: payload.body || 'Open your family planner for details.',
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: payload.tag || 'kinfolk-reminder',
    data: {url: payload.url === '/#chores' ? '/#chores' : '/#calendar'},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.url === '/#chores' ? '/#chores' : '/#calendar';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
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
  })());
});
