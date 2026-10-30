"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import {
  googleEventActivities,
  type GoogleEvent,
  type GoogleSnapshot,
} from "./google-calendar";

type Feed = { calendarId: string; name: string };
const setupError =
  "iCal-tjänsten kunde inte nås. Kontrollera anslutningen och att serverfunktionen är installerad i Supabase.";
function feedInfo(value: unknown): value is Feed {
  const feed = value as Feed | null;
  return Boolean(
    feed &&
    typeof feed.calendarId === "string" &&
    feed.calendarId &&
    typeof feed.name === "string",
  );
}
export function useIcalCalendar({
  userId,
  week,
  calendarId,
  automatic,
  paused,
  onSnapshot,
}: {
  userId?: string;
  week: string;
  calendarId?: string;
  automatic: boolean;
  paused: boolean;
  onSnapshot: (snapshot: GoogleSnapshot) => void;
}) {
  const [feed, setFeed] = useState<Feed | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [lastChecked, setLastChecked] = useState("");
  const identity = useRef(userId),
    controller = useRef(new AbortController()),
    running = useRef(false),
    fetched = useRef(new Map<string, number>());
  const receive = useRef(onSnapshot);
  receive.current = onSnapshot;
  identity.current = userId;
  useEffect(() => {
    controller.current.abort();
    controller.current = new AbortController();
    running.current = false;
    fetched.current.clear();
    setFeed(null);
    setError("");
    setBusy(false);
    setLastChecked("");
    return () => controller.current.abort();
  }, [userId]);
  const call = useCallback(
    async (
      action: string,
      values: Record<string, unknown> = {},
      signal?: AbortSignal,
    ) => {
      if (!supabase || !userId)
        throw new Error("Logga in i Veckoverket för att ansluta en iCal-länk.");
      const current = userId,
        abort = controller.current;
      const { data: auth } = await supabase.auth.getSession();
      if (
        auth.session?.user.id !== current ||
        identity.current !== current ||
        abort.signal.aborted
      )
        throw new DOMException("Avbrutet", "AbortError");
      const { data, error } = await supabase.functions.invoke("calendar-ical", {
        body: { action, ...values },
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
        signal: AbortSignal.any([abort.signal, ...(signal ? [signal] : [])]),
        timeout: 25000,
      });
      if (
        identity.current !== current ||
        abort.signal.aborted ||
        signal?.aborted
      )
        throw new DOMException("Avbrutet", "AbortError");
      if (error) {
        let message = setupError;
        if (error.context instanceof Response) {
          // A throttled duplicate fetch needs no user-facing error. This also
          // suppresses the old server message before that function is updated.
          if (error.context.status === 429)
            throw new DOMException("Avbrutet", "AbortError");
          const body = await error.context.json().catch(() => null);
          if (typeof body?.error === "string" && body.error.length < 500)
            message = body.error;
        }
        throw new Error(message);
      }
      if (!data || (data.feed !== null && !feedInfo(data.feed)))
        throw new Error(
          "iCal-tjänsten gav ett ogiltigt svar. Ingen import har sparats.",
        );
      setFeed(data.feed);
      return data;
    },
    [userId],
  );
  const load = useCallback(async () => {
    setError("");
    try {
      await call("status");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    }
  }, [call]);
  const read = useCallback(
    async (
      selectedWeek: string,
      url?: string,
      signal?: AbortSignal,
    ): Promise<GoogleSnapshot> => {
      if (running.current) throw new Error("En kalenderhämtning pågår redan.");
      const owner = identity.current;
      const session = controller.current;
      running.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await call(
          url === undefined ? "read" : "connect",
          { week: selectedWeek, ...(url === undefined ? {} : { url }) },
          signal,
        );
        if (
          !feedInfo(result.feed) ||
          result.week !== selectedWeek ||
          !Array.isArray(result.events) ||
          !Array.isArray(result.deleted) ||
          !result.deleted.every(
            (id: unknown) => typeof id === "string" && id.length > 0,
          ) ||
          typeof result.importedAt !== "string" ||
          !Number.isFinite(Date.parse(result.importedAt))
        )
          throw new Error(
            "iCal-tjänsten gav ett ofullständigt svar. Ingen import har sparats.",
          );
        const snapshot: GoogleSnapshot = {
          week: selectedWeek,
          calendarIds: [result.feed.calendarId],
          transport: "ical",
          activities: googleEventActivities(
            { id: result.feed.calendarId, summary: result.feed.name },
            result.events as GoogleEvent[],
            selectedWeek,
          ),
          deleted: result.deleted.map((eventId: string) => ({
            calendarId: result.feed.calendarId,
            eventId,
          })),
          importedAt: result.importedAt,
        };
        fetched.current.set(
          `${result.feed.calendarId}:${selectedWeek}`,
          Date.now(),
        );
        setLastChecked(new Date().toISOString());
        return snapshot;
      } catch (cause) {
        if (
          identity.current === owner &&
          controller.current === session &&
          (cause as Error).name !== "AbortError"
        )
          setError((cause as Error).message);
        throw cause;
      } finally {
        if (identity.current === owner && controller.current === session) {
          running.current = false;
          setBusy(false);
        }
      }
    },
    [call],
  );
  const disconnect = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      await call("disconnect");
      fetched.current.clear();
      return true;
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [call]);
  useEffect(() => {
    if (!userId || !automatic || !calendarId || paused) return;
    const abort = new AbortController();
    async function refresh() {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        running.current ||
        Date.now() - (fetched.current.get(`${calendarId}:${week}`) ?? 0) <
          15 * 60000
      )
        return;
      fetched.current.set(`${calendarId}:${week}`, Date.now());
      try {
        const snapshot = await read(week, undefined, abort.signal);
        if (!abort.signal.aborted && snapshot.calendarIds[0] === calendarId)
          receive.current(snapshot);
      } catch {
        if (abort.signal.aborted)
          fetched.current.delete(`${calendarId}:${week}`);
        /* The persistent error is shown in the planner and connection panel. */
      }
    }
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 60000);
    const visible = () => {
      void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    window.addEventListener("focus", visible);
    return () => {
      abort.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
      window.removeEventListener("focus", visible);
    };
  }, [userId, automatic, calendarId, week, paused, read]);
  return {
    available: Boolean(supabase && userId),
    feed,
    busy,
    error,
    lastChecked,
    load,
    read,
    disconnect,
  };
}
export type IcalConnection = ReturnType<typeof useIcalCalendar>;
