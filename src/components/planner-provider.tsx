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
import { errorMessage } from "@/lib/errors";
import { familyContextSchema, type FamilyAccess } from "@/lib/family";
import { disableDevicePush } from "@/lib/push-client";

const STORAGE_KEY = "kinfolk-planner-v1";
// With a live connection, polling is only a safety net for missed messages.
const POLL_LIVE = 60000;
const POLL_FALLBACK = 15000;
type Toast = { id: number; message: string; error: boolean };
export type Phase = "loading" | "signin" | "setup" | "profile" | "ready";
type Context = {
  data: PlannerData;
  phase: Phase;
  apply: (input: Mutation | Mutation[]) => Promise<boolean>;
  replaceData: (next: PlannerData) => boolean;
  restoreData: (
    next: PlannerData,
    expectedRevision: string | null,
  ) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
  toast: Toast | null;
  dismissToast: () => void;
  cloudConfigured: boolean;
  email: string | null;
  userId: string | null;
  household: string | null;
  currentMemberId: string;
  isOwner: boolean;
  access: FamilyAccess[];
  revision: string | null;
  syncError: string | null;
  busy: boolean;
  /** Whether family changes arrive instantly (Supabase Realtime is connected). */
  live: boolean;
  refreshCloud: () => Promise<void>;
  signOut: () => Promise<void>;
  startFamily: (name: string, familyName: string) => Promise<void>;
  joinFamily: (inviteCode: string) => Promise<void>;
  chooseProfile: (profileId: string | null, name?: string) => Promise<void>;
  startOver: () => void;
};
const PlannerContext = createContext<Context | null>(null);
export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PlannerData>(() =>
    createFamily("You", "Your family"),
  );
  const [phase, setPhase] = useState<Phase>("loading");
  const [toast, setToast] = useState<Toast | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [household, setHousehold] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [access, setAccess] = useState<FamilyAccess[]>([]);
  const [revision, setRevision] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dataRef = useRef(data);
  const householdRef = useRef<string | null>(null);
  const scopeRef = useRef("");
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
  const clearFamily = useCallback(() => {
    householdRef.current = null;
    scopeRef.current = "";
    setHousehold(null);
    setProfileId(null);
    setAccess([]);
    setIsOwner(false);
    setRevision(null);
    update(createFamily("You", "Your family"));
  }, [update]);
  const loadLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setPhase("setup");
        return;
      }
      update(dataSchema.parse(JSON.parse(raw)));
      localDataInvalid.current = false;
      setPhase("ready");
    } catch {
      localDataInvalid.current = true;
      update(createFamily("You", "Your family"));
      setPhase("ready");
      notify(
        "Saved data could not be opened. It has been preserved. Restore a valid backup in Family settings to continue.",
        true,
      );
    }
  }, [notify, update]);
  const refreshCloud = useCallback(
    async (quiet = false) => {
      const cloud = getCloud();
      if (!cloud) return;
      const request = ++generation.current;
      if (!quiet) setBusy(true);
      try {
        const { data: auth, error: authError } = await cloud.auth.getSession();
        if (authError) throw authError;
        if (request !== generation.current) return;
        setEmail(auth.session?.user.email ?? null);
        setUserId(auth.session?.user.id ?? null);
        if (!auth.session) {
          clearFamily();
          setSyncError(null);
          setPhase("signin");
          return;
        }
        if (pending.current) return;
        const { data: snapshot, error } = await cloud.rpc(
          "planner_get_context",
        );
        if (error) throw error;
        if (request !== generation.current || pending.current) return;
        if (!snapshot) {
          clearFamily();
          setPhase("setup");
          setSyncError(null);
          return;
        }
        const family = familyContextSchema.parse(snapshot);
        householdRef.current = family.household_id;
        scopeRef.current = `${auth.session.user.id}:${family.household_id}`;
        setHousehold(family.household_id);
        setProfileId(family.member_id);
        setIsOwner(family.owner_id === auth.session.user.id);
        setAccess(family.access);
        setRevision(family.updated_at);
        update(family.data);
        setPhase(
          family.member_id &&
            family.data.members.some((m) => m.id === family.member_id)
            ? "ready"
            : "profile",
        );
        setSyncError(null);
      } catch (error) {
        if (request !== generation.current) return;
        setSyncError(
          errorMessage(
            error,
            "Unable to connect to your family space. Please try again.",
          ),
        );
        setPhase((current) => (current === "loading" ? "signin" : current));
      } finally {
        if (request === generation.current && !pending.current) setBusy(false);
      }
    },
    [clearFamily, update],
  );
  useEffect(() => {
    const cloud = getCloud();
    if (!cloud) {
      // Hydrate browser-only data after mounting.
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
    const sync = () => {
      if (cloudConfigured && !pending.current) void refreshCloud(true);
    };
    // Phones often don't fire "focus" when switching back to the app.
    const visible = () => {
      if (document.visibilityState === "visible") sync();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && !cloudConfigured) loadLocal();
    };
    const timer = setInterval(sync, live ? POLL_LIVE : POLL_FALLBACK);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", storage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("storage", storage);
    };
  }, [live, loadLocal, refreshCloud]);
  useEffect(() => {
    const cloud = getCloud();
    if (!cloud || !household) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The message is only a signal: fetching keeps one code path and avoids large payloads.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!pending.current) void refreshCloud(true);
      }, 250);
    };
    const channel = cloud
      .channel(`household:${household}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "planner_households",
          filter: `id=eq.${household}`,
        },
        refresh,
      )
      .subscribe((status) => {
        const connected = status === "SUBSCRIBED";
        // On every (re)connect, catch up on changes made while not listening.
        if (connected) refresh();
        setLive(connected);
      });
    return () => {
      clearTimeout(timer);
      setLive(false);
      void cloud.removeChannel(channel);
    };
  }, [household, refreshCloud]);
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
        if (cloudConfigured) {
          notify("Sign in and join a family before saving.", true);
          return false;
        }
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
      const scope = scopeRef.current;
      ++generation.current;
      pending.current++;
      setBusy(true);
      const job = queue.current.then(async () => {
        try {
          if (scopeRef.current !== scope) return false;
          const { data: result, error } = await getCloud()!.rpc(
            "planner_apply_changes",
            { family_id: familyId, changes: mutations },
          );
          if (error) throw error;
          if (scopeRef.current !== scope) return false;
          update(dataSchema.parse(result));
          setSyncError(null);
          return true;
        } catch (e) {
          if (scopeRef.current === scope) {
            notify(
              errorMessage(e, "Your change was not saved. Please try again."),
              true,
            );
            setSyncError("A change could not be saved. Please try again.");
          }
          return false;
        } finally {
          pending.current--;
          if (!pending.current) {
            setBusy(false);
            void refreshCloud(true);
          }
        }
      });
      queue.current = job;
      return job;
    },
    [notify, refreshCloud, update],
  );
  const replaceData = useCallback(
    (next: PlannerData) => {
      if (cloudConfigured) {
        notify("Use the shared restore option in Family settings.", true);
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
  const restoreData = useCallback(
    async (next: PlannerData, expectedRevision: string | null) => {
      if (!cloudConfigured) return replaceData(next);
      if (!householdRef.current || !isOwner || pending.current) {
        notify(
          "Only the owner can restore, after pending changes finish saving.",
          true,
        );
        return false;
      }
      const familyId = householdRef.current,
        scope = scopeRef.current;
      ++generation.current;
      pending.current++;
      setBusy(true);
      try {
        const { data: result, error } = await getCloud()!.rpc(
          "planner_restore_family",
          {
            family_id: familyId,
            backup: dataSchema.parse(next),
            expected_updated_at: expectedRevision,
          },
        );
        if (error) throw error;
        if (scopeRef.current !== scope) return false;
        update(dataSchema.parse(result));
        setSyncError(null);
        return true;
      } catch (e) {
        notify(errorMessage(e, "Could not restore this backup."), true);
        return false;
      } finally {
        pending.current--;
        setBusy(false);
        await refreshCloud(true);
      }
    },
    [isOwner, notify, refreshCloud, replaceData, update],
  );
  const signOut = useCallback(async () => {
    const cloud = getCloud();
    if (!cloud) return;
    try {
      await disableDevicePush();
    } catch {
      notify(
        "Could not disable reminders on this device. You can turn them off in browser settings.",
        true,
      );
    }
    const { error } = await cloud.auth.signOut({ scope: "local" });
    if (error) {
      notify("Could not sign out. Please try again.", true);
      return;
    }
    ++generation.current;
    clearFamily();
    setEmail(null);
    setUserId(null);
    setSyncError(null);
    setPhase("signin");
    notify("Signed out.");
  }, [clearFamily, notify]);
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
  const chooseProfile = useCallback(
    async (profileId: string | null, name?: string) => {
      if (!householdRef.current) return;
      const { error } = await getCloud()!.rpc("planner_choose_profile", {
        family_id: householdRef.current,
        profile_id: profileId,
        display_name: name?.trim() ?? null,
      });
      if (error) throw error;
      await refreshCloud();
    },
    [refreshCloud],
  );
  const startOver = useCallback(() => {
    if (cloudConfigured) return;
    localStorage.removeItem(STORAGE_KEY);
    localDataInvalid.current = false;
    clearFamily();
    setPhase("setup");
  }, [clearFamily]);
  return (
    <PlannerContext.Provider
      value={{
        data,
        phase,
        apply,
        replaceData,
        restoreData,
        notify,
        toast,
        dismissToast: () => setToast(null),
        cloudConfigured,
        email,
        userId,
        household,
        currentMemberId: profileId ?? data.settings.currentMemberId,
        isOwner,
        access,
        revision,
        syncError,
        busy,
        live,
        refreshCloud,
        signOut,
        startFamily,
        joinFamily,
        chooseProfile,
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
