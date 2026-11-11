"use client";
import { useState } from "react";
import type { Activity, AppData, NetworkContact } from "@/lib/types";
import type { TrackedAction } from "@/lib/career-actions";
import {
  contactTimeline,
  networkGroups,
  type ContactLogInput,
} from "@/lib/network-overview";
import { today, fullDate, time } from "@/lib/date";
import { recordingHref } from "@/lib/recording-client";
import { ActionControl, ActionKindSelector } from "./action-control";
import { Modal } from "./modal";

export function NetworkContacts({
  data,
  onEdit,
  onLog,
  onOpen,
  onBook,
  onComplete,
  onEditAction,
  onActions,
  onBookContact,
  initialContactId,
  firstStep,
}: {
  data: AppData;
  initialContactId?: string;
  firstStep?: string;
  onEdit: (c: NetworkContact) => void;
  onLog: (c: NetworkContact) => void;
  onOpen: (a: Activity) => void;
  onBook: (a: TrackedAction) => void;
  onComplete: (a: TrackedAction) => void;
  onEditAction: (a: TrackedAction) => void;
  onActions: () => void;
  onBookContact: (c: NetworkContact) => void;
}) {
  const [query, setQuery] = useState("");
  const [focusedId, setFocusedId] = useState(initialContactId);
  const groups = networkGroups(data)
    .map((g) => ({
      ...g,
      contacts: g.contacts.filter(
        ({ contact: c }) =>
          (!focusedId || c.id === focusedId) &&
          `${c.name} ${c.organization}`
            .toLocaleLowerCase("sv-SE")
            .includes(query.toLocaleLowerCase("sv-SE").trim()),
      ),
    }))
    .filter((g) => g.contacts.length);
  return (
    <div className="network-overview">
      <label className="network-search">
        Sök kontakter
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setFocusedId(undefined);
            setQuery(e.target.value);
          }}
          placeholder="Namn eller organisation"
        />
      </label>
      {focusedId && (
        <button
          className="text-button"
          onClick={() => {
            setFocusedId(undefined);
            setQuery("");
          }}
        >
          Visa alla kontakter
        </button>
      )}
      {!groups.length && (
        <p>
          {data.contacts?.length
            ? "Inga kontakter matchar sökningen."
            : "Inga kontakter registrerade."}
        </p>
      )}
      {groups.map((group) => (
        <section
          key={group.id}
          aria-label={group.title}
          className="network-group"
        >
          <h2>
            {group.title} <span>{group.contacts.length}</span>
          </h2>
          <div className="career-cards">
            {group.contacts.map(({ contact: c, step }) => {
              const timeline = contactTimeline(data, c);
              const lastContact = [...c.entries]
                .reverse()
                .filter((e) => e.date <= today())
                .sort((a, b) => b.date.localeCompare(a.date))[0];
              return (
                <article
                  className="career-card stack"
                  key={c.id}
                  aria-label={c.name}
                >
                  <h3 className="network-contact-name">
                    {c.name}
                    {c.organization && ` · ${c.organization}`}
                  </h3>
                  {c.id === initialContactId && firstStep && (
                    <p className="check-in-plan">
                      <strong>Första lilla steget</strong>
                      <br />
                      {firstStep}
                    </p>
                  )}
                  <p className="network-last-contact">
                    {lastContact
                      ? `Senaste kontakt: ${fullDate(lastContact.date)} · ${lastContact.channel || "Anteckning"}`
                      : "Ingen kontakt loggad ännu"}
                  </p>
                  <div className="application-next-step">
                    <h4>
                      {step?.kind === "waiting"
                        ? `Väntar på ${step.owner && step.owner !== "Jag" ? step.owner : "svar"}`
                        : "Nästa steg"}
                    </h4>
                    <p>{step?.title || "Välj vad du vill göra härnäst."}</p>
                    {step?.date && (
                      <p className="network-step-date">
                        {step.kind === "waiting" ? "Följ upp" : "Klart senast"}:{" "}
                        {fullDate(step.date)}
                      </p>
                    )}
                    {step ? (
                      <ActionControl
                        data={data}
                        action={step}
                        onOpen={onOpen}
                        onBook={() => onBook(step)}
                        onEdit={() =>
                          step.legacy === "contact"
                            ? onEdit(c)
                            : onEditAction(step)
                        }
                        editLabel={
                          step.legacy === "contact"
                            ? "Redigera kontakt och logg"
                            : "Visa nästa steg"
                        }
                        onComplete={() => onComplete(step)}
                      />
                    ) : (
                      <button
                        className="button secondary"
                        onClick={() => onEdit(c)}
                      >
                        Lägg till nästa steg
                      </button>
                    )}
                  </div>
                  <div className="career-actions">
                    <button className="button primary" onClick={() => onLog(c)}>
                      Logga samtal/mejl
                    </button>
                    {step?.legacy !== "contact" && (
                      <button className="text-button" onClick={() => onEdit(c)}>
                        Redigera kontakt och logg
                      </button>
                    )}
                  </div>
                  {(data.careerActions ?? []).some(
                    (a) => a.contactId === c.id && a.status === "open",
                  ) && (
                    <button className="text-button" onClick={onActions}>
                      Visa alla kopplade nästa steg
                    </button>
                  )}
                  <details
                    className="application-details network-timeline"
                    open={c.id === initialContactId ? true : undefined}
                  >
                    <summary>Tidslinje · {timeline.length} händelser</summary>
                    <div className="career-actions">
                      <a
                        className="button secondary"
                        href={recordingHref({ contactId: c.id })}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Spela in samtal
                      </a>
                      {!step && (
                        <button
                          className="button secondary"
                          onClick={() => onBookContact(c)}
                        >
                          Boka kontakt
                        </button>
                      )}
                    </div>
                    {!timeline.length && (
                      <p>
                        Här samlas samtal, mejl, anteckningar, kalenderpass och
                        överenskommelser.
                      </p>
                    )}
                    <ol>
                      {timeline.map((event) => (
                        <li key={event.id}>
                          <small>
                            {fullDate(event.date.slice(0, 10))}
                            {event.activity &&
                              ` · ${time(event.activity.start)}`}
                          </small>
                          <strong>{event.title}</strong>
                          {event.notes && (
                            <p className="career-notes">{event.notes}</p>
                          )}
                          {event.activity && (
                            <button
                              className="text-button"
                              onClick={() => onOpen(event.activity!)}
                            >
                              Öppna kalenderpass
                            </button>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ContactLogForm({
  contact,
  onClose,
  onSave,
}: {
  contact: NetworkContact;
  onClose: () => void;
  onSave: (input: ContactLogInput) => void;
}) {
  const [error, setError] = useState("");
  const [date, setDate] = useState(today());
  const [channel, setChannel] = useState("Telefon");
  const [notes, setNotes] = useState("");
  const [update, setUpdate] = useState(false);
  const [title, setTitle] = useState(contact.nextAction);
  const [due, setDue] = useState(contact.followUpDate);
  const [kind, setKind] = useState<"task" | "waiting">(
    contact.nextActionKind ?? "task",
  );
  const [owner, setOwner] = useState(contact.nextActionOwner ?? "Jag");
  return (
    <Modal title={`Logga kontakt med ${contact.name}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          try {
            if (notes.trim() && (!update || title.trim()))
              onSave({
                date,
                channel,
                notes,
                ...(update ? { next: { title, date: due, kind, owner } } : {}),
              });
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Kontaktloggen kunde inte sparas.",
            );
          }
        }}
      >
        <label>
          Datum
          <input
            type="date"
            required
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Kanal
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {["Telefon", "E-post", "Möte", "Meddelande", "Anteckning"].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Kort anteckning
          <textarea
            required
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Vad pratade ni om eller kom ni överens om?"
          />
        </label>
        <label className="network-update-toggle">
          <input
            type="checkbox"
            checked={update}
            onChange={(e) => setUpdate(e.target.checked)}
          />
          Uppdatera nästa steg
        </label>
        {update && (
          <fieldset className="stack">
            <legend>Nästa steg</legend>
            <ActionKindSelector
              value={kind}
              onChange={(v) => {
                setKind(v);
                if (v === "waiting" && owner === "Jag") setOwner("");
              }}
            />
            <label>
              Nästa steg
              <input
                required
                maxLength={4000}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              {kind === "waiting" ? "Väntar på" : "Ansvarig"}
              <input
                required
                maxLength={200}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </label>
            <label>
              {kind === "waiting" ? "Bevakningsdatum" : "Klart senast"}
              <input
                type="date"
                required
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
          </fieldset>
        )}
        <p className="muted">
          Anteckningen sparas i tidslinjen. Kalendern ändras inte.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="button primary">Spara kontaktlogg</button>
      </form>
    </Modal>
  );
}
