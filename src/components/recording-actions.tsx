"use client";
import { useEffect, useRef, useState } from "react";
import type { AppData, CareerAction } from "@/lib/types";
import type {
  RecordingSession,
  RecordingSegment,
} from "../../supabase/functions/_shared/recording-schema";
import type { recordingClient } from "@/lib/recording-client";
import { recordingActionProposals } from "@/lib/recording-actions";

type Api = ReturnType<typeof recordingClient>;
export function RecordingActionReview({
  session,
  data,
  api,
  onSave,
  onEvidence,
  onBook,
}: {
  session: RecordingSession;
  data: AppData;
  api: Api;
  onSave: (
    items: CareerAction[],
    segments: RecordingSegment[],
  ) => Promise<void>;
  onEvidence: (index: number) => void;
  onBook: (item: CareerAction, segments: RecordingSegment[]) => void;
}) {
  const [segments, setSegments] = useState<RecordingSegment[]>([]),
    [drafts, setDrafts] = useState<CareerAction[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoaded(false);
    void api
      .segments(session.id)
      .then((items) => {
        if (live) {
          setSegments(items);
          setDrafts(
            recordingActionProposals(session, items).map(
              (a) => data.careerActions?.find((v) => v.id === a.id) ?? a,
            ),
          );
          setError("");
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : "Underlaget kunde inte hämtas.",
          );
      });
    return () => {
      live = false;
    };
  }, [api, session.id, session.summaryRevision, retry]); // A different context must not erase the user's review edits.
  const patch = (id: string, change: Partial<CareerAction>) =>
    setDrafts((items) =>
      items.map((a) => (a.id === id ? { ...a, ...change } : a)),
    );
  return (
    <section
      className="recording-action-review recording-paper-panel stack"
      aria-label="Åtgärder från samtalet"
    >
      <span className="recording-section-label">03 / Granska åtgärder</span>
      <h2>Från samtal till nästa steg</h2>
      <p>
        Välj åtgärderna som ska sparas. Kontrollera ansvarig och datum mot
        citatet. Datumförslag utgår från samtalets datum; otydliga datum lämnas
        tomma. Kalenderbokningen förhandsvisas innan du sparar.
      </p>
      {!loaded && !error && <p role="status">Hämtar citatens ljuddelar…</p>}
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            className="button secondary"
            onClick={() => setRetry((v) => v + 1)}
          >
            Läs in underlaget igen
          </button>
        </>
      )}
      {loaded && !drafts.length && <p>Inga åtgärdsförslag identifierades.</p>}
      {drafts.map((a, i) => {
        const imported = data.careerActions?.some((v) => v.id === a.id),
          indexes = a.source!.segmentIndexes;
        return (
          <fieldset
            className="recording-proposal"
            data-selected={selected.includes(a.id) && !imported}
            key={a.id}
          >
            <legend>
              Förslag {i + 1}
              {imported ? " · Redan sparat" : ""}
            </legend>
            <label className="recording-choice">
              <input
                type="checkbox"
                disabled={imported || !indexes.length || busy}
                checked={selected.includes(a.id) && !imported}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, a.id]
                      : ids.filter((id) => id !== a.id),
                  )
                }
              />
              Spara förslag {i + 1} som nästa steg
            </label>
            <blockquote>{a.source!.evidence}</blockquote>
            {indexes.length ? (
              <div className="career-actions">
                {indexes.map((index) => (
                  <button
                    className="text-button"
                    key={index}
                    onClick={() => onEvidence(index)}
                  >
                    Öppna citatets ljuddel {index + 1}
                  </button>
                ))}
              </div>
            ) : (
              <p>
                Citatets ljuddel kunde inte fastställas. Förslaget kan inte
                sparas ännu.
              </p>
            )}
            <label>
              Åtgärd {i + 1}
              <input
                disabled={imported || busy}
                maxLength={4000}
                value={a.title}
                onChange={(e) => patch(a.id, { title: e.target.value })}
              />
            </label>
            <label className="recording-action-kind">
              Typ av nästa steg
              <select
                disabled={imported || busy}
                value={a.kind ?? "task"}
                onChange={(e) =>
                  patch(a.id, { kind: e.target.value as "task" | "waiting" })
                }
              >
                <option value="task">Egen uppgift</option>
                <option value="waiting">Väntar på annan</option>
              </select>
            </label>
            <label>
              Ansvarig för förslag {i + 1}
              <input
                disabled={imported || busy}
                maxLength={200}
                value={a.owner}
                onChange={(e) => patch(a.id, { owner: e.target.value })}
              />
            </label>
            <label>
              Datum för förslag {i + 1}
              <input
                disabled={imported || busy}
                type="date"
                value={a.date}
                onChange={(e) => patch(a.id, { date: e.target.value })}
              />
            </label>
            <label>
              Varför behövs förslag {i + 1}?
              <textarea
                disabled={imported || busy}
                maxLength={4000}
                value={a.reason}
                onChange={(e) => patch(a.id, { reason: e.target.value })}
              />
            </label>
            <button
              className="button secondary recording-booking-proposal"
              disabled={
                busy ||
                !indexes.length ||
                (!session.context.applicationId &&
                  !session.context.contactId) ||
                data.careerActions?.find((v) => v.id === a.id)?.status ===
                  "done"
              }
              onClick={() =>
                onBook(
                  data.careerActions?.find((v) => v.id === a.id) ?? a,
                  segments,
                )
              }
            >
              Föreslå kalenderbokning
            </button>
          </fieldset>
        );
      })}
      <button
        className="button primary"
        disabled={
          busy ||
          !selected.some(
            (id) => !data.careerActions?.some((a) => a.id === id),
          ) ||
          (!session.context.applicationId && !session.context.contactId)
        }
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onSave(
              drafts.filter((a) => selected.includes(a.id)),
              segments,
            );
            setSelected([]);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Åtgärderna kunde inte sparas.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Spara valda nästa steg
      </button>
    </section>
  );
}

export function RecordingEvidence({
  api,
  sessionId,
  index,
}: {
  api: Api;
  sessionId: string;
  index: number;
}) {
  const [url, setUrl] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const section = useRef<HTMLElement>(null),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    section.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    void api
      .segments(sessionId)
      .then((parts) => {
        if (live)
          setText(
            parts.find((p) => p.index === index)?.transcript ??
              "Transkriptionen för ljuddelen saknas.",
          );
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [api, sessionId, index]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <section
      ref={section}
      className="career-card stack"
      aria-label={`Ljuddel ${index + 1}`}
    >
      <h2>Ljuddel {index + 1}</h2>
      <p className="career-notes">{text}</p>
      {!url && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const blob = await api.audio(sessionId, index);
              if (mounted.current) setUrl(URL.createObjectURL(blob));
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Ljudet kunde inte öppnas.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Lyssna på ljuddelen
        </button>
      )}
      {url && (
        <audio aria-label={`Spela ljuddel ${index + 1}`} controls src={url} />
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        Hänvisningen gäller hela ljuddelen. Citatet visas ovan; ordens exakta
        tid är inte fastställd.
      </p>
    </section>
  );
}
