"use client";
import { useCallback, useEffect, useRef } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  LockKeyhole,
  ShieldCheck,
  Check,
  Plus,
  GripVertical,
  X,
} from "lucide-react";
import type { Activity, AppData } from "@/lib/types";
import { addDays, DAY_NAMES, fullDate, time, today } from "@/lib/date";
import { canFollowUp } from "@/lib/follow-up";
import { visibleDays } from "@/lib/planner";
import { categoryLabel, categoryStyle } from "@/lib/presentation";
import { GOOGLE_CATEGORY_ID } from "@/lib/external-calendar";
import { weekTimeline } from "@/lib/week-timeline";
import { canSwapActivity } from "@/lib/activity-swap";

const calendarCollision: CollisionDetection = (args) => {
  const collisions = args.pointerCoordinates
    ? pointerWithin(args)
    : rectIntersection(args);
  const cards = collisions.filter(
    (collision) =>
      String(collision.id).startsWith("swap:") &&
      collision.id !== `swap:${args.active.id}`,
  );
  return cards.length ? cards : collisions;
};
function CalendarBlock({
  a,
  category,
  canMove,
  deadlineDate,
  filteredOut,
  onEdit,
  onStatusChange,
  onDelete,
  placement,
}: {
  a: Activity;
  category: AppData["categories"][number] | undefined;
  canMove: boolean;
  deadlineDate?: string;
  filteredOut: boolean;
  onEdit: () => void;
  onStatusChange: (status: Activity["status"]) => void;
  onDelete: () => void;
  placement?: { top: number; height: number; lane: number; count: number };
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: a.id, disabled: !canMove });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `swap:${a.id}`,
    disabled: filteredOut,
    data: { activityId: a.id, date: a.date },
  });
  const setEntryRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      setDropRef(node);
    },
    [setNodeRef, setDropRef],
  );
  const family = a.categoryId === "family",
    lunch = a.categoryId === "rest" && a.blockType === "locked";
  return (
    <div
      ref={setEntryRef}
      data-activity-id={a.id}
      className={`calendar-entry ${isOver && !isDragging ? "is-swap-target" : ""} ${a.status === "skipped" ? "is-missed" : ""} ${filteredOut ? "is-filtered-out" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={
        {
          ...categoryStyle(category),
          "--event-top": `${placement?.top ?? 0}px`,
          "--event-height": `${placement?.height ?? 0}px`,
          "--event-lane": placement?.lane ?? 0,
          "--event-lanes": placement?.count ?? 1,
          transform: transform
            ? `translate3d(${transform.x}px,${transform.y}px,0)`
            : undefined,
        } as React.CSSProperties
      }
    >
      <button
        ref={setActivatorNodeRef}
        {...(canMove ? attributes : {})}
        {...(canMove ? listeners : {})}
        type="button"
        onClick={onEdit}
        title={`${a.title} · ${categoryLabel(category)} · ${time(a.start)}–${time(a.end)}`}
        tabIndex={filteredOut ? -1 : 0}
        aria-label={`${a.title}, ${categoryLabel(category)}, ${time(a.start)} till ${time(a.end)}${a.status === "done" ? ", genomförd" : a.status === "skipped" ? ", missat" : ""}. ${a.routine ? "Öppna övning" : "Redigera aktivitet"}`}
        data-routine={a.routine}
        className={`calendar-block ${filteredOut ? "is-filtered-out" : ""} ${family ? "family" : ""} ${lunch ? "lunch" : ""} ${a.status === "done" ? "is-done" : ""} ${a.status === "skipped" ? "is-skipped" : ""} ${isDragging ? "dragging" : ""}`}
      >
        <span className="block-time">
          {a.external?.allDay ? "Heldag" : `${time(a.start)}–${time(a.end)}`}
          <span>
            {a.blockType === "locked" ? (
              <LockKeyhole size={11} />
            ) : a.blockType === "protected" ? (
              <ShieldCheck size={12} />
            ) : canMove ? (
              <GripVertical size={12} />
            ) : null}
          </span>
        </span>
        <span className="block-category">
          {categoryLabel(category)}
          {a.external
            ? `${a.categoryId !== GOOGLE_CATEGORY_ID ? " · Google" : ""}${a.external.busy ? " · Upptagen" : " · Ledig"}`
            : ""}
        </span>
        {deadlineDate && (
          <span className="block-deadline">Deadline {deadlineDate}</span>
        )}
        <span className="block-title">{a.title}</span>
        {a.end - a.start >= 100 && (
          <span className="block-subtitle">
            {a.description ||
              (a.blockType === "protected"
                ? "Sammanhängande pass"
                : category?.name)}
          </span>
        )}
      </button>
      <div className="calendar-event-actions">
        <label
          className="calendar-completion"
          title={
            a.status === "done"
              ? "Återställ till planerad"
              : "Markera som genomförd"
          }
        >
          <input
            type="checkbox"
            checked={a.status === "done"}
            tabIndex={filteredOut ? -1 : 0}
            aria-label={`Genomförd: ${a.title}, ${a.date} ${time(a.start)}–${time(a.end)}`}
            onChange={(event) =>
              onStatusChange(event.target.checked ? "done" : "planned")
            }
          />
          <span className="completion-box" aria-hidden="true">
            {a.status === "done" && <Check size={11} />}
          </span>
          <span className="completion-label" aria-hidden="true">
            {a.status === "done" ? "Klart" : "Klar?"}
          </span>
        </label>
        {canFollowUp(a) && (
          <label
            className="calendar-missed"
            title={
              a.status === "skipped"
                ? "Återställ till planerad"
                : "Markera som missat"
            }
          >
            <input
              type="checkbox"
              checked={a.status === "skipped"}
              tabIndex={filteredOut ? -1 : 0}
              aria-label={`Missat: ${a.title}, ${a.date} ${time(a.start)}–${time(a.end)}`}
              onChange={(event) =>
                onStatusChange(event.target.checked ? "skipped" : "planned")
              }
            />
            <span className="completion-box" aria-hidden="true">
              {a.status === "skipped" && <X size={11} />}
            </span>
            <span className="completion-label" aria-hidden="true">
              {a.status === "skipped" ? "Missat" : "Missat?"}
            </span>
          </label>
        )}
        {!a.external && (
          <button
            className="session-remove"
            aria-label={`Ta bort pass: ${a.title}, ${a.date}`}
            tabIndex={filteredOut ? -1 : 0}
            onClick={onDelete}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
function DayColumn({
  date,
  children,
  onCreate,
}: {
  date: string;
  children: React.ReactNode;
  onCreate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  return (
    <div
      ref={setNodeRef}
      className={`day-column ${isOver ? "drop-over" : ""}`}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) {
          onCreate();
        }
      }}
    >
      {children}
    </div>
  );
}
export function Calendar({
  activeDay,
  onSelectDay,
  onDelete,
  week,
  data,
  activities,
  categoryFilter = "all",
  onEdit,
  onMove,
  onSwap,
  onCreate,
  onStatusChange,
  mobile = false,
}: {
  week: string;
  data: AppData;
  activities: Activity[];
  categoryFilter?: string;
  onEdit: (a: Activity) => void;
  onMove: (a: Activity, date: string, start: number) => void;
  onSwap: (a: Activity, target: Activity) => void;
  onCreate: (date: string, start?: number) => void;
  onStatusChange: (activity: Activity, status: Activity["status"]) => void;
  activeDay: number;
  onSelectDay: (day: number) => void;
  onDelete: (a: Activity) => void;
  mobile?: boolean;
}) {
  const weekDays = visibleDays(data.settings, activities);
  const days = mobile ? [0, 1, 2, 3, 4, 5, 6] : weekDays;
  const completedDays = new Set(
    days.filter((day) => {
      const entries = activities.filter((a) => a.date === addDays(week, day));
      return entries.length > 0 && entries.every((a) => a.status === "done");
    }),
  );
  const viewport = useRef<HTMLDivElement>(null);
  const activeDate = addDays(week, activeDay);
  const currentDate = today();
  const dayTone = (date: string) =>
    date < currentDate
      ? "is-past"
      : date === currentDate
        ? "is-today"
        : "is-future";
  const mobileOrder = [activeDay, ...days.filter((day) => day !== activeDay)];
  useEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const align = () => {
      if (container.scrollWidth > container.clientWidth)
        container.scrollTo({ left: 0, behavior: "instant" });
    };
    const observer = new ResizeObserver(align);
    observer.observe(container);
    align();
    return () => observer.disconnect();
  }, [week, activeDay]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  function dragEnd(e: DragEndEvent) {
    const a = activities.find((a) => a.id === e.active.id);
    if (!a || !e.over) return;
    const target = activities.find(
      (a) => a.id === e.over!.data.current?.activityId,
    );
    if (target) {
      if (target.id !== a.id) onSwap(a, target);
      return;
    }
    const date = String(e.over.id);
    if (date === a.date) return;
    onMove(a, date, a.start);
  }
  if (!days.length)
    return (
      <div className="empty-state">
        <h3>Inga planeringsdagar</h3>
        <p>Välj vilka dagar du vill planera i inställningarna.</p>
      </div>
    );
  const timeline = weekTimeline(activities, data.settings);
  return (
    <div
      className={`calendar-wrap ${mobile ? "" : "week-timeline"}`}
      style={
        { "--timeline-height": `${timeline.height}px` } as React.CSSProperties
      }
    >
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
          className="calendar-viewport"
          data-active-day={activeDay}
          ref={viewport}
          role="region"
          aria-label={
            mobile
              ? `Aktiviteter för ${fullDate(activeDate)}`
              : "Kalender, rulla i sidled för fler dagar"
          }
          tabIndex={mobile ? -1 : 0}
        >
          <div
            className="calendar-grid"
            style={
              {
                "--days": weekDays.length,
                "--mobile-days": days.length,
                "--day-columns": `repeat(${days.length}, minmax(0, 1fr))`,
                "--mobile-columns": mobileOrder
                  .map((d) =>
                    d === activeDay
                      ? "var(--active-column-width)"
                      : completedDays.has(d)
                        ? "var(--completed-column-width)"
                        : "var(--other-column-width)",
                  )
                  .join(" "),
              } as React.CSSProperties
            }
          >
            <div className="week-axis-heading" aria-hidden="true">
              Tid
            </div>
            <div className="week-time-axis" aria-hidden="true">
              {timeline.ticks.map(({ minute, top }) => (
                <span key={minute} style={{ top }}>
                  {time(minute)}
                </span>
              ))}
            </div>
            {days.map((d) => {
              const date = addDays(week, d);
              return (
                <div
                  className={`day-heading ${d === activeDay ? "is-selected mobile-active" : ""} ${dayTone(date)} ${completedDays.has(d) ? "is-completed" : ""} ${weekDays.includes(d) ? "" : "is-off-plan"}`}
                  key={d}
                  data-day={d}
                  style={
                    {
                      "--desktop-column": weekDays.indexOf(d) + 1,
                      "--mobile-column":
                        (mobile ? days : mobileOrder).indexOf(d) + 1,
                    } as React.CSSProperties
                  }
                >
                  <button
                    type="button"
                    className="day-select"
                    aria-label={`Visa ${DAY_NAMES[d].toLowerCase()} ${fullDate(date)}${completedDays.has(d) ? ", avklarad" : ""}`}
                    aria-pressed={d === activeDay}
                    onClick={() => onSelectDay(d)}
                  >
                    <span className="day-name">
                      <span className="day-name-wide">
                        {mobile && d === activeDay
                          ? DAY_NAMES[d]
                          : DAY_NAMES[d].slice(0, 3)}
                      </span>
                      <span className="day-name-short" aria-hidden="true">
                        {DAY_NAMES[d].slice(0, 2)}
                      </span>
                    </span>
                    <span className="day-meta">
                      <strong>
                        {Number(date.slice(8))}/{Number(date.slice(5, 7))}
                      </strong>
                      <span className="day-count screen-count">
                        {
                          activities.filter(
                            (a) =>
                              a.date === date &&
                              (categoryFilter === "all" ||
                                a.categoryId === categoryFilter),
                          ).length
                        }{" "}
                        pass
                      </span>
                      <span className="day-count print-count">
                        {activities.filter((a) => a.date === date).length} pass
                      </span>
                    </span>
                    {completedDays.has(d) && (
                      <span className="day-completed">
                        <Check size={11} aria-hidden="true" /> Avklarad
                      </span>
                    )}
                    {d === activeDay ? (
                      <span className="day-flag">
                        {date === currentDate ? "Idag" : "Vald dag"}
                      </span>
                    ) : date === currentDate ? (
                      <span className="day-flag">Idag</span>
                    ) : null}
                  </button>
                  <span className="day-index" aria-hidden="true">
                    {String(days.indexOf(d) + 1).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
            {days.map((d) => {
              const date = addDays(week, d);
              return (
                <div
                  className={`day-shell ${d === activeDay ? "is-selected mobile-active" : ""} ${dayTone(date)} ${completedDays.has(d) ? "is-completed" : ""} ${weekDays.includes(d) ? "" : "is-off-plan"}`}
                  key={date}
                  style={
                    {
                      "--desktop-column": weekDays.indexOf(d) + 1,
                      "--mobile-column":
                        (mobile ? days : mobileOrder).indexOf(d) + 1,
                    } as React.CSSProperties
                  }
                >
                  <DayColumn date={date} onCreate={() => onCreate(date)}>
                    <div className="week-time-lines" aria-hidden="true">
                      {timeline.ticks.map(({ minute, top }) => (
                        <span key={minute} style={{ top }} />
                      ))}
                    </div>
                    {activities
                      .filter((a) => a.date === date)
                      .sort(
                        (a, b) => a.start - b.start || a.id.localeCompare(b.id),
                      )
                      .map((a) => (
                        <CalendarBlock
                          deadlineDate={
                            a.deadlineId
                              ? (data.deadlines?.find(
                                  (d) => d.id === a.deadlineId,
                                )?.date ??
                                data.applications?.find(
                                  (app) => app.id === a.applicationId,
                                )?.deadline)
                              : undefined
                          }
                          key={a.id}
                          a={a}
                          placement={timeline.entries.get(a.id)}
                          filteredOut={
                            categoryFilter !== "all" &&
                            a.categoryId !== categoryFilter
                          }
                          category={data.categories.find(
                            (c) => c.id === a.categoryId,
                          )}
                          canMove={!mobile && canSwapActivity(a, data)}
                          onDelete={() => onDelete(a)}
                          onEdit={() => onEdit(a)}
                          onStatusChange={(status) => onStatusChange(a, status)}
                        />
                      ))}
                    {!activities.some(
                      (a) =>
                        a.date === date &&
                        (categoryFilter === "all" ||
                          a.categoryId === categoryFilter),
                    ) && (
                      <p className="day-empty">
                        {categoryFilter === "all"
                          ? "Inga pass denna dag"
                          : "Inga pass i vald kategori"}
                      </p>
                    )}
                    <button
                      className="day-bottom-add"
                      aria-label={`Lägg till aktivitet ${DAY_NAMES[d].toLowerCase()}`}
                      onClick={() => onCreate(date)}
                    >
                      <Plus size={13} />
                      Lägg till pass
                    </button>
                  </DayColumn>
                </div>
              );
            })}
          </div>
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
          Dra över ett annat pass för att byta plats · Klicka för att redigera
        </span>
      </div>
    </div>
  );
}
