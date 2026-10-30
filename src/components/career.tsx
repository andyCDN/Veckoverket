"use client";
import { useLayoutEffect, useState } from "react";
import type {
  Activity,
  AppData,
  Deadline,
  JobApplication,
  NetworkContact,
} from "@/lib/types";
import {
  addDays,
  parseTime,
  planningBoundary,
  time,
  today,
  uid,
} from "@/lib/date";
import {
  bookCareerActivity,
  planDeadline,
  replanDay,
  type PlanningPreview,
} from "@/lib/career-planning";
import { Modal } from "./modal";

const statuses = {
  draft: "Utkast",
  sent: "Skickad",
  interview: "Intervju",
  offer: "Erbjudande",
  rejected: "Avslag",
  closed: "Avslutad",
} as const;
type Props = {
  data: AppData;
  onChange: (next: AppData, base: AppData) => void;
  onOpen: (activity: Activity) => void;
  onEditing: (editing: boolean) => void;
};

export function CareerView({ data, onChange, onOpen, onEditing }: Props) {
  const [tab, setTab] = useState("applications");
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [contact, setContact] = useState<NetworkContact | null>(null);
  const [deadline, setDeadline] = useState<Deadline | null>(null);
  const [booking, setBooking] = useState<{
    title: string;
    date: string;
    applicationId?: string;
    contactId?: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    result: PlanningPreview;
    base: AppData;
    label: string;
  } | null>(null);
  const editing = Boolean(
    application || contact || deadline || booking || preview,
  );
  useLayoutEffect(() => {
    onEditing(editing);
    return () => onEditing(false);
  }, [editing, onEditing]);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const applications = data.applications ?? [],
    contacts = data.contacts ?? [],
    deadlines = data.deadlines ?? [];
  const all = Object.values(data.weeks).flatMap((p) => p.activities);
  const showPreview = (result: PlanningPreview, label: string) =>
    setPreview({ result, base: data, label });
  const linked = (
    kind: "applicationId" | "contactId" | "deadlineId",
    id: string,
  ) =>
    all
      .filter((a) => a[kind] === id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const passes = (items: Activity[]) => (
    <ul className="career-passes">
      {items.map((a) => (
        <li key={`${a.date}-${a.id}`}>
          <button className="text-button" onClick={() => onOpen(a)}>
            {a.date} {time(a.start)} · {a.title} ·{" "}
            {a.status === "done"
              ? "Genomförd"
              : a.status === "skipped"
                ? "Blev inte av"
                : "Planerad"}
          </button>
        </li>
      ))}
    </ul>
  );
  const nextDate = (date: string) => (date && date >= today() ? date : today());
  return (
    <section className="career-view stack" aria-label="Jobb och nätverk">
      <p>
        Ansökningar, kontakter och deadlines sparas med din arbetsyta.
        Kalenderpassen använder befintliga bokningar och planeringsregler.
      </p>
      <div className="career-tabs" role="group" aria-label="Visa jobböversikt">
        {[
          ["applications", "Ansökningar"],
          ["contacts", "Kontaktlogg"],
          ["deadlines", "Deadlines"],
        ].map(([id, label]) => (
          <button
            className="button secondary"
            key={id}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setMessage("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
      {tab === "applications" && (
        <>
          <div className="career-actions">
            <button
              className="button primary"
              onClick={() =>
                setApplication({
                  id: uid(),
                  organization: "",
                  role: "",
                  status: "draft",
                  deadline: "",
                  nextAction: "",
                  followUpDate: "",
                  notes: "",
                })
              }
            >
              Ny ansökan
            </button>
            <label>
              Filtrera status
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Alla statusar</option>
                {Object.entries(statuses).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            {applications.length} ansökningar ·{" "}
            {applications.filter((a) => a.status === "sent").length} skickade ·{" "}
            {applications.filter((a) => a.status === "interview").length}{" "}
            intervjuer
          </p>
          {!applications.length && <p>Inga ansökningar registrerade.</p>}
          <div className="career-cards">
            {applications
              .filter((a) => filter === "all" || a.status === filter)
              .sort((a, b) =>
                (a.followUpDate || a.deadline || "9999").localeCompare(
                  b.followUpDate || b.deadline || "9999",
                ),
              )
              .map((a) => (
                <article className="career-card stack" key={a.id}>
                  <h2>
                    {a.role} · {a.organization}
                  </h2>
                  <p>{statuses[a.status]}</p>
                  {a.deadline && <p>Deadline: {a.deadline}</p>}
                  {a.followUpDate && (
                    <p>
                      Uppföljning: {a.followUpDate}
                      {a.followUpDate < today() && " · Datum passerat"}
                    </p>
                  )}
                  {a.nextAction && <p>Nästa steg: {a.nextAction}</p>}
                  {a.notes && <p className="career-notes">{a.notes}</p>}
                  <div className="career-actions">
                    <button
                      className="button secondary"
                      onClick={() => setApplication(a)}
                    >
                      Redigera ansökan
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        setBooking({
                          title:
                            a.nextAction ||
                            `Följ upp ${a.role} · ${a.organization}`,
                          date: nextDate(a.followUpDate),
                          applicationId: a.id,
                        })
                      }
                    >
                      Boka uppföljning
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        setDeadline({
                          id: uid(),
                          title: `${a.role} · ${a.organization}`,
                          date: nextDate(a.deadline),
                          minute: data.settings.end,
                          categoryId: data.categories.some(
                            (c) => c.id === "career",
                          )
                            ? "career"
                            : data.categories[0].id,
                          applicationId: a.id,
                          steps: [],
                        })
                      }
                    >
                      Planera från deadline
                    </button>
                  </div>
                  {passes(linked("applicationId", a.id))}
                </article>
              ))}
          </div>
        </>
      )}
      {tab === "contacts" && (
        <>
          <button
            className="button primary"
            onClick={() =>
              setContact({
                id: uid(),
                name: "",
                organization: "",
                nextAction: "",
                followUpDate: "",
                entries: [],
              })
            }
          >
            Ny kontakt
          </button>
          {!contacts.length && <p>Inga kontakter registrerade.</p>}
          <div className="career-cards">
            {[...contacts]
              .sort((a, b) =>
                (a.followUpDate || "9999").localeCompare(
                  b.followUpDate || "9999",
                ),
              )
              .map((c) => (
                <article className="career-card stack" key={c.id}>
                  <h2>
                    {c.name}
                    {c.organization && ` · ${c.organization}`}
                  </h2>
                  {c.nextAction && <p>Nästa steg: {c.nextAction}</p>}
                  {c.followUpDate && (
                    <p>
                      Uppföljning: {c.followUpDate}
                      {c.followUpDate < today() && " · Datum passerat"}
                    </p>
                  )}
                  <div className="career-actions">
                    <button
                      className="button secondary"
                      onClick={() => setContact(c)}
                    >
                      Redigera kontakt och logg
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        setBooking({
                          title: c.nextAction || `Kontakt med ${c.name}`,
                          date: nextDate(c.followUpDate),
                          contactId: c.id,
                        })
                      }
                    >
                      Boka kontakt
                    </button>
                  </div>
                  <ol>
                    {[...c.entries]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((e) => (
                        <li key={e.id}>
                          <strong>
                            {e.date} · {e.channel}
                          </strong>
                          <p className="career-notes">{e.notes}</p>
                        </li>
                      ))}
                  </ol>
                  {passes(linked("contactId", c.id))}
                </article>
              ))}
          </div>
        </>
      )}
      {tab === "deadlines" && (
        <>
          <button
            className="button primary"
            onClick={() =>
              setDeadline({
                id: uid(),
                title: "",
                date: addDays(today(), 7),
                minute: data.settings.end,
                categoryId:
                  data.categories.find((c) => c.id === "career")?.id ??
                  data.categories[0].id,
                steps: [],
              })
            }
          >
            Ny deadline
          </button>
          <p>
            Delsteg planeras i angiven ordning, bakåt från sluttiden, i lediga
            tider. Befintliga aktiviteter flyttas inte. Nya veckor får låsta
            reservationer, skyddade pass och återkommande aktiviteter.
          </p>
          {!deadlines.length && <p>Inga deadlines registrerade.</p>}
          {deadlines.map((d) => (
            <article className="career-card stack" key={d.id}>
              <h2>{d.title}</h2>
              <p>
                {d.date} kl. {time(d.minute)}
              </p>
              <ol>
                {d.steps.map((s) => (
                  <li key={s.id}>
                    {s.title} · {s.minutes} min
                  </li>
                ))}
              </ol>
              <div className="career-actions">
                <button
                  className="button secondary"
                  onClick={() => setDeadline(d)}
                >
                  Redigera deadline
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    showPreview(planDeadline(data, d), "Bakåtplanering")
                  }
                >
                  Förhandsvisa bakåtplanering
                </button>
              </div>
              {passes(linked("deadlineId", d.id))}
            </article>
          ))}
        </>
      )}
      <section className="career-card stack">
        <h2>Omplanera resten av dagen</h2>
        <p>
          Flyttbara, flexibla pass som inte har börjat ordnas efter prioritet
          från aktuell tid i Stockholm. Genomförda, påbörjade, skyddade och
          låsta pass samt andra dagar bevaras. Förslaget sparas först när du
          använder det.
        </p>
        <button
          className="button secondary"
          onClick={() => showPreview(replanDay(data), "Resten av dagen")}
        >
          Förhandsvisa dagens omplanering
        </button>
      </section>
      {application && (
        <ApplicationForm
          value={application}
          onClose={() => setApplication(null)}
          onSave={(a) => {
            onChange(
              {
                ...data,
                applications: [...applications.filter((x) => x.id !== a.id), a],
              },
              data,
            );
            setApplication(null);
          }}
          onDelete={() => {
            if (
              window.confirm(
                "Ta bort ansökan? Kalenderpass och deadlines bevaras.",
              )
            ) {
              onChange(
                {
                  ...data,
                  applications: applications.filter(
                    (a) => a.id !== application.id,
                  ),
                },
                data,
              );
              setApplication(null);
            }
          }}
        />
      )}
      {contact && (
        <ContactForm
          value={contact}
          onClose={() => setContact(null)}
          onSave={(c) => {
            onChange(
              {
                ...data,
                contacts: [...contacts.filter((x) => x.id !== c.id), c],
              },
              data,
            );
            setContact(null);
          }}
          onDelete={() => {
            if (
              window.confirm(
                "Ta bort kontakten och kontaktloggen? Kalenderpass bevaras.",
              )
            ) {
              onChange(
                {
                  ...data,
                  contacts: contacts.filter((c) => c.id !== contact.id),
                },
                data,
              );
              setContact(null);
            }
          }}
        />
      )}
      {deadline && (
        <DeadlineForm
          value={deadline}
          data={data}
          onClose={() => setDeadline(null)}
          onSave={(d) => {
            onChange(
              {
                ...data,
                deadlines: [...deadlines.filter((x) => x.id !== d.id), d],
              },
              data,
            );
            setDeadline(null);
            setMessage(
              "Deadlinen är sparad. Förhandsvisa bakåtplaneringen under Deadlines.",
            );
            setTab("deadlines");
          }}
          onDelete={() => {
            if (window.confirm("Ta bort deadlinen? Kalenderpass bevaras.")) {
              onChange(
                {
                  ...data,
                  deadlines: deadlines.filter((d) => d.id !== deadline.id),
                },
                data,
              );
              setDeadline(null);
            }
          }}
        />
      )}
      {booking && (
        <BookingForm
          data={data}
          value={booking}
          onClose={() => setBooking(null)}
          onSave={(next) => {
            onChange(next, data);
            setBooking(null);
            setMessage("Passet är sparat i kalendern.");
          }}
        />
      )}
      {preview && (
        <Modal title={preview.label} onClose={() => setPreview(null)}>
          <div className="stack">
            {preview.result.errors.map((e) => (
              <p role="alert" key={e}>
                {e}
              </p>
            ))}
            {!preview.result.errors.length &&
              !preview.result.activities.length && (
                <p>Inga ändringar behövs.</p>
              )}
            {preview.result.activities.map((a) => (
              <p key={a.id}>
                {a.title} · {a.date} {time(a.start)}–{time(a.end)}
              </p>
            ))}
            <button
              className="button primary"
              disabled={
                !!preview.result.errors.length ||
                !preview.result.activities.length ||
                JSON.stringify(preview.base) !== JSON.stringify(data) ||
                preview.result.activities.some(
                  (a) =>
                    a.date === today() && a.start < planningBoundary().minute,
                )
              }
              onClick={() => {
                const boundary = planningBoundary();
                if (
                  preview.result.activities.some(
                    (a) =>
                      a.date < boundary.date ||
                      (a.date === boundary.date && a.start < boundary.minute),
                  )
                ) {
                  setMessage("Tiden har ändrats. Skapa en ny förhandsvisning.");
                  setPreview(null);
                  return;
                }
                onChange(preview.result.data, preview.base);
                setPreview(null);
              }}
            >
              Använd förslaget
            </button>
            <p>
              Om arbetsytan eller tiden har ändrats, stäng och skapa en ny
              förhandsvisning.
            </p>
          </div>
        </Modal>
      )}
    </section>
  );
}

function ApplicationForm({
  value,
  onSave,
  onClose,
  onDelete,
}: {
  value: JobApplication;
  onSave: (v: JobApplication) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [v, set] = useState(value);
  const field = (
    key:
      | "organization"
      | "role"
      | "deadline"
      | "followUpDate"
      | "nextAction"
      | "notes",
    label: string,
    type = "text",
  ) => (
    <label>
      {label}
      <input
        type={type}
        required={key === "organization" || key === "role"}
        maxLength={key === "organization" || key === "role" ? 200 : 4000}
        value={v[key]}
        onChange={(e) => set({ ...v, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <Modal title="Ansökan" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.organization.trim() && v.role.trim())
            onSave({
              ...v,
              organization: v.organization.trim(),
              role: v.role.trim(),
            });
        }}
      >
        {field("organization", "Organisation")}
        {field("role", "Tjänst")}
        <label>
          Status
          <select
            value={v.status}
            onChange={(e) =>
              set({ ...v, status: e.target.value as JobApplication["status"] })
            }
          >
            {Object.entries(statuses).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          {field("deadline", "Ansökningsdeadline", "date")}
          {field("followUpDate", "Uppföljningsdatum", "date")}
        </div>
        {field("nextAction", "Nästa steg")}
        {field("notes", "Anteckningar")}
        <button className="button primary">Spara ansökan</button>
        <button className="button secondary" type="button" onClick={onDelete}>
          Ta bort ansökan
        </button>
      </form>
    </Modal>
  );
}

function ContactForm({
  value,
  onSave,
  onClose,
  onDelete,
}: {
  value: NetworkContact;
  onSave: (v: NetworkContact) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [v, set] = useState(() => structuredClone(value));
  return (
    <Modal title="Kontakt och logg" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.name.trim()) onSave({ ...v, name: v.name.trim() });
        }}
      >
        <label>
          Namn
          <input
            required
            maxLength={200}
            value={v.name}
            onChange={(e) => set({ ...v, name: e.target.value })}
          />
        </label>
        <label>
          Organisation
          <input
            maxLength={200}
            value={v.organization}
            onChange={(e) => set({ ...v, organization: e.target.value })}
          />
        </label>
        <label>
          Nästa steg
          <input
            maxLength={4000}
            value={v.nextAction}
            onChange={(e) => set({ ...v, nextAction: e.target.value })}
          />
        </label>
        <label>
          Uppföljningsdatum
          <input
            type="date"
            value={v.followUpDate}
            onChange={(e) => set({ ...v, followUpDate: e.target.value })}
          />
        </label>
        <h3>Kontaktlogg</h3>
        {v.entries.map((entry, i) => (
          <fieldset className="stack" key={entry.id}>
            <legend>Kontakt {i + 1}</legend>
            <label>
              Datum
              <input
                required
                type="date"
                value={entry.date}
                onChange={(e) =>
                  set({
                    ...v,
                    entries: v.entries.map((x) =>
                      x.id === entry.id ? { ...x, date: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              Kanal
              <input
                maxLength={200}
                value={entry.channel}
                placeholder="E-post, telefon eller möte"
                onChange={(e) =>
                  set({
                    ...v,
                    entries: v.entries.map((x) =>
                      x.id === entry.id ? { ...x, channel: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              Anteckning
              <textarea
                maxLength={4000}
                value={entry.notes}
                onChange={(e) =>
                  set({
                    ...v,
                    entries: v.entries.map((x) =>
                      x.id === entry.id ? { ...x, notes: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                set({
                  ...v,
                  entries: v.entries.filter((x) => x.id !== entry.id),
                })
              }
            >
              Ta bort loggrad {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          className="button secondary"
          type="button"
          onClick={() =>
            set({
              ...v,
              entries: [
                ...v.entries,
                { id: uid(), date: today(), channel: "", notes: "" },
              ],
            })
          }
        >
          Lägg till kontaktanteckning
        </button>
        <button className="button primary">Spara kontakt</button>
        <button type="button" className="button secondary" onClick={onDelete}>
          Ta bort kontakt
        </button>
      </form>
    </Modal>
  );
}

function DeadlineForm({
  value,
  data,
  onSave,
  onClose,
  onDelete,
}: {
  value: Deadline;
  data: AppData;
  onSave: (v: Deadline) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [v, set] = useState(() => ({
    ...value,
    steps: value.steps.length
      ? value.steps
      : [{ id: uid(), title: "", minutes: 60 }],
  }));
  return (
    <Modal title="Deadline och delsteg" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.title.trim() && v.steps.every((s) => s.title.trim())) onSave(v);
        }}
      >
        <label>
          Rubrik
          <input
            required
            maxLength={200}
            value={v.title}
            onChange={(e) => set({ ...v, title: e.target.value })}
          />
        </label>
        <div className="form-row">
          <label>
            Deadline
            <input
              required
              type="date"
              min={today()}
              max={addDays(today(), 366)}
              value={v.date}
              onChange={(e) => set({ ...v, date: e.target.value })}
            />
          </label>
          <label>
            Sluttid
            <input
              required
              type="time"
              value={time(v.minute)}
              onChange={(e) => set({ ...v, minute: parseTime(e.target.value) })}
            />
          </label>
        </div>
        <label>
          Livsområde
          <select
            value={v.categoryId}
            onChange={(e) => set({ ...v, categoryId: e.target.value })}
          >
            {data.categories
              .filter((c) => c.id !== "google-calendar")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <p>Ange delstegen i den ordning de ska utföras.</p>
        {v.steps.map((s, i) => (
          <fieldset className="stack" key={s.id}>
            <legend>Delsteg {i + 1}</legend>
            <label>
              Delstegets namn
              <input
                required
                maxLength={200}
                value={s.title}
                onChange={(e) =>
                  set({
                    ...v,
                    steps: v.steps.map((x) =>
                      x.id === s.id ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label>
              Minuter
              <input
                required
                type="number"
                min={5}
                max={480}
                step={5}
                value={s.minutes}
                onChange={(e) =>
                  set({
                    ...v,
                    steps: v.steps.map((x) =>
                      x.id === s.id
                        ? { ...x, minutes: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={v.steps.length === 1}
              onClick={() =>
                set({ ...v, steps: v.steps.filter((x) => x.id !== s.id) })
              }
            >
              Ta bort delsteg {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          className="button secondary"
          type="button"
          disabled={v.steps.length >= 30}
          onClick={() =>
            set({
              ...v,
              steps: [...v.steps, { id: uid(), title: "", minutes: 60 }],
            })
          }
        >
          Lägg till delsteg
        </button>
        <button className="button primary">Spara deadline</button>
        <button type="button" className="button secondary" onClick={onDelete}>
          Ta bort deadline
        </button>
      </form>
    </Modal>
  );
}

function BookingForm({
  data,
  value,
  onSave,
  onClose,
}: {
  data: AppData;
  value: {
    title: string;
    date: string;
    applicationId?: string;
    contactId?: string;
  };
  onSave: (v: AppData) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(value.date),
    [start, setStart] = useState("09:00"),
    [minutes, setMinutes] = useState(30),
    [title, setTitle] = useState(value.title),
    [category, setCategory] = useState(
      data.categories.find(
        (c) => c.id === (value.contactId ? "networking" : "career"),
      )?.id ?? data.categories[0].id,
    ),
    [error, setError] = useState("");
  return (
    <Modal title="Boka kalenderpass" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const minute = parseTime(start);
          const boundary = planningBoundary();
          if (
            date < boundary.date ||
            (date === boundary.date && minute < boundary.minute)
          ) {
            setError("Välj en tid som inte har passerat.");
            return;
          }
          const result = bookCareerActivity(data, {
            id: uid(),
            title: title.trim(),
            description: "",
            date,
            start: minute,
            end: minute + minutes,
            estimatedMinutes: minutes,
            categoryId: category,
            status: "planned",
            source: "manual",
            blockType: "flexible",
            priority: 4,
            applicationId: value.applicationId,
            contactId: value.contactId,
          });
          if (result.errors.length) setError(result.errors[0]);
          else onSave(result.data);
        }}
      >
        <label>
          Rubrik
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Datum
          <input
            required
            type="date"
            min={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Starttid
            <input
              required
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Minuter
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
          Livsområde
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {data.categories
              .filter((c) => c.id !== "google-calendar")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary">Spara kalenderpass</button>
      </form>
    </Modal>
  );
}
