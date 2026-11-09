"use client";
import { useState } from "react";
import type { Activity, AppData } from "@/lib/types";
import {
  addDays,
  fullDate,
  monday,
  planningBoundary,
  time,
  weekNumber,
} from "@/lib/date";
import { habitPlanned, effectiveHabitChecks, habitWeek } from "@/lib/habits";
import {
  weeklyWorkOptions,
  tasksInWeek,
  type WorkOption,
  previewWeeklyWork,
  weeklyGoals,
  workBookings,
  type WorkRequest,
  type WorkPreview,
} from "@/lib/weekly-work";
import { plannedDays } from "@/lib/planner";
import { taskStage } from "@/lib/task-workflow";
import { Modal } from "./modal";

export function WeeklyGoals({
  data,
  week,
  onAddTask,
  onToggle,
  onReview,
  onPlan,
  onOpen,
}: {
  data: AppData;
  week: string;
  onAddTask: (goalId: string, title: string) => void;
  onToggle: (id: string) => void;
  onReview: (id: string) => void;
  onPlan: (taskId?: string) => void;
  onOpen: (a: Activity) => void;
}) {
  const goals = weeklyGoals(data, week).sort((a, b) => {
    const rank = (id: string) => {
      const tasks = tasksInWeek(data, week).filter((t) => t.goalId === id);
      if (!tasks.length) return 1;
      return Math.min(
        ...tasks.map((t) => {
          const stage = taskStage(data, t);
          return stage === "followup" ||
            (stage === "waiting" &&
              t.reviewOn &&
              t.reviewOn <= planningBoundary().date)
            ? 0
            : stage === "unplanned"
              ? 1
              : stage === "booked"
                ? 2
                : stage === "waiting"
                  ? 3
                  : 4;
        }),
      );
    };
    return rank(a.id) - rank(b.id);
  });
  const [showAll, setShowAll] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [changed, setChanged] = useState<string[]>([]);
  return (
    <section className="weekly-goal-panel" aria-label="Veckans mål i kalendern">
      <header>
        <div>
          <small>V.{weekNumber(week)} · från mål till handling</small>
          <h2>Veckans mål</h2>
        </div>
      </header>
      {!goals.length && (
        <p>
          Måndagschecken hjälper dig välja mål och uppgifter. Du kan också
          använda Lägg till.
        </p>
      )}
      {(showAll ? goals : goals.slice(0, 2)).map((goal) => {
        const tasks = tasksInWeek(data, week).filter(
          (t) => t.goalId === goal.id,
        );
        return (
          <article key={goal.id}>
            <h3>{goal.title}</h3>
            {goal.week !== week && (
              <small>Ursprungligt mål: vecka {weekNumber(goal.week)}</small>
            )}
            <p>
              {tasks.filter((t) => t.done).length} av {tasks.length} uppgifter
              klara
            </p>
            {!tasks.length && (
              <p>Lägg till en konkret uppgift för att planera målet.</p>
            )}
            <ul>
              {tasks
                .filter(
                  (task) =>
                    showClosed ||
                    changed.includes(task.id) ||
                    (!task.done && task.state !== "dropped"),
                )
                .map((task) => {
                  const bookings = workBookings(data, "task", task.id);
                  const booking =
                    bookings.find((a) => a.status === "planned") ??
                    bookings.at(-1);
                  return (
                    <li key={task.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => {
                            setChanged((old) => [...old, task.id]);
                            onToggle(task.id);
                          }}
                        />
                        <span>{task.title}</span>
                      </label>
                      {task.state === "waiting" && (
                        <small>
                          Väntar på {task.waitingFor} · följ upp {task.reviewOn}
                        </small>
                      )}
                      {!task.done &&
                        task.state !== "dropped" &&
                        (taskStage(data, task) === "followup" ||
                        task.state === "waiting" ? (
                          <button
                            className="text-button"
                            onClick={() => onReview(task.id)}
                          >
                            Följ upp
                          </button>
                        ) : booking && !task.needsPlanning ? (
                          <button
                            className="text-button"
                            onClick={() => onOpen(booking)}
                          >
                            Öppna pass · {fullDate(booking.date)}
                          </button>
                        ) : (
                          <button
                            className="text-button"
                            onClick={() => onPlan(task.id)}
                          >
                            Planera
                          </button>
                        ))}
                    </li>
                  );
                })}
            </ul>
            <details open={!tasks.length} className="weekly-add-task">
              <summary>Lägg till uppgift</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const input = event.currentTarget.elements.namedItem(
                    "title",
                  ) as HTMLInputElement;
                  if (input.value.trim()) {
                    onAddTask(goal.id, input.value.trim());
                    event.currentTarget.reset();
                  }
                }}
              >
                <label>
                  Ny uppgift
                  <input
                    name="title"
                    required
                    maxLength={200}
                    aria-label={`Ny uppgift för ${goal.title}`}
                    placeholder="En konkret handling"
                  />
                </label>
                <button className="button secondary">Lägg till</button>
              </form>
            </details>
          </article>
        );
      })}
      {goals.length > 2 && (
        <button className="text-button" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Visa färre mål" : `Visa alla ${goals.length} mål`}
        </button>
      )}
      {goals.some((g) =>
        data.tasks.some(
          (t) => t.goalId === g.id && (t.done || t.state === "dropped"),
        ),
      ) && (
        <label className="show-closed-tasks">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Visa klara och släppta uppgifter
        </label>
      )}
    </section>
  );
}

export function WeeklyWorkPlanner({
  data,
  week,
  scope,
  onClose,
  onApply,
  embedded = false,
}: {
  data: AppData;
  week: string;
  embedded?: boolean;
  scope?: { taskId?: string; habitId?: string };
  onClose: () => void;
  onApply: (next: AppData, base: AppData) => boolean;
}) {
  const [options, setOptions] = useState(() =>
    weeklyWorkOptions(data, week, scope),
  );
  const [preview, setPreview] = useState<{
    base: AppData;
    result: WorkPreview;
  } | null>(null);
  const [error, setError] = useState("");
  const change = (key: string, patch: Partial<WorkOption>) => {
    setOptions((old) =>
      old.map((o) => (o.key === key ? { ...o, ...patch } : o)),
    );
    setPreview(null);
    setError("");
  };
  const content = (
    <div className="stack weekly-work-planner">
      <p>
        Välj uppgifter och vanotillfällen. Förslaget använder ledig tid och kan
        ersätta obundna, genererade pass i samma område.
      </p>
      {!options.length && (
        <p>
          Inga obokade uppgifter eller vanotillfällen att föreslå för denna
          vecka. Kontrollera tidsbehov och planeringsdagar om något saknas.
        </p>
      )}
      {options.map((option) => (
        <div key={option.key} className="work-option">
          <label>
            <input
              type="checkbox"
              checked={option.selected}
              onChange={(e) =>
                change(option.key, { selected: e.target.checked })
              }
            />
            <span>{option.label}</span>
          </label>
          <label>
            Minuter
            <input
              type="number"
              min={15}
              max={240}
              step={15}
              value={option.request.minutes}
              onChange={(e) =>
                change(option.key, {
                  request: {
                    ...option.request,
                    minutes: Number(e.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Prioritet
            <select
              value={option.request.priority ?? 2}
              onChange={(e) =>
                change(option.key, {
                  request: {
                    ...option.request,
                    priority: Number(e.target.value),
                  },
                })
              }
            >
              <option value={1}>Hög</option>
              <option value={2}>Normal</option>
              <option value={3}>Låg</option>
            </select>
          </label>
          {option.request.kind === "task" && (
            <label>
              Dag
              <select
                value={option.request.date ?? ""}
                onChange={(e) =>
                  change(option.key, {
                    request: {
                      ...option.request,
                      date: e.target.value || undefined,
                    },
                  })
                }
              >
                <option value="">Första lediga tid i veckan</option>
                {Array.from({ length: 7 }, (_, d) => addDays(week, d)).map(
                  (date) => (
                    <option key={date} value={date}>
                      {fullDate(date)}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
        </div>
      ))}
      <button
        className="button secondary"
        disabled={!options.some((o) => o.selected)}
        onClick={() => {
          setPreview({
            base: data,
            result: previewWeeklyWork(
              data,
              week,
              options.filter((o) => o.selected).map((o) => o.request),
            ),
          });
          setError("");
        }}
      >
        Visa planeringsförslag
      </button>
      {preview && (
        <section className="work-preview" aria-label="Planeringsförslag">
          <h3>{preview.result.activities.length} pass kan läggas in</h3>
          {preview.result.reused > 0 && (
            <p>
              {preview.result.reused} genererade tidsblock används för konkreta
              uppgifter eller vanor.
            </p>
          )}
          <ul>
            {preview.result.activities.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong> · {fullDate(a.date)} ·{" "}
                {time(a.start)}–{time(a.end)}
              </li>
            ))}
          </ul>
          {preview.result.unplaced.length > 0 && (
            <div role="status">
              <h4>Behöver fortfarande planeras</h4>
              <ul>
                {preview.result.unplaced.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            </div>
          )}
          {preview.result.alreadyBooked > 0 && (
            <p>{preview.result.alreadyBooked} tillfällen är redan bokade.</p>
          )}
          <button
            className="button primary"
            disabled={!preview.result.activities.length}
            onClick={() => {
              if (onApply(preview.result.data, preview.base)) onClose();
              else {
                setError(
                  "Veckan har ändrats. Visa ett nytt förslag innan du lägger in passen.",
                );
                setPreview(null);
              }
            }}
          >
            Lägg in {preview.result.activities.length} pass i veckan
          </button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
  return embedded ? (
    content
  ) : (
    <Modal title={`Planera vecka ${weekNumber(week)}`} onClose={onClose} wide>
      {content}
    </Modal>
  );
}
