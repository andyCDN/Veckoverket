"use client";
import { useLayoutEffect, useState } from "react";
import type { Activity, Settings } from "@/lib/types";
import { addDays, fullDate } from "@/lib/date";
import { Modal } from "./modal";
import { TimeRangePicker } from "./time-range-picker";

export function PlanningShortcuts({
  week,
  activeDay,
  settings,
  activities,
  onCheck,
  onCreate,
  onEditing,
}: {
  week: string;
  activeDay: number;
  settings: Settings;
  activities: Activity[];
  onCheck: (kind: "week-start" | "week-review") => void;
  onCreate: (date: string, start: number, end: number) => void;
  onEditing: (editing: boolean) => void;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  useLayoutEffect(() => {
    onEditing(rangeOpen);
    return () => onEditing(false);
  }, [rangeOpen, onEditing]);
  return (
    <>
      <section
        className="planning-shortcuts"
        aria-label="Planera och checka in"
      >
        <div className="planning-checks">
          <button
            className="button secondary"
            onClick={() => onCheck("week-start")}
          >
            Måndagscheck
          </button>
          <button
            className="button secondary"
            onClick={() => onCheck("week-review")}
          >
            Fredagscheck
          </button>
        </div>
        <button className="button primary" onClick={() => setRangeOpen(true)}>
          Dra och boka
        </button>
      </section>
      {rangeOpen && (
        <RangeBooking
          week={week}
          initialDay={activeDay}
          settings={settings}
          activities={activities}
          onClose={() => setRangeOpen(false)}
          onCreate={(date, start, end) => {
            setRangeOpen(false);
            onCreate(date, start, end);
          }}
        />
      )}
    </>
  );
}
function RangeBooking({
  week,
  initialDay,
  settings,
  activities,
  onCreate,
  onClose,
}: {
  week: string;
  initialDay: number;
  settings: Settings;
  activities: Activity[];
  onCreate: (date: string, start: number, end: number) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(addDays(week, initialDay));
  const dayActivities = activities.filter((a) => a.date === date);
  return (
    <Modal title="Dra och boka" onClose={onClose}>
      <div className="stack planning-range-dialog">
        <label>
          Välj dag
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {Array.from({ length: 7 }, (_, day) => {
              const d = addDays(week, day);
              return (
                <option key={d} value={d}>
                  {fullDate(d)}
                </option>
              );
            })}
          </select>
        </label>
        <TimeRangePicker
          key={date}
          date={date}
          start={Math.min(settings.start, ...dayActivities.map((a) => a.start))}
          end={Math.max(settings.end, ...dayActivities.map((a) => a.end))}
          activities={activities}
          onCreate={onCreate}
          defaultOpen
        />
      </div>
    </Modal>
  );
}
