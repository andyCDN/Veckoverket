import { ArrowRight } from "lucide-react";
import type { Activity, AppData } from "@/lib/types";
import { addDays, time } from "@/lib/date";
import { categoryStyle } from "@/lib/presentation";

export function WeekExtras({
  data,
  week,
  activities,
  weekendOpen,
  onWeekend,
  onOpen,
}: {
  data: AppData;
  week: string;
  activities: Activity[];
  weekendOpen: boolean;
  onWeekend: () => void;
  onOpen: (a: Activity) => void;
}) {
  return (
    <section className="week-extras" aria-label="Helgens pass">
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
    </section>
  );
}
