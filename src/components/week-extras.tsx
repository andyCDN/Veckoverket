import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Activity, AppData } from "@/lib/types";
import { addDays, hours, time } from "@/lib/date";
import { categoryStyle } from "@/lib/presentation";
import { deadlineWork } from "@/lib/deadline-scheduling";

export function WeekExtras({
  data,
  week,
  activities,
  weekendOpen,
  onWeekend,
  onOpen,
  onBook,
  onCreate,
}: {
  data: AppData;
  week: string;
  activities: Activity[];
  weekendOpen: boolean;
  onWeekend: () => void;
  onOpen: (a: Activity) => void;
  onBook: (id: string) => string[];
  onCreate: () => void;
}) {
  const [error, setError] = useState("");
  const pending = deadlineWork(data).find(
    (work) =>
      work.deadline.date >= week &&
      work.deadline.date <= addDays(week, 6) &&
      work.deadline.steps.some(
        (step) => !work.activities.some((a) => a.deadlineStepId === step.id),
      ),
  );
  const minutes = pending?.deadline.steps
    .filter(
      (step) => !pending.activities.some((a) => a.deadlineStepId === step.id),
    )
    .reduce((sum, step) => sum + step.minutes, 0);
  return (
    <section className="week-extras" aria-label="Helg och obokad arbetstid">
      <div className="weekend-summaries">
        {[5, 6].map((day) => {
          const date = addDays(week, day),
            entries = activities
              .filter((a) => a.date === date)
              .sort((a, b) => a.start - b.start);
          return (
            <div className="weekend-summary" key={day}>
              <strong>
                {day === 5 ? "Lör" : "Sön"} {Number(date.slice(8))}
              </strong>
              {entries.length ? (
                <div className="weekend-entries">
                  {entries.map((a) => (
                    <button
                      key={a.id}
                      data-category={a.categoryId}
                      onClick={() => onOpen(a)}
                      style={categoryStyle(
                        data.categories.find((c) => c.id === a.categoryId),
                      )}
                    >
                      <strong>{a.title}</strong>
                      <small>
                        {a.external?.allDay
                          ? "Heldag"
                          : `${time(a.start)}–${time(a.end)}`}
                        {a.status === "done"
                          ? " · Genomförd"
                          : a.status === "skipped"
                            ? " · Missad"
                            : ""}
                      </small>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="weekend-free">
                  <strong>Ledig tid</strong>
                  <small>Inga bokade pass</small>
                </span>
              )}
            </div>
          );
        })}
        <button
          className="text-button weekend-toggle"
          aria-expanded={weekendOpen}
          onClick={onWeekend}
        >
          {weekendOpen ? "Dölj helgen" : "Visa helgen"}
          <ArrowRight size={17} />
        </button>
      </div>
      <div className="week-unplanned">
        <strong>Behöver planeras</strong>
        <div className="week-unplanned-row">
          <span>
            {pending
              ? `${pending.deadline.title} · ${(minutes ?? 0) < 60 ? `${minutes} min` : hours(minutes ?? 0)}`
              : "Inga obokade deadlinepass"}
          </span>
          <button
            className="button secondary"
            onClick={() =>
              pending
                ? setError(onBook(pending.deadline.id).join(" "))
                : onCreate()
            }
          >
            {pending ? "Boka tid" : "Nytt pass"}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
