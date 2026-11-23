"use client";
import { applicationDeadlineActive } from "@/lib/application-deadlines";
import { orderedCategories, categoryLabel } from "@/lib/presentation";
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
import { APPLICATION_STATUSES, saveApplication } from "@/lib/applications";
import { bookDeadlineWork, deadlineWork } from "@/lib/deadline-scheduling";
import { ApplicationHistory } from "./application-history";
import { ApplicationMaterials } from "./application-materials";
import {
  InterviewBookingForm,
  InterviewNotesForm,
} from "./application-interviews";
import {
  documentUrl,
  saveApplicationMaterials,
} from "@/lib/application-materials";
import {
  interviewActivity,
  scheduleApplicationInterview,
  saveInterviewNotes,
} from "@/lib/application-interviews";
import { recordingHref } from "@/lib/recording-client";
import { CareerActions } from "./career-actions";
import {
  bookCareerAction,
  completeCareerAction,
  careerActions,
  type TrackedAction,
  actionBookingSuggestions,
} from "@/lib/career-actions";
import { ActionKindSelector } from "./action-control";
import { NetworkContacts, ContactLogForm } from "./network-contacts";
import { logContact } from "@/lib/network-overview";
import { CvAgent } from "./cv-agent";
import { ApplicationMessage } from "./application-message";
import { applyApplicationMessage } from "@/lib/application-message";
import { LinkedInImport } from "./linkedin-import";
import { importLinkedInJobs } from "@/lib/linkedin-import";
import { Modal } from "./modal";
import { PlanningConsequences } from "./planning-consequences";
import {
  applicationAttention,
  isClosedApplication,
} from "@/lib/application-overview";

import { JobList } from "./job-list";
import { JobCapture } from "./job-capture";
import { ApplicationSent } from "./application-sent";
import {
  jobWorkspace,
  markApplicationSent,
  type JobLane,
  type JobRow,
} from "@/lib/job-workspace";

const statuses = APPLICATION_STATUSES;
type Props = {
  onWeek: () => void;
  initialActionId?: string;
  initialTab?: "actions";
  initialRecord?: {
    kind: "application" | "contact";
    id: string;
    instruction: string;
  };
  section: "jobs" | "network";
  data: AppData;
  onChange: (next: AppData, base: AppData) => void;
  onOpen: (activity: Activity) => void;
  onEditing: (editing: boolean) => void;
};

export function CareerView({
  data,
  onChange,
  onOpen,
  onEditing,
  section,
  initialActionId,
  initialTab,
  initialRecord,
  onWeek,
}: Props) {
  const [detailId, setDetailId] = useState<string | null>(() =>
    initialRecord?.kind === "application"
      ? initialRecord.id
      : initialActionId
        ? (careerActions(data).find((a) => a.id === initialActionId)
            ?.applicationId ?? null)
        : null,
  );
  const [addJobOpen, setAddJobOpen] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [jobLane, setJobLane] = useState<JobLane>("todo");
  const [messageApplicationId, setMessageApplicationId] = useState<string>();
  const [cvId, setCvId] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [materialsId, setMaterialsId] = useState<string | null>(
    initialRecord?.kind === "application" ? initialRecord.id : null,
  );
  const [actionEditing, setActionEditing] = useState(false);
  const [interviewBookingId, setInterviewBookingId] = useState<string | null>(
    null,
  );
  const [interviewNotes, setInterviewNotes] = useState<{
    applicationId: string;
    interviewId: string;
  } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [tab, setTab] = useState(
    section === "network" ? (initialTab ?? "contacts") : "applications",
  );
  const [focusActionId, setFocusActionId] = useState(initialActionId);
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [contactLog, setContactLog] = useState<NetworkContact | null>(null);
  const [contact, setContact] = useState<NetworkContact | null>(null);
  const [deadline, setDeadline] = useState<Deadline | null>(null);
  const [booking, setBooking] = useState<{
    title: string;
    date: string;
    applicationId?: string;
    contactId?: string;
    careerActionId?: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    result: PlanningPreview;
    base: AppData;
    label: string;
  } | null>(null);
  const editing = Boolean(
    detailId ||
    addJobOpen ||
    sentId ||
    cvId ||
    messageOpen ||
    linkedinOpen ||
    actionEditing ||
    application ||
    contact ||
    contactLog ||
    deadline ||
    booking ||
    preview ||
    historyId ||
    materialsId ||
    interviewBookingId ||
    interviewNotes,
  );
  useLayoutEffect(() => {
    onEditing(editing);
    return () => onEditing(false);
  }, [editing, onEditing]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const applications = data.applications ?? [],
    contacts = data.contacts ?? [],
    deadlines = data.deadlines ?? [];
  const all = Object.values(data.weeks).flatMap((p) => p.activities);
  const bookStep = (step: TrackedAction) =>
    setBooking({
      title: step.title,
      date: nextDate(step.date),
      applicationId: step.applicationId,
      contactId: step.contactId,
      careerActionId: step.id,
    });
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
  const saveTrackedApplication = (a: JobApplication) =>
    onChange(
      {
        ...data,
        applications: applications.map((old) => (old.id === a.id ? a : old)),
      },
      data,
    );
  const cvApplication = applications.find((a) => a.id === cvId);
  const materialApplication = applications.find((a) => a.id === materialsId);
  const bookingApplication = applications.find(
    (a) => a.id === interviewBookingId,
  );
  const notesApplication = applications.find(
    (a) => a.id === interviewNotes?.applicationId,
  );
  const notesInterview = notesApplication?.interviews?.find(
    (i) => i.id === interviewNotes?.interviewId,
  );
  const historyApplication = applications.find((a) => a.id === historyId);
  const nextDate = (date: string) => (date && date >= today() ? date : today());
  const detailedApplication = applications.find((a) => a.id === detailId);
  const sentApplication = applications.find((a) => a.id === sentId);
  const openJob = (a: JobApplication) => {
    setDetailId(a.id);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "instant" }),
    );
  };
  const primaryJobAction = (row: JobRow) => {
    openJob(row.application);
    if (row.primary === "Fortsätt med CV") setCvId(row.application.id);
    else if (row.primary === "Förbered ansökan")
      setMaterialsId(row.application.id);
    else if (row.primary === "Boka intervju")
      setInterviewBookingId(row.application.id);
    else if (
      ["Förbered intervju", "Följ upp intervjun"].includes(row.primary) &&
      row.interview
    )
      setInterviewNotes({
        applicationId: row.application.id,
        interviewId: row.interview.interview.id,
      });
  };
  const renderApplication = (a: JobApplication) => {
    const step = jobWorkspace(data).find(
      (row) => row.application.id === a.id,
    )?.step;
    return (
      <article className="career-card stack job-detail-card" key={a.id}>
        <h2>
          {a.role} · {a.organization}
        </h2>
        <div className="application-status">
          <span>{statuses[a.status]}</span>
          {!step && (
            <span>
              {a.status === "sent" ? "Väntar på svar" : applicationAttention(a)}
            </span>
          )}
        </div>
        {a.deadline && <p>Deadline: {a.deadline}</p>}
        <section className="application-next-step">
          <h3>{step?.kind === "waiting" ? "Väntar på svar" : "Nästa steg"}</h3>
          <p>
            {step?.title ||
              (isClosedApplication(a)
                ? "Processen är avslutad."
                : "Välj vad du vill göra härnäst.")}
          </p>
          {!step && !isClosedApplication(a) && (
            <button
              className="button secondary"
              onClick={() => setApplication(a)}
            >
              Lägg till nästa steg
            </button>
          )}
        </section>
        {a.status === "draft" && (
          <button className="button primary" onClick={() => setSentId(a.id)}>
            Markera skickad
          </button>
        )}
        <button
          className="button secondary"
          onClick={() => {
            setMessageApplicationId(a.id);
            setMessageOpen(true);
          }}
        >
          Klistra in besked
        </button>
        <section
          className="job-material-summary stack"
          aria-label="Annons och dokument"
        >
          <h3>Annons och dokument</h3>
          {documentUrl(a.advertisement?.url ?? "") && (
            <a
              href={documentUrl(a.advertisement!.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Öppna annons
            </a>
          )}
          {a.advertisement?.text && (
            <details>
              <summary>Läs annonsen</summary>
              <p className="career-notes">{a.advertisement.text}</p>
            </details>
          )}
          {!a.advertisement?.url && !a.advertisement?.text && (
            <p>Annons saknas. Lägg till den under Dokumentunderlag.</p>
          )}
          {a.materials?.map((m) => (
            <a
              key={m.id}
              href={documentUrl(m.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {m.title} · {m.version || "Ingen version"}
              {m.sentOn ? ` · Skickat ${m.sentOn}` : ""}
            </a>
          ))}
        </section>
        <div className="career-actions">
          <button className="button secondary" onClick={() => setCvId(a.id)}>
            Skapa CV för jobbet ↗
          </button>
        </div>
        <section
          className="application-details"
          aria-label="Dokument, intervjuer och historik"
        >
          <div className="stack">
            {!isClosedApplication(a) && (
              <section
                className="job-scoped-actions"
                aria-label="Jobbets nästa steg"
              >
                <h3>Uppgifter och bevakningar</h3>
                <CareerActions
                  data={data}
                  scope="jobs"
                  applicationId={a.id}
                  onChange={onChange}
                  onOpen={onOpen}
                  onEditing={setActionEditing}
                  onBook={bookStep}
                  initialActionId={focusActionId}
                />
              </section>
            )}
            {!!a.contactIds?.length && (
              <div className="stack" aria-label="Kopplade kontakter">
                {a.contactIds.map((id) => {
                  const c = contacts.find((c) => c.id === id);
                  return c ? (
                    <button
                      className="text-button"
                      key={id}
                      onClick={() => setContact(c)}
                    >
                      {c.name}
                      {c.organization && ` · ${c.organization}`}
                    </button>
                  ) : (
                    <span key={id}>Borttagen kontakt</span>
                  );
                })}
              </div>
            )}
            {a.notes && <p className="career-notes">{a.notes}</p>}
            <div className="career-actions">
              <a
                className="button secondary"
                href={recordingHref({ applicationId: a.id })}
                target="_blank"
                rel="noopener noreferrer"
              >
                Spela in samtal
              </a>
              <button
                className="button secondary"
                onClick={() => setMaterialsId(a.id)}
              >
                Dokumentunderlag
              </button>
              <button
                className="button secondary"
                onClick={() => setInterviewBookingId(a.id)}
              >
                Boka intervju
              </button>
              <button
                className="button secondary"
                onClick={() => setHistoryId(a.id)}
              >
                Visa historik
              </button>
              {a.status === "draft" && (
                <button
                  className="button secondary"
                  onClick={() =>
                    setDeadline({
                      id: uid(),
                      title: `${a.role} · ${a.organization}`,
                      date: nextDate(a.deadline),
                      minute: data.settings.end,
                      categoryId: data.categories.some((c) => c.id === "career")
                        ? "career"
                        : data.categories[0].id,
                      applicationId: a.id,
                      steps: [],
                    })
                  }
                >
                  Planera från deadline
                </button>
              )}
            </div>
            {!!a.interviews?.length && (
              <section
                className="stack"
                aria-label={`Intervjuer för ${a.role}`}
              >
                <h3>Intervjuer</h3>
                {a.interviews.map((i) => {
                  const meeting = interviewActivity(
                    data,
                    i.meetingActivityId,
                  )?.activity;
                  const prep = interviewActivity(
                    data,
                    i.preparationActivityId,
                  )?.activity;
                  const date = meeting?.date ?? i.date,
                    start = meeting?.start ?? i.start,
                    end = meeting?.end ?? i.end;
                  const late =
                    meeting &&
                    prep &&
                    (prep.date > meeting.date ||
                      (prep.date === meeting.date && prep.end > meeting.start));
                  return (
                    <div className="career-interview stack" key={i.id}>
                      <h4>{i.title}</h4>
                      <a
                        className="text-button"
                        href={recordingHref({
                          applicationId: a.id,
                          interviewId: i.id,
                          ...(i.contactId ? { contactId: i.contactId } : {}),
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Spela in intervju
                      </a>
                      <p>
                        {date} · {time(start)}–{time(end)} ·{" "}
                        {meeting
                          ? meeting.status === "done"
                            ? "Genomförd"
                            : meeting.status === "skipped"
                              ? "Blev inte av"
                              : "Planerad"
                          : "Kalenderpass saknas"}
                      </p>
                      {i.location && (
                        <p className="career-notes">
                          {i.location}
                          {documentUrl(i.location) && (
                            <>
                              {" "}
                              ·{" "}
                              <a
                                href={documentUrl(i.location)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Öppna möteslänk
                              </a>
                            </>
                          )}
                        </p>
                      )}
                      {i.contactId && (
                        <p>
                          Kontakt:{" "}
                          {contacts.find((c) => c.id === i.contactId)?.name ??
                            "Borttagen kontakt"}
                        </p>
                      )}
                      {prep && (
                        <p>
                          Förberedelse: {prep.date} {time(prep.start)}–
                          {time(prep.end)}
                        </p>
                      )}
                      {i.preparationActivityId && !prep && (
                        <p>Förberedelsepasset saknas i kalendern.</p>
                      )}
                      {late && (
                        <p role="status">
                          Förberedelsepasset ligger inte före intervjun.
                          Kontrollera tiderna i kalendern.
                        </p>
                      )}
                      <div className="career-actions">
                        <button
                          className="button secondary"
                          onClick={() =>
                            setInterviewNotes({
                              applicationId: a.id,
                              interviewId: i.id,
                            })
                          }
                        >
                          Intervjuanteckningar
                        </button>
                        <button
                          className="button secondary"
                          onClick={() =>
                            setInterviewNotes({
                              applicationId: a.id,
                              interviewId: i.id,
                            })
                          }
                        >
                          Öppna intervjuunderlag
                        </button>
                        {meeting && (
                          <button
                            className="button secondary"
                            onClick={() => onOpen(meeting)}
                          >
                            Öppna intervjupass
                          </button>
                        )}
                        {prep && (
                          <button
                            className="button secondary"
                            onClick={() => onOpen(prep)}
                          >
                            Öppna förberedelsepass
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
            {passes(linked("applicationId", a.id))}
            <details>
              <summary>Historik</summary>
              <ApplicationHistory
                embedded
                value={a}
                contacts={contacts}
                onSave={saveTrackedApplication}
                onClose={() => {}}
              />
            </details>
          </div>
        </section>
      </article>
    );
  };
  return (
    <section
      className="career-view stack"
      aria-label={
        section === "network" ? "Nätverk och kontakter" : "Jobbsökande"
      }
    >
      <p>
        {section === "network"
          ? "Hantera kontakter och samtal här. Uppgifter och bevakningar följer med till Nästa steg i veckovyn."
          : "Hantera ansökningar här. Uppgifter och bevakningar följer med till Nästa steg i veckovyn."}
      </p>
      <button className="text-button career-week-link" onClick={onWeek}>
        Till veckans arbete →
      </button>
      {section === "network" && (
        <div
          className="career-tabs"
          role="group"
          aria-label="Visa nätverksöversikt"
        >
          {[
            ["contacts", "Kontakter"],
            ["actions", "Uppföljningar"],
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
      )}
      {section === "jobs" && tab === "deadlines" && (
        <button className="text-button" onClick={() => setTab("applications")}>
          Till jobblistan
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {section === "network" && tab === "actions" && (
        <CareerActions
          onOpen={onOpen}
          initialActionId={focusActionId}
          scope={section}
          data={data}
          onChange={onChange}
          onEditing={setActionEditing}
          onBook={(a) =>
            setBooking({
              title: a.title,
              date: nextDate(a.date),
              applicationId: a.applicationId,
              contactId: a.contactId,
              careerActionId: a.id,
            })
          }
        />
      )}
      {tab === "applications" &&
        (detailedApplication ? (
          <section className="job-detail stack" aria-label="Ansökans detaljer">
            <button className="text-button" onClick={() => setDetailId(null)}>
              Till jobblistan
            </button>
            {renderApplication(detailedApplication)}
          </section>
        ) : (
          <JobList
            data={data}
            lane={jobLane}
            onLane={setJobLane}
            query={query}
            onQuery={setQuery}
            onAdd={() => setAddJobOpen(true)}
            onOpen={openJob}
            onPrimary={primaryJobAction}
            onMessage={(a) => {
              setMessageApplicationId(a.id);
              setMessageOpen(true);
            }}
            onImport={() => setLinkedinOpen(true)}
            onGlobalMessage={() => {
              setMessageApplicationId(undefined);
              setMessageOpen(true);
            }}
            onDeadlines={() => setTab("deadlines")}
          />
        ))}
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
          <NetworkContacts
            initialContactId={
              initialRecord?.kind === "contact" ? initialRecord.id : undefined
            }
            firstStep={
              initialRecord?.kind === "contact"
                ? initialRecord.instruction
                : undefined
            }
            data={data}
            onEdit={setContact}
            onLog={setContactLog}
            onOpen={onOpen}
            onBook={bookStep}
            onComplete={(step) =>
              onChange(completeCareerAction(data, step.id), data)
            }
            onEditAction={(step) => {
              setFocusActionId(step.id);
              setTab("actions");
            }}
            onActions={() => setTab("actions")}
            onBookContact={(c) =>
              setBooking({
                title: c.nextAction || `Kontakt med ${c.name}`,
                date: nextDate(c.followUpDate),
                contactId: c.id,
              })
            }
          />
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
            När du sparar bokas delstegen bakåt från sluttiden. Ett framtida
            automatiskt pass i samma kategori kan användas med oförändrad tid.
            Annars används ledig tid. Nya veckor får låsta reservationer,
            skyddade pass och återkommande aktiviteter.
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
                {!applicationDeadlineActive(data, d.applicationId) && (
                  <p>
                    Ansökan är inte längre ett utkast. Ansökningsplaneringen är
                    bevarad som historik. Planera eventuell uppföljning eller
                    intervju från ansökan.
                  </p>
                )}
                {applicationDeadlineActive(data, d.applicationId) &&
                  !linked("deadlineId", d.id).length && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        showPreview(
                          planDeadline(data, d, planningBoundary(), {
                            reuseGenerated: true,
                          }),
                          "Bakåtplanering",
                        )
                      }
                    >
                      Förhandsvisa bakåtplanering
                    </button>
                  )}
                {applicationDeadlineActive(data, d.applicationId) &&
                  linked("deadlineId", d.id).length > 0 &&
                  d.steps.some(
                    (step) =>
                      !linked("deadlineId", d.id).some(
                        (a) => a.deadlineStepId === step.id,
                      ),
                  ) && (
                    <button
                      className="button secondary"
                      onClick={() => {
                        const result = bookDeadlineWork(data, d.id);
                        if (result.errors.length)
                          setMessage(result.errors.join(" "));
                        else {
                          onChange(result.data, data);
                          setMessage("Återstående delsteg är bokade.");
                        }
                      }}
                    >
                      Boka återstående delsteg
                    </button>
                  )}
              </div>
              {passes(linked("deadlineId", d.id))}
            </article>
          ))}
        </>
      )}
      <details className="job-tools">
        <summary>Omplanera resten av dagen</summary>
        <section className="career-card stack">
          <h2>Omplanera resten av dagen</h2>
          <p>
            Flyttbara, flexibla pass som inte har börjat ordnas efter deadline
            och prioritet från aktuell tid i Stockholm. Genomförda, påbörjade,
            skyddade och låsta pass samt andra dagar bevaras. Förslaget sparas
            först när du använder det.
          </p>
          <button
            className="button secondary"
            onClick={() => showPreview(replanDay(data), "Resten av dagen")}
          >
            Förhandsvisa dagens omplanering
          </button>
        </section>
      </details>
      {addJobOpen && (
        <JobCapture
          applications={applications}
          onClose={() => setAddJobOpen(false)}
          onSave={(a) => {
            onChange(
              {
                ...data,
                applications: [...applications, saveApplication(undefined, a)],
              },
              data,
            );
            setAddJobOpen(false);
            setDetailId(a.id);
            setJobLane("todo");
            setMessage(
              "Jobbet är sparat. Fortsätt med nästa steg när det passar.",
            );
            return undefined;
          }}
        />
      )}
      {sentApplication && (
        <ApplicationSent
          application={sentApplication}
          onClose={() => setSentId(null)}
          onSave={(date) => {
            try {
              const next = markApplicationSent(data, sentApplication.id, date);
              onChange(next, data);
              setSentId(null);
              setJobLane(
                jobWorkspace(next).find(
                  (row) => row.application.id === sentApplication.id,
                )?.lane ?? "waiting",
              );
              setMessage("Ansökan är markerad som skickad.");
              return undefined;
            } catch (e) {
              return e instanceof Error
                ? e.message
                : "Ansökan kunde inte uppdateras.";
            }
          }}
        />
      )}
      {cvApplication && (
        <CvAgent application={cvApplication} onClose={() => setCvId(null)} />
      )}
      {materialApplication && (
        <ApplicationMaterials
          firstStep={
            initialRecord?.kind === "application" &&
            initialRecord.id === materialApplication.id
              ? initialRecord.instruction
              : undefined
          }
          value={materialApplication}
          onClose={() => setMaterialsId(null)}
          onSave={(fields) => {
            onChange(
              saveApplicationMaterials(data, materialApplication.id, fields),
              data,
            );
            setMaterialsId(null);
          }}
        />
      )}
      {bookingApplication && (
        <InterviewBookingForm
          application={bookingApplication}
          data={data}
          onClose={() => setInterviewBookingId(null)}
          onSave={(input) => {
            const result = scheduleApplicationInterview(
              data,
              bookingApplication.id,
              input,
            );
            if (result.errors.length) return result.errors.join(" ");
            onChange(result.data, data);
            setInterviewBookingId(null);
            return undefined;
          }}
        />
      )}
      {notesApplication && notesInterview && (
        <InterviewNotesForm
          application={notesApplication}
          interview={notesInterview}
          data={data}
          onClose={() => setInterviewNotes(null)}
          onSave={(fields, complete) => {
            onChange(
              saveInterviewNotes(
                data,
                notesApplication.id,
                notesInterview.id,
                fields,
                complete,
              ),
              data,
            );
            setInterviewNotes(null);
          }}
        />
      )}
      {historyApplication && (
        <ApplicationHistory
          value={historyApplication}
          contacts={contacts}
          onClose={() => setHistoryId(null)}
          onSave={(a) => {
            saveTrackedApplication(a);
            setHistoryId(null);
          }}
        />
      )}
      {messageOpen && (
        <ApplicationMessage
          applications={applications}
          initialApplicationId={messageApplicationId}
          onClose={() => setMessageOpen(false)}
          onSave={(id, text, update) => {
            const current = applications.find((a) => a.id === id);
            if (!current) return "Ansökan finns inte längre. Välj en annan.";
            try {
              const updated = applyApplicationMessage(current, text, update);
              saveTrackedApplication(updated);
              setMessageOpen(false);
              setDetailId(updated.id);
              setJobLane(
                jobWorkspace({
                  ...data,
                  applications: applications.map((a) =>
                    a.id === updated.id ? updated : a,
                  ),
                }).find((row) => row.application.id === updated.id)?.lane ??
                  "todo",
              );
              setQuery("");

              setMessage(
                "Beskedet är sparat i historiken. Status och nästa steg är uppdaterade. Du kan boka arbetstid från ansökans kort.",
              );
            } catch (error) {
              return error instanceof Error
                ? error.message
                : "Beskedet kunde inte sparas.";
            }
          }}
        />
      )}
      {linkedinOpen && (
        <LinkedInImport
          applications={applications}
          onClose={() => setLinkedinOpen(false)}
          onImport={(drafts) => {
            const result = importLinkedInJobs(data, drafts);
            if (result.added.length) {
              onChange(result.data, data);
              setLinkedinOpen(false);
              setJobLane("todo");
              setDetailId(null);

              setQuery("");

              setMessage(
                `${result.added.length} jobb har importerats som utkast.${result.skipped.length ? ` ${result.skipped.length} dubbletter hoppades över.` : ""} Nästa steg finns i veckovyn. Välj Boka arbetstid när du vill planera ett pass.`,
              );
            }
            return {
              added: result.added.length,
              skipped: result.skipped.length,
            };
          }}
        />
      )}
      {application && (
        <ApplicationForm
          value={application}
          existing={applications.some((a) => a.id === application.id)}
          contacts={contacts}
          onClose={() => setApplication(null)}
          onSave={(a) => {
            const next = {
              ...data,
              applications: [
                ...applications.filter((x) => x.id !== a.id),
                saveApplication(
                  applications.find((x) => x.id === a.id),
                  a,
                ),
              ],
            };
            const work = deadlineWork(next).find(
              (w) => w.applicationOnly && w.deadline.applicationId === a.id,
            );
            const result = work
              ? bookDeadlineWork(next, work.deadline.id)
              : { data: next, activities: [], errors: [] };
            onChange(result.data, data);
            setApplication(null);
            setDetailId(a.id);
            setJobLane(
              jobWorkspace(result.data).find(
                (row) => row.application.id === a.id,
              )?.lane ?? "todo",
            );
            setMessage(
              result.errors.length
                ? `Ansökan är sparad. Arbetstid kunde inte bokas: ${result.errors.join(" ")}`
                : result.activities.length
                  ? "Ansökan är sparad och arbetstid före deadline är bokad."
                  : "Ansökan är sparad.",
            );
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
              setDetailId(null);
            }
          }}
        />
      )}
      {contactLog && (
        <ContactLogForm
          contact={contactLog}
          onClose={() => setContactLog(null)}
          onSave={(input) => {
            onChange(logContact(data, contactLog.id, input), data);
            setContactLog(null);
            setMessage("Kontaktloggen har sparats.");
          }}
        />
      )}
      {contact && (
        <ContactForm
          value={contact}
          onClose={() => setContact(null)}
          onSave={(c) => {
            const previous = contacts.find((v) => v.id === c.id);
            onChange(
              {
                ...data,
                contacts: [
                  ...contacts.filter((x) => x.id !== c.id),
                  {
                    ...c,
                    nextActionId: c.nextAction.trim()
                      ? previous?.nextAction.trim()
                        ? previous.nextActionId
                        : uid()
                      : undefined,
                  },
                ],
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
            const next = {
              ...data,
              deadlines: [...deadlines.filter((x) => x.id !== d.id), d],
            };
            const result = bookDeadlineWork(next, d.id);
            onChange(result.data, data);
            setDeadline(null);
            setMessage(
              result.errors.length
                ? `Deadlinen är sparad. Arbetstid kunde inte bokas: ${result.errors.join(" ")}`
                : result.activities.length
                  ? "Deadlinen är sparad och arbetstiden är bokad i kalendern."
                  : "Deadlinen är sparad. Befintliga kalenderpass har behållits.",
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
            {preview.label === "Resten av dagen" ? (
              <PlanningConsequences
                base={preview.base}
                result={preview.result}
              />
            ) : (
              preview.result.activities.map((a) => (
                <p key={a.id}>
                  {a.title} · {a.date} {time(a.start)}–{time(a.end)}
                </p>
              ))
            )}
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
  existing,
  contacts,
  onSave,
  onClose,
  onDelete,
}: {
  value: JobApplication;
  existing: boolean;
  contacts: NetworkContact[];
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
    <Modal
      title={existing ? "Redigera ansökan" : "Ny ansökan"}
      onClose={onClose}
    >
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
        <fieldset className="stack application-form-section">
          <legend>1. Tjänsten och ansökan</legend>
          <p className="help">
            Arbetsgivare och tjänst behövs. Övriga uppgifter kan fyllas i
            senare.
          </p>
          {field("organization", "Organisation")}
          {field("role", "Tjänst")}
          <label>
            Status
            <select
              value={v.status}
              onChange={(e) =>
                set({
                  ...v,
                  status: e.target.value as JobApplication["status"],
                })
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
          </div>
          <p className="help">
            Utkast med deadline får en bokning före slutdagen om tiden räcker.
            Utan egna delsteg är tidsbehovet 60 minuter. Egna delsteg anges
            under Planera från deadline.
          </p>
        </fieldset>
        <fieldset className="stack application-form-section">
          <legend>2. Vad händer härnäst?</legend>
          <p className="help">
            Välj en konkret uppgift och när den ska följas upp. Du kan boka tid
            efter att ansökan har sparats.
          </p>
          <ActionKindSelector
            value={v.nextActionKind}
            onChange={(kind) =>
              set({
                ...v,
                nextActionKind: kind,
                nextActionOwner:
                  kind === "waiting" && (v.nextActionOwner ?? "Jag") === "Jag"
                    ? ""
                    : v.nextActionOwner,
              })
            }
          />
          <p className="help">
            {v.nextActionKind === "waiting"
              ? "Ange vem du väntar på och från vilket datum du vill följa upp. Bevakningen bokar ingen arbetstid automatiskt."
              : "Ange vad du ska göra och när det ska vara klart. Boka sedan arbetstid från kortet."}
          </p>
          {field("nextAction", "Nästa steg")}
          {field(
            "followUpDate",
            v.nextActionKind === "waiting" ? "Bevakningsdatum" : "Klart senast",
            "date",
          )}
          <label>
            {v.nextActionKind === "waiting"
              ? "Väntar på"
              : "Ansvarig för nästa steg"}
            <input
              maxLength={200}
              value={v.nextActionOwner ?? "Jag"}
              onChange={(e) => set({ ...v, nextActionOwner: e.target.value })}
            />
          </label>
          <label>
            Varför behövs nästa steg?
            <textarea
              maxLength={4000}
              value={v.nextActionReason ?? ""}
              onChange={(e) => set({ ...v, nextActionReason: e.target.value })}
            />
          </label>
        </fieldset>
        <fieldset className="stack application-form-section">
          <legend>3. Anteckningar och kontakter</legend>
          <label>
            Anteckningar
            <textarea
              maxLength={4000}
              value={v.notes}
              onChange={(event) => set({ ...v, notes: event.target.value })}
            />
          </label>
          <fieldset className="stack">
            <legend>Koppla kontakter</legend>
            {!contacts.length && (
              <p>Skapa först en kontakt under Kontaktlogg.</p>
            )}
            {contacts.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={v.contactIds?.includes(c.id) ?? false}
                  onChange={(e) =>
                    set({
                      ...v,
                      contactIds: e.target.checked
                        ? [...(v.contactIds ?? []), c.id]
                        : (v.contactIds ?? []).filter((id) => id !== c.id),
                    })
                  }
                />
                {c.name}
                {c.organization && ` · ${c.organization}`}
              </label>
            ))}
          </fieldset>
        </fieldset>
        <button className="button primary">Spara ansökan</button>
        {existing && (
          <button className="button secondary" type="button" onClick={onDelete}>
            Ta bort ansökan
          </button>
        )}
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
        <ActionKindSelector
          value={v.nextActionKind}
          onChange={(kind) =>
            set({
              ...v,
              nextActionKind: kind,
              nextActionOwner:
                kind === "waiting" && (v.nextActionOwner ?? "Jag") === "Jag"
                  ? ""
                  : v.nextActionOwner,
            })
          }
        />
        <label>
          Nästa steg
          <input
            maxLength={4000}
            value={v.nextAction}
            onChange={(e) => set({ ...v, nextAction: e.target.value })}
          />
        </label>
        <label>
          {v.nextActionKind === "waiting" ? "Bevakningsdatum" : "Klart senast"}
          <input
            type="date"
            value={v.followUpDate}
            onChange={(e) => set({ ...v, followUpDate: e.target.value })}
          />
        </label>
        <h3>Kontaktlogg</h3>
        <label>
          {v.nextActionKind === "waiting"
            ? "Väntar på"
            : "Ansvarig för nästa steg"}
          <input
            maxLength={200}
            value={v.nextActionOwner ?? "Jag"}
            onChange={(e) => set({ ...v, nextActionOwner: e.target.value })}
          />
        </label>
        <label>
          Varför behövs nästa steg?
          <textarea
            maxLength={4000}
            value={v.nextActionReason ?? ""}
            onChange={(e) => set({ ...v, nextActionReason: e.target.value })}
          />
        </label>
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
      : [{ id: uid(), title: "Arbetspass", minutes: 60 }],
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
          Område
          <select
            value={v.categoryId}
            onChange={(e) => set({ ...v, categoryId: e.target.value })}
          >
            {orderedCategories(data.categories)
              .filter((c) => c.id !== "google-calendar")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c)}
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

export function BookingForm({
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
    careerActionId?: string;
    minutes?: number;
  };
  onSave: (v: AppData) => void;
  onClose: () => void;
}) {
  const action = value.careerActionId
    ? careerActions(data).find((step) => step.id === value.careerActionId)
    : undefined;
  const [date, setDate] = useState(value.date),
    [start, setStart] = useState("09:00"),
    [minutes, setMinutes] = useState(value.minutes ?? 30),
    [title, setTitle] = useState(value.title),
    [category, setCategory] = useState(
      data.categories.find(
        (c) => c.id === (value.applicationId ? "career" : "networking"),
      )?.id ?? data.categories[0].id,
    ),
    [error, setError] = useState("");
  const suggestions = action
    ? actionBookingSuggestions(data, action.id, minutes)
    : [];
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
          const result = value.careerActionId
            ? bookCareerAction(
                data,
                value.careerActionId,
                date,
                minute,
                minutes,
              )
            : bookCareerActivity(data, {
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
        {action && (
          <p className="help">
            {action.kind === "waiting"
              ? `Boka ett uppföljningspass från ${action.date || "bevakningsdatumet"}. Själva väntan tar ingen tid i kalendern.`
              : `Boka tid för uppgiften${action.date ? ` senast ${action.date}` : ""}. Passet kopplas till nästa steg och visas på ansökans eller kontaktens kort.`}
          </p>
        )}
        {suggestions.length > 0 && (
          <label>
            Förslag på ledig tid
            <select
              value=""
              onChange={(event) => {
                const suggestion = suggestions[Number(event.target.value)];
                if (event.target.value !== "" && suggestion) {
                  setDate(suggestion.date);
                  setStart(time(suggestion.start));
                }
              }}
            >
              <option value="">Välj förslag eller ange tid själv</option>
              {suggestions.map((suggestion, index) => (
                <option
                  key={`${suggestion.date}-${suggestion.start}`}
                  value={index}
                >
                  {suggestion.date} · {time(suggestion.start)}–
                  {time(suggestion.end)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Rubrik
          <input
            required
            maxLength={200}
            value={title}
            readOnly={Boolean(value.careerActionId)}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Datum
          <input
            required
            type="date"
            min={
              action?.kind === "waiting" && action.date > today()
                ? action.date
                : today()
            }
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
          Område
          <select
            value={category}
            disabled={Boolean(value.careerActionId)}
            onChange={(e) => setCategory(e.target.value)}
          >
            {orderedCategories(data.categories)
              .filter((c) => c.id !== "google-calendar")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c)}
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
