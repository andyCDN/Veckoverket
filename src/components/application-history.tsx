"use client";
import { useState } from "react";
import type {
  ApplicationHistoryEntry,
  JobApplication,
  NetworkContact,
} from "@/lib/types";
import { today, uid } from "@/lib/date";
import { APPLICATION_STATUSES } from "@/lib/applications";
import { Modal } from "./modal";
const labels = {
  created: "Registrerad",
  status: "Statusändring",
  action: "Nästa steg",
  contact: "Kontakt",
  interview: "Intervju",
  feedback: "Återkoppling",
  note: "Anteckning",
};
export function ApplicationHistory({
  value,
  contacts,
  onSave,
  onClose,
}: {
  value: JobApplication;
  contacts: NetworkContact[];
  onSave: (a: JobApplication) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(today()),
    [notes, setNotes] = useState(""),
    [kind, setKind] = useState<ApplicationHistoryEntry["kind"]>("note"),
    [contactId, setContactId] = useState("");
  return (
    <Modal
      title="Ansökningshistorik"
      description={`${value.role} · ${value.organization}`}
      onClose={onClose}
    >
      <div className="stack">
        {!value.history?.length && (
          <p>
            Ingen historik registrerad. Äldre händelser kan läggas till med sitt
            ursprungliga datum.
          </p>
        )}
        <ol className="stack" aria-label="Ansökans historik">
          {[...(value.history ?? [])]
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date) ||
                b.recordedAt.localeCompare(a.recordedAt),
            )
            .map((e) => (
              <li key={e.id}>
                <strong>
                  {e.date} · {labels[e.kind]}
                  {e.kind === "created" && e.status
                    ? ` · ${APPLICATION_STATUSES[e.status]}`
                    : ""}
                </strong>
                <p className="career-notes">{e.notes}</p>
                {e.contactId && (
                  <p>
                    Kontakt:{" "}
                    {contacts.find((c) => c.id === e.contactId)?.name ??
                      "Borttagen kontakt"}
                  </p>
                )}
              </li>
            ))}
        </ol>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!notes.trim()) return;
            onSave({
              ...value,
              history: [
                ...(value.history ?? []),
                {
                  id: uid(),
                  kind,
                  date,
                  notes: notes.trim(),
                  recordedAt: new Date().toISOString(),
                  ...(contactId ? { contactId } : {}),
                },
              ],
            });
          }}
        >
          <h3>Lägg till händelse</h3>
          <label>
            Händelsetyp
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as ApplicationHistoryEntry["kind"])
              }
            >
              {(["note", "contact", "interview", "feedback"] as const).map(
                (k) => (
                  <option value={k} key={k}>
                    {labels[k]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Händelsedatum
            <input
              required
              type="date"
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Kontakt för händelsen
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">Ingen kontakt</option>
              {contacts
                .filter((c) => value.contactIds?.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.organization}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Händelseanteckning
            <textarea
              required
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <p>
            En historikhändelse ändrar inte ansökans status och skapar inget
            kalenderpass.
          </p>
          <button className="button primary">Spara händelse</button>
        </form>
      </div>
    </Modal>
  );
}
