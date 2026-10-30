"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, DAY_NAMES, fullDate, today } from "@/lib/date";
import type { Activity } from "@/lib/types";
export function DayFocus({
  week,
  days,
  activeDay,
  activities,
  onSelectDay,
}: {
  week: string;
  days: number[];
  activeDay: number;
  activities: Activity[];
  onSelectDay: (day: number) => void;
}) {
  const activeDate = addDays(week, activeDay);
  const activeActivities = activities.filter((a) => a.date === activeDate);
  const activeIndex = days.indexOf(activeDay);
  const currentDate = today();
  const isToday = activeDate === currentDate;
  const tone =
    activeDate < currentDate ? "is-past" : isToday ? "is-today" : "is-future";
  if (!days.length) return null;
  return (
    <div className={`day-focus ${tone}`} role="group" aria-label="Vald dag">
      <div className="day-focus-status">
        <span className={`focus-marker ${isToday ? "" : "is-past"}`}>
          {isToday ? "Idag" : "Vald dag"}
        </span>
        <span className="focus-index">
          {String(activeIndex + 1).padStart(2, "0")} /{" "}
          {String(days.length).padStart(2, "0")}
        </span>
      </div>
      <div className="day-focus-name" aria-live="polite" aria-atomic="true">
        <strong>{DAY_NAMES[activeDay]}</strong>
        <span>{fullDate(activeDate)}</span>
        <span className="mobile-day-summary">
          {activeActivities.length} pass ·{" "}
          {activeActivities.filter((a) => a.status === "done").length}{" "}
          genomförda
        </span>
      </div>
      <div className="day-focus-nav">
        <button
          aria-label="Välj föregående dag"
          disabled={activeIndex <= 0}
          onClick={() => onSelectDay(days[activeIndex - 1])}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          aria-label="Välj nästa dag"
          disabled={activeIndex >= days.length - 1}
          onClick={() => onSelectDay(days[activeIndex + 1])}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
