"use client";
import { useEffect, useState } from "react";
import type { AppData } from "@/lib/types";
import {
  jobSearchSessions,
  assignJobsToSession,
  type JobSessionRef,
} from "@/lib/job-search-sessions";
import { fullDate, time, planningBoundary, monday } from "@/lib/date";
import { Modal } from "./modal";

export function JobSearchSession({
  data,
  initialTarget,
  applicationId,
  onSave,
  onClose,
}: {
  data: AppData;
  initialTarget?: JobSessionRef;
  applicationId?: string;
  onSave: (next: AppData, target: JobSessionRef, startId?: string) => void;
  onClose: () => void;
}) {
  const sessions = jobSearchSessions(data);
  const first =
    sessions.find(
      (session) =>
        session.week === initialTarget?.week &&
        session.activityId === initialTarget.activityId,
    ) ?? sessions[0];
  const [target, setTarget] = useState<JobSessionRef | undefined>(
    first ? { week: first.week, activityId: first.activityId } : undefined,
  );
  const current = sessions.find(
    (session) =>
      session.week === target?.week && session.activityId === target.activityId,
  );
  const available = (data.applications ?? []).filter(
    (job) =>
      job.status === "draft" &&
      (!job.deadline || (current && job.deadline >= current.activity.date)),
  );
  const initialIds = [
    ...new Set([
      ...(first?.activity.jobApplicationIds ??
        (first
          ? (data.dailyCheckIns?.[first.activity.date]?.applicationIds ?? [])
          : [])),
      ...(applicationId ? [applicationId] : []),
    ]),
  ].filter((id) => available.some((job) => job.id === id));
  const [selected, setSelected] = useState<string[]>(initialIds);
  const [error, setError] = useState("");
  const commit = (start: boolean) => {
    if (!target) return;
    try {
      const next = assignJobsToSession(data, target, selected);
      if (start && !selected.length)
        throw new Error("Välj minst ett jobb att börja med.");
      onSave(next, target, start ? selected[0] : undefined);
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "Jobben kunde inte kopplas till passet.",
      );
    }
  };
  return (
    <Modal
      title="Jobb för jobbsökarpasset"
      description="Välj jobb i den ordning du vill arbeta med dem. Passets tider och innehåll i kalendern behålls."
      onClose={onClose}
    >
      <div className="stack">
        {!sessions.length ? (
          <p>
            Det finns inget kommande jobbsökarpass i ditt sparade schema. Öppna
            veckovyn och välj eller importera ditt veckoschema.
          </p>
        ) : (
          <>
            <label>
              Jobbsökarpass
              <select
                value={current ? `${current.week}:${current.activityId}` : ""}
                onChange={(event) => {
                  const next = sessions.find(
                    (session) =>
                      `${session.week}:${session.activityId}` ===
                      event.target.value,
                  );
                  if (!next) return;
                  setTarget({ week: next.week, activityId: next.activityId });
                  setSelected(
                    (next.activity.jobApplicationIds ?? []).filter((id) =>
                      data.applications?.some(
                        (job) =>
                          job.id === id &&
                          job.status === "draft" &&
                          (!job.deadline || job.deadline >= next.activity.date),
                      ),
                    ),
                  );
                  setError("");
                }}
              >
                {sessions.map((session) => (
                  <option
                    key={`${session.week}:${session.activityId}`}
                    value={`${session.week}:${session.activityId}`}
                  >
                    {fullDate(session.activity.date)}{" "}
                    {time(session.activity.start)}–{time(session.activity.end)}{" "}
                    · {session.activity.title}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="stack">
              <legend>Välj jobb för passet</legend>
              {!available.length && (
                <p>
                  Inga aktuella utkast finns att välja. Spara ett jobb först.
                </p>
              )}
              {[...available]
                .sort((a, b) => {
                  const ai = selected.indexOf(a.id),
                    bi = selected.indexOf(b.id);
                  return (
                    (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) ||
                    (a.deadline || "9999").localeCompare(b.deadline || "9999")
                  );
                })
                .map((job) => (
                  <label className="check" key={job.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(job.id)}
                      disabled={
                        !selected.includes(job.id) && selected.length >= 20
                      }
                      onChange={(event) => {
                        setSelected(
                          event.target.checked
                            ? [...selected, job.id]
                            : selected.filter((id) => id !== job.id),
                        );
                        setError("");
                      }}
                    />
                    {selected.includes(job.id)
                      ? `${selected.indexOf(job.id) + 1}. `
                      : ""}
                    {job.role} · {job.organization}
                  </label>
                ))}
            </fieldset>
            <p className="help">
              När en ansökan är skickad går du vidare till nästa valda jobb.
              Inga nya kalenderpass skapas.
            </p>
            {error && <p role="alert">{error}</p>}
            <div className="career-actions">
              <button className="button primary" onClick={() => commit(true)}>
                Spara och börja passet
              </button>
              <button
                className="button secondary"
                onClick={() => commit(false)}
              >
                Spara jobb för passet
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function JobSessionLauncher({
  data,
  week,
  onChoose,
  onStart,
}: {
  data: AppData;
  week: string;
  onChoose: (target: JobSessionRef) => void;
  onStart: (applicationId: string, target: JobSessionRef) => void;
}) {
  const [boundary, setBoundary] = useState(planningBoundary);
  useEffect(() => {
    const timer = setInterval(() => setBoundary(planningBoundary()), 60000);
    return () => clearInterval(timer);
  }, []);
  if (week !== monday(boundary.date)) return null;
  const session = jobSearchSessions(data, boundary).find(
    (session) => session.activity.date === boundary.date,
  );
  if (!session) return null;
  const remaining = session.jobs.filter(
    (job) =>
      job.status === "draft" &&
      (!job.deadline || job.deadline >= boundary.date),
  );
  if (session.jobs.length && !remaining.length) return null;
  if (
    !remaining.length &&
    !data.applications?.some(
      (job) =>
        job.status === "draft" &&
        (!job.deadline || job.deadline >= boundary.date),
    )
  )
    return null;
  const target = { week: session.week, activityId: session.activityId };
  return (
    <section
      className="job-session-launcher stack"
      aria-label="Dagens jobbsökarpass"
    >
      <h2>{session.activity.title}</h2>
      <p>
        {time(session.activity.start)}–{time(session.activity.end)} ·{" "}
        {remaining.length
          ? `${remaining.length} valda jobb kvar`
          : "Välj jobb för ditt planerade pass"}
      </p>
      <div className="career-actions">
        <button
          className="button primary"
          onClick={() =>
            remaining.length
              ? onStart(remaining[0].id, target)
              : onChoose(target)
          }
        >
          {remaining.length ? "Börja jobbsökarpasset" : "Välj jobb för passet"}
        </button>
        {remaining.length > 0 && (
          <button className="text-button" onClick={() => onChoose(target)}>
            Ändra valda jobb
          </button>
        )}
      </div>
    </section>
  );
}
