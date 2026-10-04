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
  createFamily,
  dataSchema,
  type Mutation,
  type PlannerData,
} from "@/lib/data";
import { getCloud, cloudConfigured } from "@/lib/cloud";

const STORAGE_KEY = "kinfolk-planner-v1";
type Toast = { id: number; message: string; error: boolean };
/** Which screen to show: the app itself, or the sign-in / family setup steps before it. */
export type Phase = "loading" | "signin" | "setup" | "ready";
type Context = {
  data: PlannerData;
  phase: Phase;
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
  startFamily: (name: string, familyName: string) => Promise<void>;
  joinFamily: (inviteCode: string) => Promise<void>;
  startOver: () => void;
};
const PlannerContext = createContext<Context | null>(null);

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  // Placeholder until hydration; the loading screen is shown meanwhile.
  const [data, setData] = useState<PlannerData>(() =>
    createFamily("You", "Your family"),
  );
  const [phase, setPhase] = useState<Phase>("loading");
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
      if (!raw) return null;
      const parsed = dataSchema.parse(JSON.parse(raw));
      localDataInvalid.current = false;
      return parsed;
    } catch {
      localDataInvalid.current = true;
      notify(
        "Saved data could not be opened. It has been preserved. Restore a valid backup in Family settings to continue.",
        true,
      );
      // Show an empty planner so the person can reach Settings and restore a backup.
      return createFamily("You", "Your family");
    }
  }, [notify]);
  const loadLocal = useCallback(() => {
    const local = readLocal();
    if (local) {
      update(local);
      setPhase("ready");
    } else setPhase("setup");
  }, [readLocal, update]);

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
        setPhase("signin");
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
        setPhase("ready");
      } else {
        householdRef.current = null;
        setHousehold(null);
        setPhase("setup");
      }
      setSyncError(null);
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Unable to connect to your family space.",
      );
      // Without a working connection there is nothing to show yet; the sign-in screen shows the error.
      setPhase((current) => (current === "loading" ? "signin" : current));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [update]);

  useEffect(() => {
    const cloud = getCloud();
    if (!cloud) {
      // localStorage is a browser-only external store; hydrate it after server rendering.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadLocal();
      return;
    }
    void refreshCloud();
    const { data: listener } = cloud.auth.onAuthStateChange(() => {
      setTimeout(() => void refreshCloud(), 0);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, [loadLocal, refreshCloud]);

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
      if (event.key === STORAGE_KEY && !cloudConfigured) loadLocal();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("storage", storage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", storage);
    };
  }, [loadLocal, update]);

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
          "Restoring a backup isn’t available in a shared family space.",
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
    setPhase("signin");
    notify("Signed out.");
  }, [notify]);
  const startFamily = useCallback(
    async (name: string, familyName: string) => {
      const fresh = createFamily(name, familyName);
      const cloud = getCloud();
      if (!cloud) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        } catch {
          throw new Error("Could not save to this browser’s storage.");
        }
        localDataInvalid.current = false;
        update(fresh);
        setPhase("ready");
        return;
      }
      const { error } = await cloud.rpc("planner_create_family", {
        initial_data: fresh,
      });
      if (error) throw error;
      await refreshCloud();
    },
    [refreshCloud, update],
  );
  const joinFamily = useCallback(
    async (inviteCode: string) => {
      const cloud = getCloud();
      if (!cloud) return;
      const { error } = await cloud.rpc("planner_join_family", {
        invite_token: inviteCode.trim(),
      });
      if (error) throw error;
      await refreshCloud();
    },
    [refreshCloud],
  );
  const startOver = useCallback(() => {
    if (householdRef.current) return;
    localStorage.removeItem(STORAGE_KEY);
    localDataInvalid.current = false;
    setPhase("setup");
  }, []);

  return (
    <PlannerContext.Provider
      value={{
        data,
        phase,
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
        startFamily,
        joinFamily,
        startOver,
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
