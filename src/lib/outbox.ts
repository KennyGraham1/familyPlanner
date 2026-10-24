import {
  applyMutation,
  dataSchema,
  type Mutation,
  type PlannerData,
} from "./data";
import { familyContextSchema } from "./family";

/**
 * Offline support for shared families. Changes made without a connection wait in
 * an "outbox" (per family) and are sent, in order, when the connection returns.
 * The last plans seen are kept per person so the app still opens offline.
 * Both live in this browser's storage and are removed on sign-out.
 */
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const browserStore = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};
const outboxKey = (family: string) => `kinfolk-outbox-${family}`;
const snapshotKey = (user: string) => `kinfolk-offline-${user}`;

export function readOutbox(
  family: string,
  store = browserStore(),
): Mutation[][] {
  try {
    const value = JSON.parse(store?.getItem(outboxKey(family)) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
export function writeOutbox(
  family: string,
  batches: Mutation[][],
  store = browserStore(),
) {
  try {
    if (batches.length)
      store?.setItem(outboxKey(family), JSON.stringify(batches));
    else store?.removeItem(outboxKey(family));
  } catch {
    // Storage full or blocked: the change stays on screen until the app closes.
  }
}
/** The server's plans with changes still waiting to be sent laid on top. */
export function rebase(data: PlannerData, batches: Mutation[][]): PlannerData {
  let result = data;
  for (const batch of batches) {
    try {
      // A batch that no longer fits (say, its item was deleted elsewhere) is skipped.
      result = dataSchema.parse(batch.reduce(applyMutation, result));
    } catch {}
  }
  return result;
}
export function saveSnapshot(
  user: string,
  context: unknown,
  store = browserStore(),
) {
  try {
    store?.setItem(snapshotKey(user), JSON.stringify(context));
  } catch {}
}
export function readSnapshot(user: string, store = browserStore()) {
  try {
    const parsed = familyContextSchema.safeParse(
      JSON.parse(store?.getItem(snapshotKey(user)) ?? "null"),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function forgetOffline(
  user: string | null,
  family: string | null,
  store = browserStore(),
) {
  try {
    if (user) store?.removeItem(snapshotKey(user));
    if (family) store?.removeItem(outboxKey(family));
  } catch {}
}
