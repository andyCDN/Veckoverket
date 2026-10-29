"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { AppData } from "./types";
import { loadLocal, saveLocal, type StorageLike } from "./storage";
import { cloudTransport, supabase } from "./supabase";
import { WorkspaceSync, type SyncSnapshot } from "./workspace-sync";
const empty: SyncSnapshot = {
  data: null,
  phase: "loading",
  pending: false,
  error: "",
  storageError: "",
  updatedAt: "",
};

export function useWorkspaceStorage(createNew: () => AppData) {
  const [localData, setLocalData] = useState<AppData | null>(null);
  const [storageError, setStorageError] = useState("");
  const [blockedSave, setBlockedSave] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [authError, setAuthError] = useState("");
  const [cloud, setCloud] = useState<SyncSnapshot>(empty);
  const session = useRef<WorkspaceSync | null>(null);
  const identity = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (supabase) return;
    try {
      setLocalData(loadLocal(localStorage) ?? createNew());
    } catch {
      setBlockedSave(true);
      setStorageError(
        "Din sparade plan kunde inte läsas. Originalet har bevarats. Importera en giltig säkerhetskopia eller återställ planen i inställningarna.",
      );
      setLocalData(createNew());
    }
  }, [createNew]);
  useEffect(() => {
    if (supabase || !localData || blockedSave) return;
    try {
      saveLocal(localStorage, localData);
      setStorageError("");
    } catch {
      setStorageError(
        "Planen kunde inte sparas på enheten. Exportera en säkerhetskopia innan du stänger sidan.",
      );
    }
  }, [localData, blockedSave]);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true,
      authObserved = false;
    function connect(next: User | null) {
      if (!active) return;
      setAuthReady(true);
      setAuthError("");
      setUser(next);
      if (identity.current === (next?.id ?? null)) return;
      identity.current = next?.id ?? null;
      session.current?.dispose();
      session.current = null;
      setCloud(empty);
      if (!next) return;
      let storage: StorageLike | undefined,
        legacy: AppData | null = null;
      try {
        storage = localStorage;
        legacy = loadLocal(storage);
      } catch {
        /* Leave unscoped or corrupt legacy data untouched. */
      }
      const store = new WorkspaceSync(
        next.id,
        cloudTransport(next.id),
        storage,
        (state) => {
          if (active && identity.current === next.id) setCloud(state);
        },
        createNew,
        legacy,
      );
      session.current = store;
      void store.start();
    }
    const { data: listener } = client.auth.onAuthStateChange(
      (_event, current) => {
        authObserved = true;
        // Do not make authenticated requests while Supabase holds its auth lock.
        queueMicrotask(() => connect(current?.user ?? null));
      },
    );
    client.auth
      .getSession()
      .then((result) => {
        if (!active || authObserved) return;
        if (result.error) {
          setAuthError("Inloggningen kunde inte återställas. Logga in igen.");
          setAuthReady(true);
        } else connect(result.data.session?.user ?? null);
      })
      .catch(() => {
        if (active) {
          setAuthReady(true);
          setAuthError("Inloggningen kunde inte kontrolleras. Försök igen.");
        }
      });
    const refresh = () => {
      if (document.visibilityState === "visible")
        void session.current?.refresh();
    };
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      session.current?.dispose();
      session.current = null;
      identity.current = undefined;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [createNew]);
  useEffect(() => {
    if (!supabase) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (session.current?.snapshot().pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, []);
  const setData = useCallback((value: SetStateAction<AppData | null>) => {
    if (supabase) session.current?.update(value);
    else setLocalData(value);
  }, []);
  const retry = useCallback(() => session.current?.refresh(), []);
  const syncNow = useCallback(() => session.current?.flush(), []);
  const setEditing = useCallback(
    (editing: boolean) => session.current?.setEditing(editing),
    [],
  );
  const logout = useCallback(async () => {
    const store = session.current;
    if (store?.snapshot().pending) await store.flush();
    const latest = store?.snapshot();
    if (latest?.pending && latest.storageError)
      throw new Error("Exportera väntande ändringar innan du loggar ut.");
    const { error } = await supabase!.auth.signOut();
    if (error) throw new Error("Utloggningen misslyckades. Försök igen.");
  }, []);
  const chooseInitial = useCallback(
    (useLocal: boolean) => session.current?.chooseInitial(useLocal),
    [],
  );
  const resolveConflict = useCallback(
    (choice: "cloud" | "device") => session.current?.resolveConflict(choice),
    [],
  );
  return {
    data: supabase ? cloud.data : localData,
    setData,
    user,
    authReady,
    authError,
    configured: Boolean(supabase),
    cloud,
    retry,
    syncNow,
    logout,
    setEditing,
    chooseInitial,
    resolveConflict,
    storageError: supabase ? cloud.storageError : storageError,
    blockedSave,
    setBlockedSave,
  };
}
