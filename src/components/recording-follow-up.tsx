"use client";
import { useState } from "react";
import type { AppData, CareerAction } from "@/lib/types";
import { relatedCareerActions } from "@/lib/career-actions";
import { recordingHref } from "@/lib/recording-client";
export function RecordingFollowUp({
  data,
  context,
  recordingId,
  onSave,
}: {
  data: AppData;
  context: { applicationId?: string; contactId?: string };
  recordingId?: string;
  onSave: (
    id: string,
    input: {
      kind: "fulfilled" | "changed" | "open";
      note: string;
      recordingId?: string;
      title?: string;
      date?: string;
      owner?: string;
      reason?: string;
    },
  ) => Promise<void>;
}) {
  const items = relatedCareerActions(data, context, recordingId),
    [draft, setDraft] = useState<CareerAction | null>(null),
    [kind, setKind] = useState<"fulfilled" | "changed" | "open">("open"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!context.applicationId && !context.contactId) return null;
  return (
    <details className="recording-paper-panel recording-follow-up">
      <summary>
        Tidigare överenskommelser ·{" "}
        {items.filter((a) => a.status === "open").length} öppna
      </summary>
      <section
        className="stack"
        aria-label="Följ överenskommelser mellan samtal"
      >
        <p>
          Gå igenom tidigare löften och öppna frågor inför samtalet. Efteråt kan
          du spara vad som uppfyllts, ändrats eller fortfarande är öppet.
        </p>
        {!items.length && (
          <p>Inga tidigare nästa steg för den valda kopplingen.</p>
        )}
        {items.map((a) => (
          <article className="recording-agreement stack" key={a.id}>
            <h3>{a.title}</h3>
            <p>
              {a.status === "done"
                ? "Uppfylld"
                : a.kind === "waiting"
                  ? "Väntar på annan"
                  : "Egen uppgift"}{" "}
              · {a.owner} · {a.date || "Utan datum"}
            </p>
            {a.source && (
              <a
                href={recordingHref({
                  recordingId: a.source.recordingId,
                  segment: a.source.segmentIndexes[0],
                })}
                target="_blank"
                rel="noopener noreferrer"
              >
                Öppna tidigare samtalsunderlag
              </a>
            )}
            {!!a.updates?.length && (
              <details>
                <summary>Överenskommelsens historik</summary>
                <ol>
                  {a.updates.map((u) => (
                    <li key={u.id}>
                      <strong>
                        {u.date} ·{" "}
                        {u.kind === "fulfilled"
                          ? "Uppfylld"
                          : u.kind === "changed"
                            ? "Ändrad"
                            : "Fortfarande öppen"}
                      </strong>
                      <p>{u.note}</p>
                      {u.previous && (
                        <p>
                          Tidigare: {u.previous.title} · {u.previous.owner} ·{" "}
                          {u.previous.date || "Utan datum"}
                        </p>
                      )}
                      {u.recordingId && (
                        <a
                          href={recordingHref({ recordingId: u.recordingId })}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Öppna uppföljningssamtalet
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {a.status === "open" && (
              <button
                className="button secondary"
                onClick={() => {
                  setDraft(a);
                  setNote("");
                  setKind("open");
                  setError("");
                }}
              >
                Följ upp överenskommelsen
              </button>
            )}
            {draft?.id === a.id && (
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await onSave(a.id, {
                      kind,
                      note,
                      recordingId,
                      title: draft.title,
                      date: draft.date,
                      owner: draft.owner,
                      reason: draft.reason,
                    });
                    setDraft(null);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Uppföljningen kunde inte sparas.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Utfall för överenskommelsen
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as typeof kind)}
                  >
                    <option value="open">Fortfarande öppen</option>
                    <option value="fulfilled">Uppfylld</option>
                    <option value="changed">Ändrad</option>
                  </select>
                </label>
                {kind === "changed" && (
                  <>
                    <label>
                      Ändrat åtagande
                      <input
                        required
                        maxLength={4000}
                        value={draft.title}
                        onChange={(e) =>
                          setDraft({ ...draft, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Nytt datum
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(e) =>
                          setDraft({ ...draft, date: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Ny ansvarig
                      <input
                        maxLength={200}
                        value={draft.owner}
                        onChange={(e) =>
                          setDraft({ ...draft, owner: e.target.value })
                        }
                      />
                    </label>
                    <p>
                      Befintliga kalenderbokningar bevaras. Kontrollera bokad
                      tid när innehållet ändras.
                    </p>
                  </>
                )}
                <label>
                  Anteckning om uppföljningen
                  <textarea
                    required
                    maxLength={4000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                {error && <p role="alert">{error}</p>}
                <div className="career-actions">
                  <button className="button primary" disabled={busy}>
                    Spara uppföljning av överenskommelsen
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setDraft(null)}
                  >
                    Avbryt uppföljning
                  </button>
                </div>
              </form>
            )}
          </article>
        ))}
      </section>
    </details>
  );
}
