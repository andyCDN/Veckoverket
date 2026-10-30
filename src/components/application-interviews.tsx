"use client";
import { useState } from "react";
import type {
  AppData,
  ApplicationInterview,
  JobApplication,
} from "@/lib/types";
import { addDays, parseTime, time, today } from "@/lib/date";
import {
  interviewActivity,
  type InterviewBooking,
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
  onSave: (
    input: {
      preparationNotes: string;
      outcomeNotes: string;
      nextAction: string;
      followUpDate: string;
    },
    complete: boolean,
  ) => void;
  onClose: () => void;
}) {
  const [preparationNotes, setPreparationNotes] = useState(
      interview.preparationNotes,
    ),
    [outcomeNotes, setOutcomeNotes] = useState(interview.outcomeNotes),
    [nextAction, setNextAction] = useState(application.nextAction),
    [followUpDate, setFollowUpDate] = useState(application.followUpDate),
    [error, setError] = useState("");
  const meeting = interviewActivity(
    data,
    interview.meetingActivityId,
  )?.activity;
  const save = (complete: boolean) => {
    try {
      onSave(
        { preparationNotes, outcomeNotes, nextAction, followUpDate },
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
