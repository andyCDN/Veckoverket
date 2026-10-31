"use client";
import { useEffect, useState } from "react";
import type { recordingClient } from "@/lib/recording-client";
import {
  summaryText,
  type RecordingSession,
  type RecordingSegment,
} from "../../supabase/functions/_shared/recording-schema";
export function RecordingTranscript({
  api,
  session,
  editable,
  onChange,
  onEvidence,
}: {
  api: ReturnType<typeof recordingClient>;
  session: RecordingSession;
  editable: boolean;
  onChange: (s: RecordingSession, corrected?: boolean) => void;
  onEvidence: (index: number) => void;
}) {
  const [parts, setParts] = useState<RecordingSegment[]>([]),
    [query, setQuery] = useState(""),
    [edit, setEdit] = useState<{
      index: number;
      text: string;
      revision: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [versions, setVersions] = useState<Awaited<
      ReturnType<typeof api.summaryVersions>
    > | null>(null);
  useEffect(() => {
    let live = true;
    void api
      .segments(session.id)
      .then((items) => {
        if (live) setParts(items);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [api, session.id, session.transcriptRevision, reload]);
  let elapsed = 0,
    contiguous = true,
    expected = 0;
  const located = parts.map((p) => {
    if (p.index !== expected) contiguous = false;
    const seconds = Math.floor(elapsed / 1000);
    elapsed += p.durationMs;
    expected = p.index + 1;
    return {
      ...p,
      offset: contiguous
        ? `${Math.floor(seconds / 60)
            .toString()
            .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`
        : undefined,
    };
  });
  const matches = located.filter((p) =>
    p.transcript
      .toLocaleLowerCase("sv")
      .includes(query.trim().toLocaleLowerCase("sv")),
  );
  return (
    <details className="recording-transcript recording-paper-panel">
      <summary>Transkription · sök, lyssna och rätta</summary>
      <section className="stack" aria-label="Sökbar transkription">
        <p>
          Sökningen gäller den aktuella texten. Ursprunglig taltext och tidigare
          sammanfattningar bevaras när du rättar.
        </p>
        <label>
          Sök i transkriptionen
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <p>
          {matches.length} av {parts.length} ljuddelar
        </p>
        {error && <p role="alert">{error}</p>}
        <button
          className="text-button"
          onClick={async () => {
            setError("");
            try {
              const result = await api.call<{ session: RecordingSession }>({
                action: "get",
                id: session.id,
              });
              onChange(result.session, false);
              setVersions(null);
              setReload((n) => n + 1);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Transkriptionen kunde inte läsas in.",
              );
            }
          }}
        >
          Läs in transkriptionen igen
        </button>
        {!editable && (
          <p>
            Rättelser och versionshistorik blir tillgängliga när inspelningens
            serverdel har uppdaterats.
          </p>
        )}
        {matches.map((p) => (
          <article className="recording-transcript-part stack" key={p.index}>
            <h3>
              Ljuddel {p.index + 1}
              {p.offset ? ` · ${p.offset}` : ""}
            </h3>
            <p className="career-notes">
              {p.transcript || "Ingen taltext i denna ljuddel."}
            </p>
            {p.originalTranscript !== undefined &&
              p.originalTranscript !== p.transcript && (
                <details>
                  <summary>Ursprunglig taltext</summary>
                  <p className="career-notes">{p.originalTranscript}</p>
                </details>
              )}
            <div className="career-actions">
              <button
                className="button secondary"
                onClick={() => onEvidence(p.index)}
              >
                Lyssna på ljuddel {p.index + 1}
              </button>
              <button
                className="button secondary"
                disabled={!editable || busy || session.state === "active"}
                onClick={() =>
                  setEdit({
                    index: p.index,
                    text: p.transcript,
                    revision: session.transcriptRevision ?? 0,
                  })
                }
              >
                Rätta ljuddel {p.index + 1}
              </button>
            </div>
            {edit?.index === p.index && (
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    const result = await api.call<{
                      session: RecordingSession;
                    }>({
                      action: "correct-transcript",
                      id: session.id,
                      index: p.index,
                      text: edit.text,
                      revision: edit.revision,
                    });
                    onChange(result.session, true);
                    setEdit(null);
                    setReload((n) => n + 1);
                    setVersions(null);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Rättelsen kunde inte sparas.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Rättad text för ljuddel {p.index + 1}
                  <textarea
                    rows={6}
                    maxLength={20000}
                    value={edit.text}
                    onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                  />
                </label>
                <p>
                  Rättelsen sparas som en ny version. Sammanfattningen behöver
                  därefter uppdateras och granskas igen.
                </p>
                <div className="career-actions">
                  <button className="button primary" disabled={busy}>
                    Spara rättelse
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setEdit(null)}
                  >
                    Avbryt rättelse
                  </button>
                </div>
              </form>
            )}
          </article>
        ))}
        {editable && (
          <details
            onToggle={(e) => {
              if (e.currentTarget.open && !versions)
                void api
                  .summaryVersions(session.id)
                  .then(setVersions)
                  .catch((e) => setError(e.message));
            }}
          >
            <summary>Tidigare sammanfattningar</summary>
            {versions?.map((v) => (
              <details key={v.revision}>
                <summary>
                  Version {v.revision + 1} · {v.created_at.slice(0, 10)}
                </summary>
                <p className="career-notes">{summaryText(v.summary)}</p>
              </details>
            ))}
            {versions?.length === 0 && <p>Inga tidigare sammanfattningar.</p>}
          </details>
        )}
      </section>
    </details>
  );
}
