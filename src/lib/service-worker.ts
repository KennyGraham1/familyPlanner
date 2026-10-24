/**
 * One service worker for reminders and offline use. Offline caching of the app's
 * own files is switched on only in production builds, so development never serves
 * stale code.
 */
export const serviceWorkerUrl = `/sw.js?offline=${process.env.NODE_ENV === "production" ? 1 : 0}`;

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register(serviceWorkerUrl, {
    scope: "/",
    updateViaCache: "none",
  });
}
