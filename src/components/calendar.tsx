"use client";
import { useEffect, useRef } from "react";
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
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import type { Activity, AppData } from "@/lib/types";
import { addDays, DAY_NAMES, fullDate, time, today } from "@/lib/date";
import { canFollowUp } from "@/lib/follow-up";
import { visibleDays } from "@/lib/planner";
import { categoryLabel, categoryStyle } from "@/lib/presentation";
function CalendarBlock({
  a,
  category,
  canMove,
  filteredOut,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  a: Activity;
  category: AppData["categories"][number] | undefined;
  canMove: boolean;
  filteredOut: boolean;
  onEdit: () => void;
  onStatusChange: (status: Activity["status"]) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: a.id, disabled: !canMove });
  const family = a.categoryId === "family",
    lunch = a.categoryId === "rest" && a.blockType === "locked";
  return (
    <div
      ref={setNodeRef}
      data-activity-id={a.id}
      className={`calendar-entry ${a.status === "skipped" ? "is-missed" : ""} ${filteredOut ? "is-filtered-out" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={
        {
          ...categoryStyle(category),
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
          {a.external ? (a.external.busy ? " · Upptagen" : " · Ledig") : ""}
        </span>
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
  const activeActivities = activities.filter((a) => a.date === activeDate);
  const currentDate = today();
  const dayTone = (date: string) =>
    date < currentDate
      ? "is-past"
      : date === currentDate
        ? "is-today"
        : "is-future";
  const isToday = activeDate === currentDate;
  const activeIndex = days.indexOf(activeDay);
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
    const date = String(e.over.id);
    onMove(a, date, a.start);
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
      <div
        className={`day-focus ${dayTone(activeDate)}`}
        role="group"
        aria-label="Vald dag"
      >
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
                "--day-columns": days
                  .map(
                    (d) =>
                      `minmax(0,${d === activeDay ? 1.9 : completedDays.has(d) ? 0.65 : 1}fr)`,
                  )
                  .join(" "),
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
                        {d === activeDay
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
                        {date === currentDate
                          ? "Idag / aktiv dag"
                          : "Vald dag / aktiv"}
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
                    {activities
                      .filter((a) => a.date === date)
                      .sort(
                        (a, b) => a.start - b.start || a.id.localeCompare(b.id),
                      )
                      .map((a) => (
                        <CalendarBlock
                          key={a.id}
                          a={a}
                          filteredOut={
                            categoryFilter !== "all" &&
                            a.categoryId !== categoryFilter
                          }
                          category={data.categories.find(
                            (c) => c.id === a.categoryId,
                          )}
                          canMove={
                            !mobile &&
                            a.blockType !== "locked" &&
                            Boolean(
                              data.categories.find((c) => c.id === a.categoryId)
                                ?.movable,
                            ) &&
                            (a.categoryId !== "music" ||
                              data.settings.musicMovable)
                          }
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
          Klicka för att ändra tid · Dra till en annan dag
        </span>
      </div>
    </div>
  );
}
