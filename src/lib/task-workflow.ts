import type { AppData, Task } from "./types";
import { addDays, monday, planningBoundary, today } from "./date";
import { isLocalDate } from "./google-time";
import { weeklyGoals, workBookings, tasksInWeek } from "./weekly-work";
import { habitWeek } from "./habits";
export type TaskDecision = {
  kind: "done" | "more" | "waiting" | "drop" | "reopen";
  minutes?: number;
  date?: string;
  owner?: string;
};
export function taskStage(
  data: AppData,
  task: Task,
  boundary = planningBoundary(),
) {
  if (task.done) return "done";
  if (task.state === "dropped") return "dropped";
  if (task.state === "waiting") return "waiting";
  const bookings = workBookings(data, "task", task.id);
  if (
    bookings.some(
      (a) =>
        a.status === "planned" &&
        (a.date > boundary.date ||
          (a.date === boundary.date && a.end > boundary.minute)),
    )
  )
    return "booked";
  if (bookings.length && !task.needsPlanning) return "followup";
  return "unplanned";
}
export function decideTask(
  data: AppData,
  id: string,
  decision: TaskDecision,
): AppData {
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return data;
  if (
    (decision.kind === "waiting" || decision.kind === "more") &&
    (!decision.date || !isLocalDate(decision.date))
  )
    throw new Error("Välj ett giltigt datum.");
  if (
    decision.kind === "waiting" &&
    (!decision.owner?.trim() || decision.owner.trim().length > 200)
  )
    throw new Error("Ange vem du väntar på.");
  if (
    decision.kind === "more" &&
    (!Number.isInteger(decision.minutes) ||
      decision.minutes! < 15 ||
      decision.minutes! > 240 ||
      decision.minutes! % 15 !== 0)
  )
    throw new Error("Välj 15–240 minuter i steg om 15.");
  const updated: Task = {
    ...task,
    done: decision.kind === "done",
    state:
      decision.kind === "waiting"
        ? "waiting"
        : decision.kind === "drop"
          ? "dropped"
          : "open",
    waitingFor:
      decision.kind === "waiting" ? decision.owner!.trim() : undefined,
    reviewOn: decision.kind === "waiting" ? decision.date : undefined,
    needsPlanning: decision.kind === "more" || decision.kind === "reopen",
    ...(decision.kind === "more"
      ? { date: decision.date, estimatedMinutes: decision.minutes }
      : {}),
  };
  return {
    ...data,
    tasks: data.tasks.map((t) => (t.id === id ? updated : t)),
    ...(decision.kind === "drop"
      ? {
          weeks: Object.fromEntries(
            Object.entries(data.weeks).map(([week, plan]) => [
              week,
              {
                ...plan,
                activities: plan.activities.map((a) =>
                  a.taskId === id && a.status === "planned"
                    ? {
                        ...a,
                        status: "skipped" as const,
                        description: `${a.description}\nUppgiften släpptes.`,
                      }
                    : a,
                ),
              },
            ]),
          ),
        }
      : {}),
  };
}
export function weekTasks(data: AppData, week: string) {
  return tasksInWeek(data, week);
}
export function reviewWeek(
  data: AppData,
  week: string,
  carryIds: string[],
  now = new Date(),
): AppData {
  const next = addDays(week, 7),
    tasks = weekTasks(data, week);
  const selected = new Set(
    tasks
      .filter(
        (t) =>
          carryIds.includes(t.id) &&
          !t.done &&
          t.state !== "dropped" &&
          (!t.date || t.date < next),
      )
      .map((t) => t.id),
  );
  const summary = [
    `Vecka ${week}–${addDays(week, 6)}`,
    `Pass: ${(data.weeks[week]?.activities ?? []).filter((a) => a.status === "done" || a.routine === "week-review").length} genomförda av ${data.weeks[week]?.activities.length ?? 0}.`,
    `Uppgifter: ${tasks.filter((t) => t.done).length} klara · ${tasks.filter((t) => !t.done && t.state !== "dropped").length} återstående · ${tasks.filter((t) => t.state === "dropped").length} släppta.`,
    ...tasks.map(
      (t) =>
        `${t.title}: ${t.done ? "klar" : t.state === "dropped" ? "släppt" : t.state === "waiting" ? `väntar på ${t.waitingFor ?? "svar"}` : "återstår"}${selected.has(t.id) ? ` · förs vidare till ${next}` : ""}`,
    ),
    ...(data.habits ?? [])
      .filter((h) => h.createdOn <= addDays(week, 6))
      .map((h) => {
        const s = habitWeek(h, week, data);
        return `Vana ${h.title}: ${s.completed} av ${s.target} dagar.`;
      }),
  ].join("\n");
  const previous = data.reflections[week] ?? {
    week,
    good: "",
    unfinished: "",
    balance: "",
    next: "",
    updatedAt: "",
  };
  return {
    ...data,
    tasks: data.tasks.map((t) =>
      selected.has(t.id)
        ? { ...t, date: next, needsPlanning: t.state !== "waiting" }
        : t,
    ),
    weeks: {
      ...data.weeks,
      ...(data.weeks[week]
        ? {
            [week]: {
              ...data.weeks[week],
              activities: data.weeks[week].activities.map((a) =>
                a.routine === "week-review" && a.status === "planned"
                  ? { ...a, status: "done" as const }
                  : a.taskId && selected.has(a.taskId) && a.status === "planned"
                    ? { ...a, status: "skipped" as const }
                    : a,
              ),
            },
          }
        : {}),
    },
    reflections: {
      ...data.reflections,
      [week]: {
        ...previous,
        updatedAt: now.toISOString(),
        reviewSummary: summary,
        reviewRecordedAt: now.toISOString(),
      },
    },
  };
}
