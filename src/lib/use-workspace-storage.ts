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
import { UndoHistory } from "./undo-history";
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
  const local = useRef<AppData | null>(null),
    history = useRef(new UndoHistory());
  const [undoLabel, setUndoLabel] = useState("");

  useEffect(() => {
    if (supabase) return;
    try {
      const next = loadLocal(localStorage) ?? createNew();
      local.current = next;
      history.current.reset(next);
      setLocalData(next);
    } catch {
      setBlockedSave(true);
      setStorageError(
        "Din sparade plan kunde inte läsas. Originalet har bevarats. Importera en giltig säkerhetskopia eller återställ planen i inställningarna.",
      );
      const next = createNew();
      local.current = next;
      history.current.reset(next);
      setLocalData(next);
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
      history.current.reset(null);
      setUndoLabel("");
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
          if (active && identity.current === next.id) {
            history.current.observe(state.data);
            setUndoLabel(history.current.label);
            setCloud(state);
          }
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
  const setData = useCallback(
    (
      value: SetStateAction<AppData | null>,
      options?: { undoLabel?: string; history?: boolean },
    ) => {
      const store = session.current;
      if (supabase && (!store || store.snapshot().phase === "migration"))
        return;
      const before = supabase ? store!.snapshot().data : local.current;
      const next = typeof value === "function" ? value(before) : value;
      if (!next) return;
      history.current.record(
        before,
        next,
        options?.history === false ? false : options?.undoLabel,
      );
      setUndoLabel(history.current.label);
      if (supabase) store!.update(next);
      else {
        local.current = next;
        setLocalData(next);
      }
    },
    [],
  );
  const undo = useCallback(() => {
    const store = session.current;
    if (
      blockedSave ||
      (supabase &&
        (!store ||
          ["loading", "migration", "conflict"].includes(
            store.snapshot().phase,
          )))
    )
      return false;
    const restored = history.current.undo(
      supabase ? store!.snapshot().data : local.current,
    );
    setUndoLabel(history.current.label);
    if (!restored) return false;
    if (supabase) store!.update(restored);
    else {
      local.current = restored;
      setLocalData(restored);
    }
    return true;
  }, [blockedSave]);
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
    undo,
    undoLabel:
      blockedSave ||
      (supabase && ["loading", "migration", "conflict"].includes(cloud.phase))
        ? ""
        : undoLabel,
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
