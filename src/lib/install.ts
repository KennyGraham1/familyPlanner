/** "Add to Home Screen": the browser's install prompt and when to suggest it. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const DISMISSED_KEY = "kinfolk-install-dismissed";
const VISITS_KEY = "kinfolk-visits";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

// The browser offers its prompt once, early, so listen as soon as the app loads.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    changed();
  });
  try {
    const visits = Number(localStorage.getItem(VISITS_KEY) ?? 0) + 1;
    localStorage.setItem(VISITS_KEY, String(visits));
  } catch {
    // Storage can be unavailable (private browsing); the card then just shows less.
  }
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const installPrompt = () => deferred;

export async function install() {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  changed();
  return outcome === "accepted";
}

export function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
export function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
/** Suggest installing from the second visit, unless dismissed in the last 30 days. */
export function wantsInstallSuggestion(now = Date.now()) {
  try {
    const visits = Number(localStorage.getItem(VISITS_KEY) ?? 0);
    const dismissed = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
    return visits >= 2 && now - dismissed > SNOOZE_MS;
  } catch {
    return false;
  }
}
export function snoozeInstallSuggestion(now = Date.now()) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(now));
  } catch {}
}
