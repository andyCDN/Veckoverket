"use client";
import { useState } from "react";
import type { AppData } from "@/lib/types";
import {
  careerActions,
  careerSuggestions,
  completeCareerAction,
  saveCareerAction,
  type TrackedAction,
} from "@/lib/career-actions";
import { addDays, today, uid } from "@/lib/date";
import { recordingHref } from "@/lib/recording-client";
import { Modal } from "./modal";

export function CareerActions({
  data,
  onChange,
  onBook,
  onEditing,
}: {
  data: AppData;
  onChange: (next: AppData, base: AppData) => void;
  onBook: (action: TrackedAction) => void;
  onEditing: (editing: boolean) => void;
}) {
  const [period, setPeriod] = useState("open"),
    [draft, setDraft] = useState<TrackedAction | null>(null),
    [error, setError] = useState(""),
    [base, setBase] = useState(data);
  const all = careerActions(data),
    date = today();
  const edit = (a: TrackedAction | null) => {
    setDraft(a);
    setBase(data);
    setError("");
    onEditing(Boolean(a));
  };
  const items = all.filter((a) =>
    period === "done"
      ? a.status === "done"
      : a.status === "open" &&
        (period === "open" ||
          (period === "overdue" && a.date && a.date < date) ||
          (period === "today" && a.date === date) ||
          (period === "week" && a.date > date && a.date <= addDays(date, 7)) ||
          (period === "undated" && !a.date) ||
          (period === "mine" && (a.kind ?? "task") === "task") ||
          (period === "waiting" && a.kind === "waiting")),
  );
  return (
    <section className="stack" aria-label="Gemensamma nästa steg">
      <p>
        {
          all.filter((a) => a.status === "open" && a.date && a.date < date)
            .length
        }{" "}
        försenade uppföljningar ·{" "}
        {all.filter((a) => a.status === "open" && a.date === date).length} idag
      </p>
      <div className="career-actions">
        <label>
          Visa nästa steg
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="open">Alla öppna</option>
            <option value="overdue">Försenade</option>
            <option value="today">Idag</option>
            <option value="week">Kommande sju dagar</option>
            <option value="undated">Utan datum</option>
            <option value="mine">Egna uppgifter</option>
            <option value="waiting">Väntar på andra</option>
            <option value="done">Avklarade</option>
          </select>
        </label>
        <button
          className="button primary"
          disabled={!data.applications?.length && !data.contacts?.length}
          onClick={() =>
            edit({
              id: uid(),
              title: "",
              date: "",
              owner: "Jag",
              reason: "",
              status: "open",
              ...(data.applications?.length
                ? { applicationId: data.applications[0].id }
                : { contactId: data.contacts?.[0].id }),
            })
          }
        >
          Nytt nästa steg
        </button>
      </div>
      {!items.length && <p>Inga nästa steg matchar urvalet.</p>}
      <div className="career-cards">
        {items.map((a) => {
          const app = data.applications?.find((v) => v.id === a.applicationId),
            contact = data.contacts?.find((v) => v.id === a.contactId);
          const booked = Object.values(data.weeks)
            .flatMap((p) => p.activities)
            .filter((v) => v.careerActionId === a.id && v.status === "planned");
          return (
            <article className="career-card stack" key={a.id}>
              <h2>{a.title}</h2>
              <p>
                {a.kind === "waiting"
                  ? "Bevakning · väntar på annan"
                  : "Egen uppgift"}
              </p>
              <p>
                {app
                  ? `${app.role} · ${app.organization}`
                  : a.applicationId
                    ? "Borttagen ansökan"
                    : ""}
                {a.applicationId && a.contactId ? " · " : ""}
                {contact?.name ?? (a.contactId ? "Borttagen kontakt" : "")}
              </p>
              <p>
                {a.date || "Datum saknas"}
                {a.date && a.date < date && a.status === "open"
                  ? " · Försenad"
                  : ""}{" "}
                · Ansvarig: {a.owner || "Ej fastställt"}
              </p>
              <p className="career-notes">
                Varför:{" "}
                {a.reason ||
                  "Orsak saknas. Lägg till den under Redigera nästa steg."}
              </p>
              {a.source && (
                <>
                  <blockquote>{a.source.evidence}</blockquote>
                  <a
                    href={recordingHref({
                      recordingId: a.source.recordingId,
                      segment: a.source.segmentIndexes[0],
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Öppna citatets ljuddel {a.source.segmentIndexes[0] + 1}
                  </a>
                </>
              )}
              {booked.map((v) => (
                <p key={v.id}>Bokat: {v.date}</p>
              ))}
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
                            Tidigare: {u.previous.title} ·{" "}
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
                <div className="career-actions">
                  <button className="button secondary" onClick={() => edit(a)}>
                    Redigera nästa steg
                  </button>
                  <button
                    className="button secondary"
                    disabled={!!booked.length}
                    onClick={() => onBook(a)}
                  >
                    Boka nästa steg
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      onChange(completeCareerAction(data, a.id), data)
                    }
                  >
                    Markera nästa steg klart
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <details>
        <summary>Saknar nästa steg ({careerSuggestions(data).length})</summary>
        <p>
          Förslagen sparas först när du granskar dem och väljer Spara nästa
          steg.
        </p>
        {careerSuggestions(data).map((a) => (
          <div className="career-card stack" key={a.id}>
            <p>
              {a.title} ·{" "}
              {data.applications?.find((v) => v.id === a.applicationId)
                ?.organization ??
                data.contacts?.find((v) => v.id === a.contactId)?.organization}
            </p>
            <p>{a.reason}</p>
            <button className="button secondary" onClick={() => edit(a)}>
              Granska förslag
            </button>
          </div>
        ))}
      </details>
      {draft && (
        <Modal title="Redigera nästa steg" onClose={() => edit(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                if (JSON.stringify(base) !== JSON.stringify(data))
                  throw new Error(
                    "Arbetsytan har ändrats. Stäng och öppna nästa steg igen.",
                  );
                onChange(saveCareerAction(base, draft), base);
                edit(null);
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Nästa steg kunde inte sparas.",
                );
              }
            }}
          >
            {!draft.legacy && !draft.source && (
              <label>
                Koppla till
                <select
                  value={
                    draft.applicationId
                      ? `a:${draft.applicationId}`
                      : `c:${draft.contactId}`
                  }
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      applicationId: e.target.value.startsWith("a:")
                        ? e.target.value.slice(2)
                        : undefined,
                      contactId: e.target.value.startsWith("c:")
                        ? e.target.value.slice(2)
                        : undefined,
                    })
                  }
                >
                  {data.applications?.map((a) => (
                    <option key={`a:${a.id}`} value={`a:${a.id}`}>
                      {a.role} · {a.organization}
                    </option>
                  ))}
                  {data.contacts?.map((c) => (
                    <option key={`c:${c.id}`} value={`c:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Åtgärd
              <input
                required
                maxLength={4000}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Datum för nästa steg
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label>
              Ansvarig
              <input
                maxLength={200}
                value={draft.owner}
                onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              />
            </label>
            <label>
              Typ av nästa steg
              <select
                value={draft.kind ?? "task"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value as "task" | "waiting",
                  })
                }
              >
                <option value="task">Egen uppgift</option>
                <option value="waiting">Väntar på annan</option>
              </select>
            </label>
            <label>
              Varför behövs steget?
              <textarea
                maxLength={4000}
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <button className="button primary">Spara nästa steg</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
