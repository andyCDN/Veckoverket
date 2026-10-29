"use client";
import { useState } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  LockKeyhole,
  ShieldCheck,
  Check,
  Plus,
  GripVertical,
} from "lucide-react";
import type { Activity, AppData } from "@/lib/types";
import { addDays, DAY_NAMES, time, today, weekday } from "@/lib/date";
import { plannedDays } from "@/lib/planner";
const PX_PER_MINUTE = 1.12;
function CalendarBlock({
  a,
  category,
  top,
  canMove,
  onEdit,
}: {
  a: Activity;
  category: AppData["categories"][number] | undefined;
  top: number;
  canMove: boolean;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: a.id, disabled: !canMove });
  const family = a.categoryId === "family",
    lunch = a.categoryId === "rest" && a.blockType === "locked";
  return (
    <button
      ref={setNodeRef}
      {...(canMove ? attributes : {})}
      {...(canMove ? listeners : {})}
      type="button"
      onClick={onEdit}
      aria-label={`${a.title}, ${time(a.start)} till ${time(a.end)}${a.status === "done" ? ", genomförd" : ""}. Redigera aktivitet`}
      className={`calendar-block ${family ? "family" : ""} ${lunch ? "lunch" : ""} ${a.status === "done" ? "is-done" : ""} ${a.status === "skipped" ? "is-skipped" : ""} ${isDragging ? "dragging" : ""}`}
      style={
        {
          top,
          height: Math.max(24, (a.end - a.start) * PX_PER_MINUTE - 5),
          "--category": category?.color ?? "#83847e",
          transform: transform
            ? `translate3d(${transform.x}px,${transform.y}px,0)`
            : undefined,
        } as React.CSSProperties
      }
    >
      <span className="block-time">
        {time(a.start)}–{time(a.end)}
        <span>
          {a.status === "done" ? (
            <Check size={12} />
          ) : a.blockType === "locked" ? (
            <LockKeyhole size={11} />
          ) : a.blockType === "protected" ? (
            <ShieldCheck size={12} />
          ) : canMove ? (
            <GripVertical size={12} />
          ) : null}
        </span>
      </span>
      <span className="block-title">{a.title}</span>
      {a.end - a.start >= 100 && (
        <span className="block-subtitle">
          {a.blockType === "protected" ? "Sammanhängande pass" : category?.name}
        </span>
      )}
    </button>
  );
}
function DayColumn({
  date,
  children,
  height,
  onCreate,
}: {
  date: string;
  children: React.ReactNode;
  height: number;
  onCreate: (start: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  return (
    <div
      ref={setNodeRef}
      className={`day-column ${isOver ? "drop-over" : ""}`}
      style={{ height }}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          onCreate(e.clientY - rect.top);
        }
      }}
    >
      {children}
    </div>
  );
}
export function Calendar({
  week,
  data,
  activities,
  onEdit,
  onMove,
  onCreate,
}: {
  week: string;
  data: AppData;
  activities: Activity[];
  onEdit: (a: Activity) => void;
  onMove: (a: Activity, date: string, start: number) => void;
  onCreate: (date: string, start?: number) => void;
}) {
  const days = plannedDays(data.settings);
  const [mobileDay, setMobileDay] = useState(
    weekday(today()) < 5 ? weekday(today()) : 0,
  );
  const activeDay = days.includes(mobileDay) ? mobileDay : days[0];
  const start = Math.min(
      data.settings.start,
      ...activities.map((a) => a.start),
    ),
    end = Math.max(data.settings.end, ...activities.map((a) => a.end));
  const height = (end - start) * PX_PER_MINUTE;
  const ticks = Array.from(
    { length: Math.ceil((end - start) / 60) + 1 },
    (_, i) => start + i * 60,
  ).filter((n) => n <= end);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  function dragEnd(e: DragEndEvent) {
    const a = activities.find((a) => a.id === e.active.id);
    if (!a || !e.over) return;
    const date = String(e.over.id);
    const movedStart =
      a.start + Math.round(e.delta.y / PX_PER_MINUTE / 15) * 15;
    onMove(a, date, movedStart);
  }
  if (!days.length)
    return (
      <div className="empty-state">
        <h3>Inga planeringsdagar</h3>
        <p>Välj vilka dagar du vill planera i inställningarna.</p>
      </div>
    );
  return (
    <div className="calendar-wrap">
      <div className="mobile-days" role="group" aria-label="Välj dag">
        {days.map((d) => (
          <button
            className={d === activeDay ? "active" : ""}
            key={d}
            onClick={() => setMobileDay(d)}
          >
            {DAY_NAMES[d].slice(0, 3)}
            <strong>{Number(addDays(week, d).slice(8))}</strong>
          </button>
        ))}
      </div>
      <DndContext
        sensors={sensors}
        onDragEnd={dragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) =>
              `Flyttar ${activities.find((a) => a.id === active.id)?.title ?? "aktivitet"}.`,
            onDragOver: ({ over }) =>
              over ? `Över ${String(over.id)}.` : "Utanför kalendern.",
            onDragEnd: () =>
              "Flytten har avslutats. Eventuella konflikter visas som meddelande.",
            onDragCancel: () => "Flytten avbröts.",
          },
          screenReaderInstructions: {
            draggable:
              "Tryck blanksteg för att börja flytta, piltangenter för att flytta och blanksteg för att släppa. Du kan också öppna aktiviteten och ändra tid och datum i formuläret.",
          },
        }}
      >
        <div
          className="calendar-grid"
          style={{ "--days": days.length } as React.CSSProperties}
        >
          <div className="time-heading">Tid</div>
          {days.map((d) => {
            const date = addDays(week, d);
            return (
              <div
                className={`day-heading ${d === activeDay ? "mobile-active" : ""} ${date === today() ? "is-today" : ""}`}
                key={d}
              >
                <span>{DAY_NAMES[d]}</span>
                <strong>{Number(date.slice(8))}</strong>
                {date === today() && <i aria-label="Idag" />}
                <button
                  className="day-add"
                  aria-label={`Lägg till aktivitet ${DAY_NAMES[d].toLowerCase()}`}
                  onClick={() => onCreate(date)}
                >
                  <Plus size={15} />
                </button>
              </div>
            );
          })}
          <div className="time-axis" style={{ height }}>
            {ticks.map((n) => (
              <span key={n} style={{ top: (n - start) * PX_PER_MINUTE }}>
                {time(n)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const date = addDays(week, d);
            return (
              <div
                className={`day-shell ${d === activeDay ? "mobile-active" : ""}`}
                key={date}
              >
                <DayColumn
                  date={date}
                  height={height}
                  onCreate={(y) =>
                    onCreate(
                      date,
                      Math.max(
                        start,
                        Math.min(
                          end - 30,
                          start + Math.floor(y / PX_PER_MINUTE / 15) * 15,
                        ),
                      ),
                    )
                  }
                >
                  {ticks.map((n) => (
                    <div
                      className="hour-line"
                      key={n}
                      style={{ top: (n - start) * PX_PER_MINUTE }}
                    />
                  ))}
                  {activities
                    .filter((a) => a.date === date)
                    .map((a) => (
                      <CalendarBlock
                        key={a.id}
                        a={a}
                        category={data.categories.find(
                          (c) => c.id === a.categoryId,
                        )}
                        top={(a.start - start) * PX_PER_MINUTE}
                        canMove={
                          a.blockType !== "locked" &&
                          Boolean(
                            data.categories.find((c) => c.id === a.categoryId)
                              ?.movable,
                          ) &&
                          (a.categoryId !== "music" ||
                            data.settings.musicMovable)
                        }
                        onEdit={() => onEdit(a)}
                      />
                    ))}
                </DayColumn>
              </div>
            );
          })}
        </div>
      </DndContext>
      <div className="calendar-footer">
        <span>
          <LockKeyhole size={12} /> Låst tid
        </span>
        <span>
          <ShieldCheck size={13} /> Skyddad tid
        </span>
        <span className="calendar-hint">
          Klicka för att redigera · Dra för att flytta
        </span>
      </div>
    </div>
  );
}
