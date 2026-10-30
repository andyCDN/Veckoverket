"use client";
import { useState } from "react";
import type {
  AppData,
  ApplicationInterview,
  JobApplication,
} from "@/lib/types";
import { addDays, parseTime, time, today, uid } from "@/lib/date";
import { documentUrl } from "@/lib/application-materials";
import { recordingHref } from "@/lib/recording-client";
import {
  interviewActivity,
  type InterviewBooking,
  type InterviewNotesInput,
} from "@/lib/application-interviews";
import { Modal } from "./modal";
export function InterviewBookingForm({
  application,
  data,
  onSave,
  onClose,
}: {
  application: JobApplication;
  data: AppData;
  onSave: (v: InterviewBooking) => string | undefined;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(
    `Intervju: ${application.role} · ${application.organization}`.slice(0, 200),
  );
  const [date, setDate] = useState(addDays(today(), 1)),
    [start, setStart] = useState(time(data.settings.start)),
    [minutes, setMinutes] = useState(60),
    [prep, setPrep] = useState(30),
    [location, setLocation] = useState(""),
    [notes, setNotes] = useState(""),
    [contactId, setContactId] = useState(""),
    [error, setError] = useState("");
  return (
    <Modal
      title="Boka intervju"
      description={`${application.role} · ${application.organization}`}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const message = onSave({
            title,
            date,
            start: parseTime(start),
            minutes,
            preparationMinutes: prep,
            location,
            preparationNotes: notes,
            ...(contactId ? { contactId } : {}),
          });
          if (message) setError(message);
        }}
      >
        <label>
          Intervjuns rubrik
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Intervjudatum
          <input
            required
            type="date"
            min={today()}
            max={addDays(today(), 366)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Intervjuns starttid
            <input
              required
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Intervjuns längd i minuter
            <input
              required
              type="number"
              min={5}
              max={480}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
        </div>
        <label>
          Plats eller möteslänk
          <input
            maxLength={1000}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label>
          Intervjukontakt
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">Ingen kontakt vald</option>
            {data.contacts
              ?.filter((c) => application.contactIds?.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Förberedelsetid i minuter
          <input
            required
            type="number"
            min={0}
            max={480}
            step={5}
            value={prep}
            onChange={(e) => setPrep(Number(e.target.value))}
          />
        </label>
        <label>
          Förberedelseanteckningar
          <textarea
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <p>
          Intervjun bokas som låst tid. Förberedelsen placeras i en ledig tid
          före intervjun. Ange 0 om inget förberedelsepass behövs. Om båda
          passen inte ryms bevaras hela planen.
        </p>
        <p>Ansökans status ändras till Intervju när bokningen sparas.</p>
        {error && <p role="alert">{error}</p>}
        <button className="button primary">
          Spara intervju och förberedelse
        </button>
      </form>
    </Modal>
  );
}
export function InterviewNotesForm({
  application,
  interview,
  data,
  onSave,
  onClose,
}: {
  application: JobApplication;
  interview: ApplicationInterview;
  data: AppData;
  onSave: (input: InterviewNotesInput, complete: boolean) => void;
  onClose: () => void;
}) {
  const [preparationNotes, setPreparationNotes] = useState(
      interview.preparationNotes,
    ),
    [outcomeNotes, setOutcomeNotes] = useState(interview.outcomeNotes),
    [nextAction, setNextAction] = useState(application.nextAction),
    [followUpDate, setFollowUpDate] = useState(application.followUpDate),
    [error, setError] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState(
      interview.feedbackNotes ?? "",
    ),
    [nextActionOwner, setNextActionOwner] = useState(
      application.nextActionOwner ?? "Jag",
    ),
    [nextActionReason, setNextActionReason] = useState(
      application.nextActionReason ?? "",
    ),
    [checklist, setChecklist] = useState(
      interview.preparationChecklist ?? [
        {
          id: "advertisement",
          title: "Läs annonsen och tjänstens krav",
          done: false,
        },
        {
          id: "materials",
          title: "Gå igenom inskickat CV och arbetsprov",
          done: false,
        },
        {
          id: "examples",
          title: "Välj exempel på relevant erfarenhet",
          done: false,
        },
        {
          id: "questions",
          title: "Förbered frågor till intervjuaren",
          done: false,
        },
      ],
    ),
    [newPoint, setNewPoint] = useState("");
  const meeting = interviewActivity(
    data,
    interview.meetingActivityId,
  )?.activity;
  const save = (complete: boolean) => {
    try {
      onSave(
        {
          preparationNotes,
          outcomeNotes,
          nextAction,
          followUpDate,
          feedbackNotes,
          preparationChecklist: checklist,
          nextActionOwner,
          nextActionReason,
        },
        complete,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Intervjun kunde inte sparas.",
      );
    }
  };
  return (
    <Modal
      title="Intervjuanteckningar"
      description={interview.title}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <p>
          {meeting?.date ?? interview.date} ·{" "}
          {time(meeting?.start ?? interview.start)}–
          {time(meeting?.end ?? interview.end)}
        </p>
        <section className="stack" aria-label="Samlat intervjuunderlag">
          <h2>Underlag inför intervjun</h2>
          <p>
            {application.role} · {application.organization}
            {interview.location ? ` · ${interview.location}` : ""}
          </p>
          <details open>
            <summary>Annons och dokumentversioner</summary>
            {application.advertisement?.url &&
              documentUrl(application.advertisement.url) && (
                <p>
                  <a
                    href={documentUrl(application.advertisement.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Öppna annons
                  </a>
                </p>
              )}
            {application.advertisement?.text ? (
              <p className="career-notes">{application.advertisement.text}</p>
            ) : (
              <p>
                Ingen annonstext sparad. Lägg till den under Dokumentunderlag.
              </p>
            )}
            {!application.materials?.length && (
              <p>Inga dokumentversioner sparade.</p>
            )}
            <ul>
              {application.materials?.map((m) => (
                <li key={m.id}>
                  {documentUrl(m.url) ? (
                    <a
                      href={documentUrl(m.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {m.title}
                    </a>
                  ) : (
                    m.title
                  )}
                  {m.version ? ` · ${m.version}` : ""}
                  {m.sentOn
                    ? ` · Skickat ${m.sentOn}`
                    : " · Inte markerat som inskickat"}
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Kontaktpersoner och tidigare anteckningar</summary>
            {data.contacts
              ?.filter(
                (c) =>
                  c.id === interview.contactId ||
                  application.contactIds?.includes(c.id),
              )
              .map((c) => (
                <section className="stack" key={c.id}>
                  <h3>
                    {c.name}
                    {c.id === interview.contactId ? " · Intervjukontakt" : ""}
                  </h3>
                  <p>{c.organization}</p>
                  {[...c.entries]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((e) => (
                      <div key={e.id}>
                        <strong>
                          {e.date} · {e.channel}
                        </strong>
                        <p className="career-notes">{e.notes}</p>
                        {e.id.startsWith("recording-") && (
                          <a
                            href={recordingHref({
                              recordingId: e.id.slice(10),
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Öppna inspelningen
                          </a>
                        )}
                      </div>
                    ))}
                </section>
              ))}
            {application.notes && (
              <p className="career-notes">{application.notes}</p>
            )}
            <ol>
              {[...(application.history ?? [])]
                .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
                .map((e) => (
                  <li key={e.id}>
                    <strong>{e.date}</strong>
                    <p className="career-notes">{e.notes}</p>
                    {e.id.startsWith("recording-") && (
                      <a
                        href={recordingHref({ recordingId: e.id.slice(10) })}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Öppna inspelningen
                      </a>
                    )}
                  </li>
                ))}
            </ol>
          </details>
          <fieldset className="stack">
            <legend>
              Förberedelsepunkter · {checklist.filter((i) => i.done).length}/
              {checklist.length}
            </legend>
            {checklist.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) =>
                    setChecklist((items) =>
                      items.map((i) =>
                        i.id === item.id ? { ...i, done: e.target.checked } : i,
                      ),
                    )
                  }
                />
                {item.title}
              </label>
            ))}
            <label>
              Ny förberedelsepunkt
              <input
                maxLength={200}
                value={newPoint}
                onChange={(e) => setNewPoint(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={!newPoint.trim() || checklist.length >= 30}
              onClick={() => {
                setChecklist((items) => [
                  ...items,
                  { id: uid(), title: newPoint.trim(), done: false },
                ]);
                setNewPoint("");
              }}
            >
              Lägg till förberedelsepunkt
            </button>
          </fieldset>
        </section>
        <label>
          Förberedelseanteckningar
          <textarea
            maxLength={4000}
            value={preparationNotes}
            onChange={(e) => setPreparationNotes(e.target.value)}
          />
        </label>
        <label>
          Anteckningar efter intervjun
          <textarea
            maxLength={4000}
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
          />
        </label>
        <label>
          Nästa steg efter intervjun
          <input
            maxLength={4000}
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
          />
        </label>
        <label>
          Återkoppling från arbetsgivaren
          <textarea
            maxLength={4000}
            value={feedbackNotes}
            onChange={(e) => setFeedbackNotes(e.target.value)}
          />
        </label>
        <label>
          Ansvarig för nästa steg
          <input
            maxLength={200}
            value={nextActionOwner}
            onChange={(e) => setNextActionOwner(e.target.value)}
          />
        </label>
        <label>
          Varför behövs nästa steg?
          <textarea
            maxLength={4000}
            value={nextActionReason}
            onChange={(e) => setNextActionReason(e.target.value)}
          />
        </label>
        <label>
          Uppföljningsdatum efter intervjun
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary">Spara intervjuanteckningar</button>
        {meeting &&
          meeting.status !== "skipped" &&
          (!interview.completedAt || meeting.status !== "done") && (
            <button
              className="button secondary"
              type="button"
              onClick={() => save(true)}
            >
              Markera intervjun genomförd
            </button>
          )}
      </form>
    </Modal>
  );
}
