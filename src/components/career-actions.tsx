"use client";
import { useEffect, useState } from "react";
import type { Activity, AppData } from "@/lib/types";
import { ActionControl, ActionKindSelector } from "./action-control";
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
  scope,
  onOpen,
  initialActionId,
}: {
  data: AppData;
  onChange: (next: AppData, base: AppData) => void;
  onBook: (action: TrackedAction) => void;
  onEditing: (editing: boolean) => void;
  scope: "jobs" | "network";
  onOpen: (activity: Activity) => void;
  initialActionId?: string;
}) {
  const [period, setPeriod] = useState("open"),
    [draft, setDraft] = useState<TrackedAction | null>(null),
    [error, setError] = useState(""),
    [base, setBase] = useState(data);
  useEffect(() => {
    if (!initialActionId) return;
    const card = document.getElementById(`action-${initialActionId}`);
    card?.scrollIntoView({ block: "center", behavior: "instant" });
    card?.focus({ preventScroll: true });
  }, [initialActionId]);
  const inScope = (action: TrackedAction) =>
    scope === "jobs"
      ? Boolean(action.applicationId)
      : Boolean(action.contactId);
  const applications = scope === "jobs" ? (data.applications ?? []) : [];
  const contacts = scope === "network" ? (data.contacts ?? []) : [];
  const suggestions = careerSuggestions(data).filter(inScope);
  const all = careerActions(data).filter(inScope),
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
    <section
      className="stack"
      aria-label={
        scope === "jobs"
          ? "Nästa steg för ansökningar"
          : "Uppföljningar för kontakter"
      }
    >
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
          disabled={!applications.length && !contacts.length}
          onClick={() =>
            edit({
              id: uid(),
              title: "",
              date: "",
              owner: "Jag",
              reason: "",
              status: "open",
              ...(applications.length
                ? { applicationId: applications[0].id }
                : { contactId: contacts[0]?.id }),
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
          return (
            <article
              className="career-card stack"
              key={a.id}
              id={`action-${a.id}`}
              tabIndex={-1}
            >
              <h2>{a.title}</h2>
              <p>
                {app
                  ? `${app.role} · ${app.organization}`
                  : a.applicationId
                    ? "Borttagen ansökan"
                    : ""}
                {a.applicationId && a.contactId ? " · " : ""}
                {contact?.name ?? (a.contactId ? "Borttagen kontakt" : "")}
              </p>
              <ActionControl
                data={data}
                action={a}
                onOpen={onOpen}
                onEdit={() => edit(a)}
                onBook={() => onBook(a)}
                onComplete={() =>
                  onChange(completeCareerAction(data, a.id), data)
                }
              />
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
            </article>
          );
        })}
      </div>
      <details>
        <summary>Saknar nästa steg ({suggestions.length})</summary>
        <p>
          Förslagen sparas först när du granskar dem och väljer Spara nästa
          steg.
        </p>
        {suggestions.map((a) => (
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
                  {applications.map((a) => (
                    <option key={`a:${a.id}`} value={`a:${a.id}`}>
                      {a.role} · {a.organization}
                    </option>
                  ))}
                  {contacts.map((c) => (
                    <option key={`c:${c.id}`} value={`c:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ActionKindSelector
              value={draft.kind}
              onChange={(kind) =>
                setDraft({
                  ...draft,
                  kind,
                  owner:
                    kind === "waiting" && draft.owner === "Jag"
                      ? ""
                      : draft.owner,
                })
              }
            />
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
              {draft.kind === "waiting" ? "Bevakningsdatum" : "Klart senast"}
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label>
              {draft.kind === "waiting" ? "Väntar på" : "Ansvarig"}
              <input
                maxLength={200}
                value={draft.owner}
                onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              />
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
