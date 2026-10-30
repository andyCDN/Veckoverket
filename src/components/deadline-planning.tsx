"use client";
import { useState } from "react";
import type { Activity, AppData } from "@/lib/types";
import { planningBoundary, time } from "@/lib/date";
import {
  deadlineTiming,
  upcomingDeadlineWork,
} from "@/lib/deadline-scheduling";

export function DeadlinePlanning({
  data,
  date,
  onBook,
  onOpen,
}: {
  data: AppData;
  date: string;
  onBook: (id: string) => string[];
  onOpen: (activity: Activity) => void;
}) {
  const [error, setError] = useState("");
  const work = upcomingDeadlineWork(data, date);
  if (!work.length) return null;
  const boundary = planningBoundary();
  return (
    <details
      className="deadline-planning"
      open={work.some(
        (w) =>
          w.deadline.date === date || w.activities.some((a) => a.date === date),
      )}
    >
      <summary>
        Deadlines och arbetstid <span>{work.length}</span>
      </summary>
      <section className="stack" aria-label="Deadlines i dagsplaneringen">
        {error && <p role="alert">{error}</p>}
        {work.map((w) => {
          const due = w.deadline;
          const past =
            due.date < boundary.date ||
            (due.date === boundary.date && due.minute <= boundary.minute);
          return (
            <article className="deadline-planning-item stack" key={due.id}>
              <div>
                <strong>{due.title}</strong>
                <p>
                  Deadline {due.date} kl. {time(due.minute)}
                </p>
              </div>
              <p>{deadlineTiming(w, boundary)}</p>
              {w.activities.length ? (
                <div className="career-actions">
                  {w.activities.map((a) => (
                    <button
                      className="text-button"
                      key={a.id}
                      onClick={() => onOpen(a)}
                      aria-label={`Öppna deadlinepass ${a.title}, ${a.date} ${time(a.start)}`}
                    >
                      {a.date} {time(a.start)}–{time(a.end)} ·{" "}
                      {a.status === "done"
                        ? "Genomförd"
                        : a.status === "skipped"
                          ? "Missad"
                          : "Planerad"}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  className="button secondary"
                  disabled={past}
                  onClick={() => setError(onBook(due.id).join(" "))}
                >
                  Boka arbetstid före deadline
                </button>
              )}
              {w.activities.length > 0 &&
                due.steps.some(
                  (step) =>
                    !w.activities.some((a) => a.deadlineStepId === step.id),
                ) && (
                  <button
                    className="button secondary"
                    disabled={past}
                    onClick={() => setError(onBook(due.id).join(" "))}
                  >
                    Boka återstående delsteg
                  </button>
                )}
            </article>
          );
        })}
      </section>
    </details>
  );
}
