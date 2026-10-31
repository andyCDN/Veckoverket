"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, cloudTransport } from "@/lib/supabase";
import type { CloudDocument } from "@/lib/workspace-sync";
import { appPath } from "@/lib/app-path";
import { fullDate, today } from "@/lib/date";
import { orderedCategories, categoryLabel } from "@/lib/presentation";
import { PcmCapture } from "@/lib/recording-audio";
import {
  listQueuedAudio,
  putQueuedAudio,
  removeQueuedAudio,
  markAudioUploaded,
  type QueuedAudio,
} from "@/lib/recording-queue";
import { recordingPumps } from "@/lib/recording-pumps";
import { recordingClient } from "@/lib/recording-client";
import { saveReviewedRecording } from "@/lib/recording-workspace";
import { importRecordingActions } from "@/lib/recording-actions";
import { RecordingActionReview, RecordingEvidence } from "./recording-actions";
import type { CareerAction } from "@/lib/types";
import {
  summaryText,
  type RecordingSession,
  type RecordingSummary,
  type RecordingContext,
  type RecordingSegment,
} from "../../supabase/functions/_shared/recording-schema";
const setupGuide =
  "https://github.com/andyCDN/Veckoverket/blob/main/docs/recording-setup.md";
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Åtgärden kunde inte slutföras. Försök igen.";
function downloadAudio(item: QueuedAudio) {
  if (!item.blob) return;
  const url = URL.createObjectURL(item.blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `samtal-${item.index + 1}.wav`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function RecorderPage() {
  const [user, setUser] = useState<User | null>(null),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!supabase) {
      setLoaded(true);
      return;
    }
    let live = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (live) {
          setUser(data.session?.user ?? null);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (live) setLoaded(true);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live) {
        setUser(session?.user ?? null);
        setLoaded(true);
      }
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <main className="recording-page">
      <header className="recording-masthead">
        <div className="recording-masthead-top">
          <a href={appPath("/")} aria-label="Till Veckoverket">
            ← Veckoverket
          </a>
          <span>Privat ljudarkiv</span>
        </div>
        <h1 aria-label="Samtalsinspelning">
          Samtals<span>inspelning</span>
        </h1>
        <p>Spela in först. Koppla och granska efteråt.</p>
      </header>
      {!loaded ? (
        <p role="status">Läser in kontot…</p>
      ) : !user ? (
        <p>
          Logga in i Veckoverket för att spela in och spara samtal i ditt konto.
        </p>
      ) : (
        <RecorderWorkspace key={user.id} user={user} />
      )}
    </main>
  );
}
function RecorderWorkspace({ user }: { user: User }) {
  const api = useMemo(() => recordingClient(supabase!, user.id), [user.id]);
  const [document, setDocument] = useState<CloudDocument | null>(null),
    [ready, setReady] = useState(false),
    [aiReady, setAiReady] = useState(false),
    [aiChecking, setAiChecking] = useState(false),
    [aiCheckResult, setAiCheckResult] = useState(""),
    [uploadIssue, setUploadIssue] = useState(""),
    [aiIssue, setAiIssue] = useState(""),
    [finishing, setFinishing] = useState<string[]>([]),
    [sessions, setSessions] = useState<RecordingSession[]>([]),
    [current, setCurrent] = useState<RecordingSession | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [applicationId, setApplicationId] = useState(""),
    [contactId, setContactId] = useState(""),
    [interviewId, setInterviewId] = useState(""),
    [title, setTitle] = useState(`Samtal ${fullDate(today())}`);
  const [queueReady, setQueueReady] = useState(false);
  const [mode, setMode] = useState<"idle" | "recording" | "paused">("idle"),
    [busy, setBusy] = useState(false),
    [seconds, setSeconds] = useState(0),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [queue, setQueue] = useState<QueuedAudio[]>([]),
    [failedLocal, setFailedLocal] = useState<QueuedAudio[]>([]),
    [summary, setSummary] = useState<RecordingSummary | null>(null),
    [review, setReview] = useState("");
  const classification = useRef<HTMLElement | null>(null);
  const [evidenceIndex, setEvidenceIndex] = useState<number | null>(null);
  const suggestedContext = useRef<RecordingContext>({});
  const capture = useRef<PcmCapture | null>(null),
    live = useRef(true),
    summaryJobs = useRef(new Set<string>()),
    finishRequests = useRef(
      new Map<string, { session: RecordingSession; count?: number }>(),
    ),
    persistingFailed = useRef(false),
    pendingCount = useRef(0),
    failed = useRef<QueuedAudio[]>([]),
    currentRef = useRef<RecordingSession | null>(null),
    wake = useRef<WakeLockSentinel | null>(null),
    nextIndex = useRef(0);
  const active = mode !== "idle";
  const app = document?.data.applications?.find((a) => a.id === applicationId);
  const context = (): RecordingContext => ({
    ...(categoryId ? { categoryId } : {}),
    ...(applicationId ? { applicationId } : {}),
    ...(contactId ? { contactId } : {}),
    ...(interviewId && applicationId ? { interviewId } : {}),
  });
  const setSession = (s: RecordingSession | null) => {
    currentRef.current = s;
    setCurrent(s);
  };
  async function refreshQueue() {
    const items = await listQueuedAudio(user.id);
    pendingCount.current = items.filter((q) => !q.uploaded).length;
    if (live.current) {
      setQueue(items);
      setQueueReady(true);
    }
    return items;
  }
  async function refreshSessions() {
    const result = await api.call<{ sessions: RecordingSession[] }>({
      action: "list",
    });
    if (live.current) setSessions(result.sessions);
  }
  async function loadWorkspace() {
    const doc = await cloudTransport(user.id).load();
    if (live.current) {
      setDocument(doc);
    }
    return doc;
  }
  async function holdScreen() {
    try {
      wake.current = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      /* The user can keep the page visible manually. */
    }
  }
  async function releaseScreen() {
    await wake.current?.release().catch(() => undefined);
    wake.current = null;
  }
  async function pauseCapture(reason?: string) {
    const engine = capture.current;
    if (!engine) return;
    try {
      await engine.pause();
      if (live.current) {
        setMode("paused");
        if (reason) setNotice(reason);
      }
    } catch (e) {
      if (live.current) {
        setError(message(e));
        setMode("paused");
      }
    } finally {
      await releaseScreen();
    }
  }
  const pumps = useMemo(
    () =>
      recordingPumps({
        list: refreshQueue,
        upload: (item) => api.upload(item.sessionId, item.index, item.blob!),
        acknowledge: async (item, sha256) => {
          const result = await api.call<{ received: boolean; sha256: string }>({
            action: "acknowledge",
            id: item.sessionId,
            index: item.index,
            sha256,
          });
          if (!result.received)
            throw new Error("Molnlagringen har inte bekräftat ljudet.");
          return result.sha256;
        },
        markUploaded: markAudioUploaded,
        transcribe: async (item) => {
          await api.call({
            action: "transcribe",
            id: item.sessionId,
            index: item.index,
            sha256: item.sha256,
          });
        },
        remove: removeQueuedAudio,
        alive: () => live.current,
      }),
    [api, user.id],
  );
  function kickAI() {
    void pumps
      .ai()
      .then(() => {
        if (live.current) setAiIssue("");
      })
      .catch((e) => {
        if (live.current)
          setAiIssue(
            `${message(e)} Ljudet är sparat i molnet; inspelning och uppladdning fortsätter.`,
          );
      });
  }
  async function checkAI() {
    setAiChecking(true);
    setAiCheckResult("");
    try {
      const status = await api.call<{
        aiReady: boolean;
        aiDiagnostics?: boolean;
      }>({ action: "status" });
      if (live.current) setAiReady(status.aiReady);
      if (!status.aiDiagnostics)
        throw new Error(
          "Inspelningens serverfunktion behöver uppdateras för att visa orsaken till AI-felet. Följ installationsguiden nedan och publicera funktionen recording på nytt.",
        );
      await api.call({ action: "check-ai" });
      if (live.current) {
        setAiReady(true);
        setAiCheckResult(
          "Anslutningen fungerar. Både transkribering och sammanfattning har svarat på provanropet.",
        );
        void retryUploads();
      }
    } catch (e) {
      if (live.current) setAiCheckResult(message(e));
    } finally {
      if (live.current) setAiChecking(false);
    }
  }
  function kickUploads() {
    void pumps
      .uploads()
      .then(() => {
        if (live.current) setUploadIssue("");
        kickAI();
      })
      .catch(() => {
        if (live.current)
          setUploadIssue(
            "Uppladdningen är fördröjd. Inspelningen fortsätter lokalt och uppladdningen försöker igen automatiskt. Behåll sidan öppen.",
          );
      });
    kickAI();
  }
  async function retryUploads() {
    if (persistingFailed.current) return;
    persistingFailed.current = true;
    // Upload existing durable audio even if retrying a quota-failed write fails.
    // Its verified removal may be what frees enough space for the memory copy.
    kickUploads();
    try {
      while (failed.current.length) {
        await putQueuedAudio(failed.current[0]);
        failed.current = failed.current.slice(1);
        setFailedLocal([...failed.current]);
        setError("");
      }
      kickUploads();
      for (const request of finishRequests.current.values())
        beginFinish(request.session, request.count);
    } catch (e) {
      setError(message(e));
    } finally {
      persistingFailed.current = false;
    }
  }
  useEffect(() => {
    live.current = true;
    const params = new URLSearchParams(location.search);
    setApplicationId(params.get("applicationId") ?? "");
    setContactId(params.get("contactId") ?? "");
    setInterviewId(params.get("interviewId") ?? "");
    suggestedContext.current = {
      applicationId: params.get("applicationId") ?? undefined,
      contactId: params.get("contactId") ?? undefined,
      interviewId: params.get("interviewId") ?? undefined,
    };
    void loadWorkspace().catch((e) => {
      if (live.current) setError(message(e));
    });
    void api
      .call<{
        ready: boolean;
        aiReady: boolean;
        deferredCategorization?: boolean;
      }>({ action: "status" })
      .then((result) => {
        if (live.current) {
          setReady(result.ready && result.deferredCategorization === true);
          setAiReady(result.aiReady);
          if (result.ready && !result.deferredCategorization)
            setError(
              "Inspelningstjänsten behöver uppdateras innan du kan spela in utan kategorisering.",
            );
          else if (!result.ready)
            setNotice(
              "Serverdelen för ljudlagring behöver aktiveras innan inspelning kan startas.",
            );
        }
      })
      .catch((e) => {
        if (live.current) setError(message(e));
      });
    void refreshSessions().catch(() => undefined);
    const recordingId = params.get("recordingId");
    if (recordingId && /^[a-f0-9-]{36}$/i.test(recordingId))
      void openSession({ id: recordingId });
    void refreshQueue()
      .then(() => kickUploads())
      .catch((e) => {
        if (live.current) setError(message(e));
      });
    const retryTimer = setInterval(() => {
      void retryUploads();
    }, 15000);
    const online = () => {
      void retryUploads();
    };
    const hidden = () => {
      if (globalThis.document.visibilityState === "hidden")
        void pauseCapture(
          "Inspelningen pausades när sidan doldes. Tryck Fortsätt när sidan är synlig igen.",
        );
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (capture.current || pendingCount.current || failed.current.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", online);
    globalThis.document.addEventListener("visibilitychange", hidden);
    window.addEventListener("beforeunload", unload);
    const timer = setInterval(() => {
      if (capture.current && live.current) setSeconds(capture.current.seconds);
    }, 1000);
    return () => {
      live.current = false;
      void capture.current?.stop().catch(() => undefined);
      void releaseScreen();
      clearInterval(timer);
      clearInterval(retryTimer);
      window.removeEventListener("online", online);
      globalThis.document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("beforeunload", unload);
    };
  }, [api, user.id]);
  async function start() {
    setError("");
    setNotice("");
    if (!ready) {
      setError(
        "Serverdelen behöver vara aktiverad innan inspelningen kan startas.",
      );
      return;
    }
    if (failed.current.length) {
      setError(
        "Spara ljudkopian som inte kunde lagras lokalt innan du startar igen.",
      );
      return;
    }
    setBusy(true);
    let engine: PcmCapture | undefined;
    try {
      let sessionId = "",
        index = 0;
      engine = new PcmCapture(
        async (blob, durationMs) => {
          const item: QueuedAudio = {
            key: `${user.id}/${sessionId}/${index}`,
            userId: user.id,
            sessionId,
            index: index++,
            blob,
            durationMs,
            createdAt: Date.now(),
          };
          nextIndex.current = index;
          try {
            await putQueuedAudio(item);
            await refreshQueue();
          } catch (e) {
            failed.current.push(item);
            if (live.current) {
              setFailedLocal([...failed.current]);
              setError(
                "Ljudet kunde inte sparas lokalt. Inspelningen pausas. Spara ljudkopian eller försök igen innan du lämnar sidan.",
              );
            }
            queueMicrotask(() => {
              void pauseCapture();
            });
            return;
          }
          kickUploads();
          const estimate = await navigator.storage
            ?.estimate?.()
            .catch(() => undefined);
          if (
            estimate?.quota &&
            estimate.quota - (estimate.usage ?? 0) < 64 * 1024 * 1024 &&
            live.current
          )
            setNotice(
              "Lite lokal lagringsplats återstår. Kontrollera att ljudet laddas upp och frigör utrymme på mobilen.",
            );
        },
        (e) => {
          if (live.current) setError(message(e));
          queueMicrotask(() => {
            void pauseCapture();
          });
        },
      );
      capture.current = engine;
      void navigator.storage?.persist?.().catch(() => false);
      const result = await api.call<{ session: RecordingSession }>({
        action: "create",
        title: `Samtal ${fullDate(today())}`,
        context: {},
      });
      sessionId = result.session.id;
      if (!live.current) {
        await engine.stop();
        return;
      }
      nextIndex.current = 0;
      setSession(result.session);
      setTitle(result.session.title);
      setCategoryId("");
      const suggested = suggestedContext.current;
      const suggestedApp = document?.data.applications?.find(
        (a) => a.id === suggested.applicationId,
      );
      setApplicationId(suggestedApp?.id ?? "");
      setContactId(
        document?.data.contacts?.some((c) => c.id === suggested.contactId)
          ? suggested.contactId!
          : "",
      );
      setInterviewId(
        suggestedApp?.interviews?.some((i) => i.id === suggested.interviewId)
          ? suggested.interviewId!
          : "",
      );
      setSummary(null);
      setReview("");
      setSeconds(0);
      await engine.start();
      setMode("recording");
      await holdScreen();
    } catch (e) {
      await engine?.stop().catch(() => undefined);
      capture.current = null;
      setMode("idle");
      setError(message(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function resume() {
    setBusy(true);
    setError("");
    try {
      if (failed.current.length)
        throw new Error(
          "En ljudkopia kunde inte lagras lokalt. Försök spara den igen innan du fortsätter.",
        );
      await capture.current?.resume();
      setMode("recording");
      setNotice("");
      await holdScreen();
      kickUploads();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function beginFinish(session: RecordingSession, capturedCount?: number) {
    finishRequests.current.set(session.id, { session, count: capturedCount });
    if (summaryJobs.current.has(session.id)) return;
    summaryJobs.current.add(session.id);
    setFinishing([...summaryJobs.current]);
    const displaying = () =>
      live.current && currentRef.current?.id === session.id && !capture.current;
    void (async () => {
      await pumps.uploads(session.id);
      if (failed.current.some((q) => q.sessionId === session.id))
        throw new Error(
          "Ett ljudsegment finns bara i minnet. Spara kopian eller försök lagra den igen innan du lämnar sidan.",
        );
      const state = await api.call<{
        session: RecordingSession;
        nextIndex: number;
        pendingIndices: number[];
      }>({ action: "get", id: session.id });
      const count = capturedCount ?? state.nextIndex;
      await api.call({ action: "stop", id: session.id, count });
      if (displaying())
        setSession({
          ...currentRef.current!,
          state: "stopped",
          segmentCount: count,
        });
      await refreshSessions();
      await pumps.ai(session.id);
      // Also recover cloud audio from a previous browser session.
      const remaining = await api.call<{ pendingIndices: number[] }>({
        action: "get",
        id: session.id,
      });
      for (const index of remaining.pendingIndices)
        await api.call({ action: "transcribe", id: session.id, index });
      let result: {
        done: boolean;
        summary?: RecordingSummary;
        completedParts?: number;
        totalParts?: number;
      };
      do {
        result = await api.call({ action: "summarize", id: session.id });
        if (!live.current) return;
        if (!result.done && displaying())
          setNotice(
            `Sammanfattar avsnitt ${result.completedParts} av ${result.totalParts}…`,
          );
      } while (!result.done);
      if (!result.summary)
        throw new Error("Sammanfattningen kunde inte läsas.");
      finishRequests.current.delete(session.id);
      if (displaying()) {
        setSession({
          ...currentRef.current!,
          state: "complete",
          segmentCount: count,
          summary: result.summary,
        });
        setSummary(result.summary);
        setReview(summaryText(result.summary));
        setNotice(
          "Sammanfattningen är ett förslag. Kontrollera överenskommelser och citat innan du sparar.",
        );
      }
      await refreshSessions();
    })()
      .catch((e) => {
        if (displaying()) setError(message(e));
      })
      .finally(() => {
        summaryJobs.current.delete(session.id);
        if (live.current) setFinishing([...summaryJobs.current]);
      });
  }
  async function stop() {
    const session = currentRef.current;
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const engine = capture.current;
      await engine?.stop();
      if (engine) setSeconds(engine.seconds);
      capture.current = null;
      setMode("idle");
      await releaseScreen();
      setNotice(
        "Inspelningen är stoppad. Uppladdning och sammanfattning fortsätter i bakgrunden på den här sidan.",
      );
      beginFinish(session, nextIndex.current);
      requestAnimationFrame(() =>
        classification.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      capture.current = null;
      setMode("idle");
      await releaseScreen();
      setBusy(false);
    }
  }
  async function openSession(item: Pick<RecordingSession, "id">) {
    setBusy(true);
    setError("");
    try {
      const result = await api.call<{
        session: RecordingSession;
        nextIndex: number;
        pendingIndices: number[];
      }>({ action: "get", id: item.id });
      setSession(result.session);
      const params = new URLSearchParams(location.search),
        segment = params.get("segment");
      setEvidenceIndex(
        params.get("recordingId") === item.id &&
          segment !== null &&
          /^\d{1,5}$/.test(segment)
          ? Number(segment)
          : null,
      );
      setTitle(result.session.title);
      setCategoryId(result.session.context.categoryId ?? "");
      setApplicationId(result.session.context.applicationId ?? "");
      setContactId(result.session.context.contactId ?? "");
      setInterviewId(result.session.context.interviewId ?? "");
      nextIndex.current = result.nextIndex;
      setSummary(result.session.summary ?? null);
      setReview(
        result.session.summary ? summaryText(result.session.summary) : "",
      );
      setNotice(
        result.pendingIndices.length
          ? `${result.pendingIndices.length} sparade ljuddelar väntar på transkribering.`
          : "",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function finishSaved() {
    const session = currentRef.current;
    if (session) {
      setError("");
      beginFinish(session);
    }
  }
  async function persistDetails() {
    const session = currentRef.current;
    if (!session || capture.current)
      throw new Error("Stoppa inspelningen innan du kategoriserar den.");
    const selected = context();
    if (!title.trim() || title.length > 200)
      throw new Error("Ange en rubrik på högst 200 tecken.");
    if (
      (categoryId &&
        !document?.data.categories.some((c) => c.id === categoryId)) ||
      (applicationId && !app) ||
      (contactId &&
        !document?.data.contacts?.some((c) => c.id === contactId)) ||
      (interviewId && !app?.interviews?.some((i) => i.id === interviewId))
    )
      throw new Error(
        "Den valda kategorin eller kopplingen finns inte längre i arbetsytan.",
      );
    if (
      session.title === title.trim() &&
      (
        ["categoryId", "applicationId", "contactId", "interviewId"] as const
      ).every((key) => session.context[key] === selected[key])
    )
      return session;
    const result = await api.call<{ session: RecordingSession }>({
      action: "categorize",
      id: session.id,
      title: title.trim(),
      context: selected,
    });
    const updated = {
      ...currentRef.current!,
      title: result.session.title,
      context: result.session.context,
    };
    setSession(updated);
    await refreshSessions();
    return updated;
  }
  async function categorize() {
    setBusy(true);
    setError("");
    try {
      await persistDetails();
      setNotice("Kategoriseringen är sparad.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveSummary() {
    if (!currentRef.current) return;
    setBusy(true);
    setError("");
    try {
      const session = await persistDetails();
      const transport = cloudTransport(user.id),
        latest = await transport.load();
      if (!latest)
        throw new Error(
          "Molnarbetsytan saknas. Öppna Veckoverket och spara planen först.",
        );
      const data = saveReviewedRecording(latest.data, session, review);
      const saved =
        data === latest.data
          ? latest
          : await transport.save(data, latest.revision);
      if (live.current) {
        setDocument(saved);
        setNotice(
          "Den granskade sammanfattningen är sparad i historiken. Kalenderpass och tidigare anteckningar har bevarats.",
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveActions(
    items: CareerAction[],
    segments: RecordingSegment[],
  ) {
    const session = await persistDetails(),
      transport = cloudTransport(user.id),
      latest = await transport.load();
    if (!latest)
      throw new Error(
        "Molnarbetsytan saknas. Spara arbetsytan i Veckoverket först.",
      );
    const data = importRecordingActions(latest.data, session, segments, items);
    const saved =
      data === latest.data
        ? latest
        : await transport.save(data, latest.revision);
    if (live.current) {
      setDocument(saved);
      setNotice(
        "Valda nästa steg är sparade. Öppna Nästa steg under Jobb & nätverk för att boka tid.",
      );
    }
  }
  async function removeSession(item: RecordingSession) {
    if (
      !window.confirm(
        "Radera inspelningen, transkriptionen och AI-förslaget? Redan sparade anteckningar i arbetsytan bevaras.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      finishRequests.current.delete(item.id);
      await api.call({ action: "delete", id: item.id });
      for (const q of await listQueuedAudio(user.id))
        if (q.sessionId === item.id) await removeQueuedAudio(q.key);
      await refreshQueue();
      if (current?.id === item.id) {
        setSession(null);
        setSummary(null);
        setReview("");
      }
      await refreshSessions();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="recording-workspace stack">
      <ol className="recording-steps" aria-label="Inspelningens steg">
        {["Spela in", "Koppla", "Granska"].map((label, index) => {
          const step = !active && current ? (summary ? 2 : 1) : 0;
          return (
            <li key={label} aria-current={step === index ? "step" : undefined}>
              <span aria-hidden="true">0{index + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>
      <div className="recording-capture-layout">
        <div className="recording-capture">
          <section
            className={`recording-deck is-${mode}`}
            id="recording-controls"
            aria-label="Inspelningskontroller"
          >
            <div className="recording-deck-top">
              <span>01 / Spela in</span>
              <span aria-hidden="true">＋</span>
            </div>
            <strong className="recording-state" role="status">
              {mode === "recording"
                ? "● Inspelning pågår"
                : mode === "paused"
                  ? "Inspelning pausad"
                  : "Mikrofonen är avstängd"}
            </strong>
            <button
              className="recording-trigger"
              aria-label={
                busy
                  ? "Vänta…"
                  : mode === "recording"
                    ? "Stoppa och sammanfatta"
                    : mode === "paused"
                      ? "Fortsätt"
                      : "Spela in"
              }
              disabled={busy || (mode === "idle" && (!ready || !queueReady))}
              aria-busy={busy}
              onClick={() =>
                void (mode === "recording"
                  ? stop()
                  : mode === "paused"
                    ? resume()
                    : start())
              }
            >
              <span className="recording-target" aria-hidden="true">
                <span />
              </span>
              <span className="recording-trigger-label">
                {busy
                  ? "Vänta…"
                  : mode === "recording"
                    ? "Stoppa"
                    : mode === "paused"
                      ? "Fortsätt"
                      : "Spela in"}
              </span>
            </button>
            <p className="recording-trigger-meta">
              {mode === "idle"
                ? "Kategorisera efteråt"
                : mode === "paused"
                  ? "Återuppta samtalet"
                  : "Sparar ljud löpande"}
            </p>
            <div className="recording-deck-bottom">
              <span aria-label="Inspelad tid">
                {Math.floor(seconds / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(seconds % 60).toString().padStart(2, "0")}
              </span>
              <span aria-hidden="true">
                {mode === "recording"
                  ? "● REC"
                  : mode === "paused"
                    ? "Ⅱ PAUS"
                    : "● LJUD"}
              </span>
            </div>
            {active && (
              <button
                className="button secondary recording-secondary"
                disabled={busy}
                onClick={() =>
                  void (mode === "recording" ? pauseCapture() : stop())
                }
              >
                {mode === "recording" ? "Pausa" : "Stoppa och sammanfatta"}
              </button>
            )}
          </section>
          <p className="recording-instruction">
            Håll sidan öppen och synlig under samtalet.
          </p>
        </div>
        <aside
          className="recording-processing"
          aria-label="Ljud och bearbetning"
        >
          <div className="recording-processing-title">
            <span>Kontrollpanel</span>
            <h2>Ljud & bearbetning</h2>
          </div>
          <dl className="recording-status-list">
            <div>
              <dt>Väntar på uppladdning</dt>
              <dd>
                {queue.filter((q) => !q.uploaded).length + failedLocal.length}
                <span> ljuddelar</span>
              </dd>
            </div>
            <div>
              <dt>Väntar på transkribering</dt>
              <dd>
                {queue.filter((q) => q.uploaded).length}
                <span> ljuddelar på denna enhet</span>
              </dd>
            </div>
            <div>
              <dt>Pågående bearbetning</dt>
              <dd>
                {finishing.length}
                <span> samtal</span>
              </dd>
            </div>
          </dl>
          {current && (
            <div className="recording-current">
              <span>Aktuellt samtal</span>
              <strong>{current.title}</strong>
              <span>
                {current.state === "complete"
                  ? "Sammanfattning klar"
                  : active
                    ? "Inspelning öppen"
                    : "Sammanfattning återstår"}
              </span>
            </div>
          )}
          {!ready && (
            <p>
              Serverdelen behöver vara aktiverad.{" "}
              <a href={setupGuide} target="_blank" rel="noopener noreferrer">
                Installationsguide för inspelning
              </a>
            </p>
          )}
          {ready && !aiReady && (
            <p>
              AI-bearbetningen är inte aktiverad. Inspelning och ljudlagring
              fungerar; sammanfattningar väntar tills servernyckeln är
              konfigurerad.
            </p>
          )}
          {ready && (
            <details className="recording-diagnostics">
              <summary>Felsök AI-analysen</summary>
              <p>
                Kontrollen provar transkribering och sammanfattning med ett kort
                test utan ditt inspelade material. Vanlig API-kostnad
                tillkommer.
              </p>
              <button
                className="button secondary"
                disabled={aiChecking}
                onClick={() => void checkAI()}
              >
                {aiChecking
                  ? "Kontrollerar AI-anslutningen…"
                  : "Kontrollera AI-anslutningen"}
              </button>
              {aiCheckResult && <p role="status">{aiCheckResult}</p>}
              <p>
                <a
                  href="https://platform.openai.com/settings/organization/billing/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenAI API-fakturering
                </a>
                {" · "}
                <a href={setupGuide} target="_blank" rel="noopener noreferrer">
                  Installationsguide för inspelning
                </a>
              </p>
            </details>
          )}
          {uploadIssue && <p role="status">{uploadIssue}</p>}
          {aiIssue && <p role="status">{aiIssue}</p>}
          {error && (
            <p className="recording-error" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}

          {busy && <p role="status">Bearbetar… Låt sidan vara öppen.</p>}
          {finishing.length > 0 && (
            <p role="status">
              {finishing.length} samtal bearbetas i bakgrunden. Du kan starta
              nästa inspelning.
            </p>
          )}
        </aside>
      </div>
      {current && !active && (
        <section
          className="recording-classification stack"
          ref={classification}
          aria-label="Kategorisera inspelningen"
        >
          <span className="recording-section-label">02 / Koppla samtalet</span>
          <h2>Kategorisera</h2>
          <p>
            Välj kategori och lägg vid behov till en ansökan, intervju eller
            kontakt. Du kan göra det senare.
          </p>
          <fieldset className="stack" disabled={busy}>
            <legend>Kategori och koppling</legend>
            <label>
              Kategori
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Okategoriserad</option>
                {orderedCategories(document?.data.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ansökan
              <select
                value={applicationId}
                onChange={(e) => {
                  setApplicationId(e.target.value);
                  setInterviewId("");
                }}
              >
                <option value="">Ingen ansökan</option>
                {document?.data.applications?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.role} · {a.organization}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kontakt
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                <option value="">Ingen kontakt</option>
                {document?.data.contacts?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.organization}
                  </option>
                ))}
              </select>
            </label>
            {!!app?.interviews?.length && (
              <label>
                Intervju
                <select
                  value={interviewId}
                  onChange={(e) => setInterviewId(e.target.value)}
                >
                  <option value="">Ingen särskild intervju</option>
                  {app.interviews.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title} · {i.date}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Samtalets rubrik
              <input
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              onClick={() => void categorize()}
            >
              Spara kategorisering
            </button>
          </fieldset>

          {current.state !== "complete" && (
            <button
              className="button secondary"
              disabled={busy || finishing.includes(current.id)}
              onClick={() => void finishSaved()}
            >
              Avsluta och sammanfatta sparat ljud
            </button>
          )}
        </section>
      )}
      {(queue.length > 0 || failedLocal.length > 0) && (
        <details>
          <summary>Väntande ljud och återhämtning</summary>
          <div className="stack">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void retryUploads()}
            >
              Försök ladda upp igen
            </button>
            {failedLocal.map((item) => (
              <button
                className="button secondary"
                key={item.key}
                onClick={() => downloadAudio(item)}
              >
                Spara ljuddel {item.index + 1} som inte kunde lagras lokalt
              </button>
            ))}
            {queue.map((q) => (
              <div className="career-actions" key={q.key}>
                <span>
                  Ljuddel {q.index + 1} · {Math.round(q.durationMs / 1000)}{" "}
                  sekunder
                </span>
                {q.blob ? (
                  <button
                    className="text-button"
                    onClick={() => downloadAudio(q)}
                  >
                    Spara ljudkopia
                  </button>
                ) : (
                  <span>Bekräftad molnkopia</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      {current && evidenceIndex !== null && !active && (
        <RecordingEvidence
          key={`${current.id}-${evidenceIndex}`}
          api={api}
          sessionId={current.id}
          index={evidenceIndex}
        />
      )}
      {summary && current && document && !active && (
        <RecordingActionReview
          key={current.id}
          session={{ ...current, context: context() }}
          data={document.data}
          api={api}
          onSave={saveActions}
          onEvidence={setEvidenceIndex}
        />
      )}
      {summary && !active && (
        <section
          className="recording-summary-review recording-paper-panel stack"
          aria-label="Granska sammanfattning"
        >
          <span className="recording-section-label">03 / Granska texten</span>
          <h2>Granska sammanfattningen</h2>
          <p>
            Överenskommelser, förslag och osäkra uppgifter hålls isär.
            Kontrollera texten mot citaten och rätta eventuella fel innan du
            sparar. Välj koppling under Kategorisera för att lägga texten i rätt
            historik.
          </p>
          <details>
            <summary>Citat som förslaget bygger på</summary>
            <ul>
              {[...summary.agreements, ...summary.nextSteps].map((item, i) => (
                <li key={i}>
                  <p>{item.text}</p>
                  <blockquote>{item.evidence}</blockquote>
                </li>
              ))}
            </ul>
          </details>
          <label>
            Granskad sammanfattning
            <textarea
              rows={8}
              value={review}
              onChange={(e) => setReview(e.target.value)}
            />
          </label>
          <p>
            {review.length} / 4000 tecken. En längre text behöver kortas före
            sparning.
          </p>
          {!applicationId && !contactId && (
            <p>
              Välj en ansökan eller kontakt för att spara texten i historiken.
              Ljudet och AI-förslaget finns kvar i inspelningen.
            </p>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              !review.trim() ||
              review.length > 4000 ||
              (!applicationId && !contactId)
            }
            onClick={() => void saveSummary()}
          >
            Spara granskad sammanfattning i historiken
          </button>
        </section>
      )}
      <details className="recording-archive" open={current !== null}>
        <summary>
          Tidigare inspelningar <span>{sessions.length}</span>
        </summary>
        <section className="stack" aria-label="Tidigare inspelningar">
          <h2>Tidigare inspelningar</h2>
          {!sessions.length && <p>Inga inspelningar att visa.</p>}
          {sessions.map((s) => (
            <article className="recording-session stack" key={s.id}>
              <h3>{s.title}</h3>
              <p>
                {document?.data.categories.find(
                  (c) => c.id === s.context.categoryId,
                )?.name ?? "Okategoriserad"}{" "}
                · {s.startedAt.slice(0, 10)} ·{" "}
                {s.state === "complete"
                  ? "Sammanfattad"
                  : s.state === "stopped"
                    ? "Väntar på sammanfattning"
                    : "Ej avslutad"}
              </p>
              <div className="career-actions">
                <button
                  className="button secondary"
                  disabled={busy || active}
                  onClick={() => void openSession(s)}
                >
                  Öppna inspelning
                </button>
                <button
                  className="text-button"
                  disabled={
                    busy ||
                    active ||
                    finishing.length > 0 ||
                    queue.some((q) => q.sessionId === s.id && !q.uploaded)
                  }
                  onClick={() => void removeSession(s)}
                >
                  Radera inspelning
                </button>
              </div>
            </article>
          ))}
        </section>
      </details>
      <details className="recording-about">
        <summary>Om inspelningen</summary>
        <p>
          Mikrofonen spelar in ljud i omgivningen och fångar inte automatiskt
          ljud från andra appar eller telefonsamtal. Inspelningen pausas när
          sidan döljs.
        </p>
      </details>
    </div>
  );
}
