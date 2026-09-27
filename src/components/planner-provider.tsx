"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  applyMutation,
  createSeed,
  dataSchema,
  type Mutation,
  type PlannerData,
} from "@/lib/data";
import { getCloud, cloudConfigured } from "@/lib/cloud";

const STORAGE_KEY = "kinfolk-planner-v1";
type Toast = { id: number; message: string; error: boolean };
type Context = {
  data: PlannerData;
  ready: boolean;
  apply: (mutations: Mutation | Mutation[]) => Promise<boolean>;
  replaceData: (data: PlannerData) => boolean;
  notify: (message: string, error?: boolean) => void;
  toast: Toast | null;
  dismissToast: () => void;
  cloudConfigured: boolean;
  email: string | null;
  household: string | null;
  syncError: string | null;
  busy: boolean;
  refreshCloud: () => Promise<void>;
  signOut: () => Promise<void>;
};
const PlannerContext = createContext<Context | null>(null);

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PlannerData>(() =>
    createSeed(new Date("2026-01-01T12:00:00")),
  );
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [household, setHousehold] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dataRef = useRef(data);
  const householdRef = useRef<string | null>(null);
  const pending = useRef(0);
  const generation = useRef(0);
  const localDataInvalid = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const notify = useCallback(
    (message: string, error = false) =>
      setToast({ id: Date.now(), message, error }),
    [],
  );
  const update = useCallback((next: PlannerData) => {
    dataRef.current = next;
    setData(next);
  }, []);
  const readLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = dataSchema.parse(JSON.parse(raw));
        localDataInvalid.current = false;
        return parsed;
      }
    } catch {
      localDataInvalid.current = true;
      notify(
        "Saved data could not be opened. It has been preserved. Restore a valid backup in Family settings to continue.",
        true,
      );
    }
    return createSeed();
  }, [notify]);

  const refreshCloud = useCallback(async () => {
    const cloud = getCloud();
    if (!cloud) return;
    const request = ++generation.current;
    setBusy(true);
    try {
      const { data: auth, error: authError } = await cloud.auth.getSession();
      if (authError) throw authError;
      if (request !== generation.current) return;
      setEmail(auth.session?.user.email ?? null);
      if (!auth.session) {
        householdRef.current = null;
        setHousehold(null);
        setSyncError(null);
        update(readLocal());
        return;
      }
      const { data: rows, error } = await cloud
        .from("planner_memberships")
        .select("household_id")
        .eq("user_id", auth.session.user.id)
        .limit(1);
      if (error) throw error;
      if (request !== generation.current) return;
      const familyId = rows?.[0]?.household_id;
      if (familyId) {
        const { data: family, error: familyError } = await cloud
          .from("planner_households")
          .select("data")
          .eq("id", familyId)
          .single();
        if (familyError) throw familyError;
        if (request !== generation.current) return;
        const parsed = dataSchema.parse(family.data);
        householdRef.current = familyId;
        setHousehold(familyId);
        update(parsed);
      } else {
        householdRef.current = null;
        setHousehold(null);
      }
      setSyncError(null);
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Unable to connect to your family space.",
      );
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [readLocal, update]);

  useEffect(() => {
    // localStorage is a browser-only external store; hydrate it after server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    update(readLocal());
    setReady(true);
    const cloud = getCloud();
    if (!cloud) return;
    void refreshCloud();
    const { data: listener } = cloud.auth.onAuthStateChange(() => {
      setTimeout(() => void refreshCloud(), 0);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, [readLocal, update, refreshCloud]);

  useEffect(() => {
    const sync = async () => {
      const cloud = getCloud(),
        familyId = householdRef.current;
      if (!cloud || !familyId || pending.current) return;
      const { data: row, error } = await cloud
        .from("planner_households")
        .select("data")
        .eq("id", familyId)
        .single();
      if (householdRef.current !== familyId || pending.current) return;
      if (error) {
        setSyncError("Connection interrupted. Your family data is still safe.");
        return;
      }
      const parsed = dataSchema.safeParse(row.data);
      if (parsed.success) {
        update(parsed.data);
        setSyncError(null);
      } else
        setSyncError(
          "The shared data could not be read. Please check your backup.",
        );
    };
    const timer = setInterval(() => void sync(), 15000);
    const focus = () => void sync();
    const storage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && !householdRef.current)
        update(readLocal());
    };
    window.addEventListener("focus", focus);
    window.addEventListener("storage", storage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", storage);
    };
  }, [readLocal, update]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const apply = useCallback(
    async (input: Mutation | Mutation[]) => {
      const mutations = Array.isArray(input) ? input : [input];
      const familyId = householdRef.current;
      if (!familyId) {
        if (localDataInvalid.current) {
          notify(
            "Your saved data needs recovery. Restore a valid backup in Family settings before making changes.",
            true,
          );
          return false;
        }
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          const current = stored
            ? dataSchema.parse(JSON.parse(stored))
            : dataRef.current;
          const next = dataSchema.parse(
            mutations.reduce(applyMutation, current),
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          update(next);
          return true;
        } catch {
          notify(
            "Could not save this change. Check your browser storage and try again.",
            true,
          );
          return false;
        }
      }
      pending.current++;
      setBusy(true);
      const job = queue.current.then(async () => {
        try {
          if (householdRef.current !== familyId) return false;
          const cloud = getCloud()!;
          const { data: result, error } = await cloud.rpc(
            "planner_apply_changes",
            { family_id: familyId, changes: mutations },
          );
          if (error) throw error;
          if (householdRef.current !== familyId) return false;
          update(dataSchema.parse(result));
          setSyncError(null);
          return true;
        } catch {
          notify(
            "Your change was not saved. Check your connection and try again.",
            true,
          );
          setSyncError("A change could not be saved. Please try again.");
          return false;
        } finally {
          pending.current--;
          if (!pending.current) setBusy(false);
        }
      });
      queue.current = job;
      return job;
    },
    [notify, update],
  );

  const replaceData = useCallback(
    (next: PlannerData) => {
      if (householdRef.current) {
        notify(
          "Backup imports are available in a local family space. Sign out first.",
          true,
        );
        return false;
      }
      try {
        const parsed = dataSchema.parse(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        localDataInvalid.current = false;
        update(parsed);
        return true;
      } catch {
        notify(
          "This backup is not valid or your browser storage is full.",
          true,
        );
        return false;
      }
    },
    [notify, update],
  );
  const signOut = useCallback(async () => {
    const cloud = getCloud();
    if (!cloud) return;
    const { error } = await cloud.auth.signOut();
    if (error) {
      notify("Could not sign out. Please try again.", true);
      return;
    }
    householdRef.current = null;
    setHousehold(null);
    setEmail(null);
    setSyncError(null);
    update(readLocal());
    notify("Signed out. Your local family space is ready.");
  }, [notify, readLocal, update]);

  return (
    <PlannerContext.Provider
      value={{
        data,
        ready,
        apply,
        replaceData,
        notify,
        toast,
        dismissToast: () => setToast(null),
        cloudConfigured,
        email,
        household,
        syncError,
        busy,
        refreshCloud,
        signOut,
      }}
    >
      {children}
    </PlannerContext.Provider>
  );
}
export function usePlanner() {
  const context = useContext(PlannerContext);
  if (!context) throw new Error("PlannerProvider is missing");
  return context;
}
