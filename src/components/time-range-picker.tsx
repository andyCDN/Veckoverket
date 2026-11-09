"use client";
import { useId, useRef, useState } from "react";
import { time } from "@/lib/date";
import type { Activity } from "@/lib/types";

const STEP = 15;
export function TimeRangePicker({
  date,
  start,
  end,
  activities,
  onCreate,
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
  date: string;
  start: number;
  end: number;
  activities: Activity[];
  onCreate: (date: string, start: number, end: number) => void;
}) {
  const hintId = useId();
  const [expanded, setExpanded] = useState(defaultOpen);
  const [selection, setSelection] = useState<{
    anchor: number;
    cursor: number;
  } | null>(null);
  const pointer = useRef<number | null>(null);
  const from = Math.max(0, Math.floor(start / 60) * 60);
  const to = Math.min(1440, Math.ceil(end / 60) * 60);
  const range = (value: { anchor: number; cursor: number }) => {
    const first = Math.min(value.anchor, value.cursor);
    return {
      start: first,
      end: Math.max(first + STEP, value.anchor, value.cursor),
    };
  };
  const position = (minute: number) =>
    `${((minute - from) / (to - from)) * 100}%`;
  const minuteAt = (element: HTMLElement, clientY: number) => {
    const rect = element.getBoundingClientRect();
    return Math.max(
      from,
      Math.min(
        to,
        Math.round(
          (from + ((clientY - rect.top) / rect.height) * (to - from)) / STEP,
        ) * STEP,
      ),
    );
  };
  const selected = selection ? range(selection) : null;
  const hours: number[] = [];
  for (let minute = from; minute <= to; minute += 60) hours.push(minute);
  return (
    <details
      className="time-range-picker"
      open={expanded}
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
        if (!event.currentTarget.open) {
          pointer.current = null;
          setSelection(null);
        }
      }}
    >
      <summary>Markera tid för nytt pass</summary>
      <p id={hintId}>
        Dra från start till slut i tidsaxeln. Tider avrundas till 15 minuter.
        Med tangentbord: piltangenter väljer start, Skift + pil ändrar längden
        och Enter öppnar passet. Escape avbryter.
      </p>
      <div
        className="time-range-surface"
        style={{ height: Math.max(240, (to - from) * 0.8) }}
        tabIndex={0}
        role="group"
        aria-label="Markera tidsperiod"
        aria-describedby={hintId}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = event.pointerId;
          const anchor = Math.min(
            to - STEP,
            minuteAt(event.currentTarget, event.clientY),
          );
          setSelection({ anchor, cursor: anchor });
        }}
        onPointerMove={(event) => {
          if (pointer.current !== event.pointerId) return;
          const cursor = minuteAt(event.currentTarget, event.clientY);
          setSelection((value) => (value ? { ...value, cursor } : value));
        }}
        onPointerUp={(event) => {
          if (pointer.current !== event.pointerId || !selection) return;
          const value = range({
            ...selection,
            cursor: minuteAt(event.currentTarget, event.clientY),
          });
          pointer.current = null;
          setSelection(null);
          onCreate(date, value.start, value.end);
        }}
        onPointerCancel={() => {
          pointer.current = null;
          setSelection(null);
        }}
        onLostPointerCapture={() => {
          pointer.current = null;
          setSelection(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            pointer.current = null;
            setSelection(null);
          } else if (event.key === "Enter" && selected) {
            event.preventDefault();
            setSelection(null);
            onCreate(date, selected.start, selected.end);
          } else if (["ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            const delta = event.key === "ArrowUp" ? -STEP : STEP;
            setSelection((value) => {
              if (!value) return { anchor: from, cursor: from + STEP };
              if (event.shiftKey)
                return {
                  ...value,
                  cursor: Math.max(from, Math.min(to, value.cursor + delta)),
                };
              const anchor = Math.max(
                from,
                Math.min(to - STEP, value.anchor + delta),
              );
              return { anchor, cursor: anchor + STEP };
            });
          }
        }}
      >
        {hours.map((minute) => (
          <div
            className="time-range-tick"
            key={minute}
            style={{ top: position(minute) }}
          >
            <span>{time(minute)}</span>
          </div>
        ))}
        {activities
          .filter((activity) => activity.date === date)
          .map((activity) => (
            <div
              key={activity.id}
              className="time-range-booked"
              style={{
                top: position(activity.start),
                height: `${((activity.end - activity.start) / (to - from)) * 100}%`,
              }}
            >
              {time(activity.start)}–{time(activity.end)} {activity.title}
            </div>
          ))}
        {selected && (
          <div
            className="time-range-selection"
            style={{
              top: position(selected.start),
              height: `${((selected.end - selected.start) / (to - from)) * 100}%`,
            }}
          >
            {time(selected.start)}–{time(selected.end)}
          </div>
        )}
      </div>
      <p className="time-range-status" role="status">
        {selected
          ? `${time(selected.start)}–${time(selected.end)}`
          : "Ingen tid markerad. Du kan också använda Nytt pass och ange tiderna själv."}
      </p>
    </details>
  );
}
