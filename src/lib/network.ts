/**
 * Network resilience for the Supabase client. Phones often drop connections while
 * the app is in the background; the first request afterwards can hang or fail with
 * "TypeError: Load failed". Requests get a timeout, and ones that are safe to repeat
 * are retried before anyone sees an error.
 */
const TIMEOUT_MS = 10000;
const RETRY_DELAYS_MS = [400, 1500];
// Requests with the same result when repeated. Others (creating a family, joining,
// signing up) could act twice if the first attempt reached the server.
const REPEATABLE_POSTS = [
  /\/rest\/v1\/rpc\/planner_(apply_changes|get_context|save_push|remove_push|revoke_invite)$/,
  /\/auth\/v1\/token$/,
];

export function canRetry(url: string, method = "GET") {
  if (method === "GET" || method === "HEAD") return true;
  const path = new URL(url, "http://localhost").pathname;
  return method === "POST" && REPEATABLE_POSTS.some((p) => p.test(path));
}

export function createResilientFetch({
  fetchImpl = (...args: Parameters<typeof fetch>) => fetch(...args),
  timeoutMs = TIMEOUT_MS,
  delaysMs = RETRY_DELAYS_MS,
}: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  delaysMs?: number[];
} = {}): typeof fetch {
  return async (input, init = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (
      init.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const retries = canRetry(url, method) ? delaysMs : [];
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const caller = init.signal;
      const stop = () => controller.abort(caller?.reason);
      caller?.addEventListener("abort", stop);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetchImpl(input, { ...init, signal: controller.signal });
      } catch (error) {
        // HTTP errors are responses, not exceptions: only network failures get here.
        if (caller?.aborted || attempt >= retries.length) throw error;
        await new Promise((resolve) => setTimeout(resolve, retries[attempt]));
      } finally {
        clearTimeout(timer);
        caller?.removeEventListener("abort", stop);
      }
    }
  };
}

/** Whether an error means the server couldn't be reached (rather than refused). */
export function isNetworkError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "AbortError" || name === "TimeoutError") return true;
  return (
    typeof message === "string" &&
    /load failed|failed to fetch|networkerror|network request failed|fetch failed|aborted|timed? ?out/i.test(
      message,
    )
  );
}

/** How long the family space can be unreachable before anyone is told. */
export const OFFLINE_NOTICE_AFTER_MS = 15000;
export type Connection = "connected" | "reconnecting" | "offline";
/**
 * Brief drops (a phone waking up) stay silent while requests retry; only a lasting
 * outage, or a device that reports it's offline, is shown.
 */
export function connectionState(
  failingSince: number | null,
  now: number,
  deviceOnline: boolean,
): Connection {
  if (!deviceOnline) return "offline";
  if (failingSince === null) return "connected";
  return now - failingSince >= OFFLINE_NOTICE_AFTER_MS
    ? "offline"
    : "reconnecting";
}
export function offlineMessage(
  online = typeof navigator === "undefined" || navigator.onLine,
) {
  return online
    ? "Can’t reach your family space. Showing your last saved plans while it retries."
    : "You’re offline. Showing your last saved plans; family changes will appear when you’re back online.";
}
