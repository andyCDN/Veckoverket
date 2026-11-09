import type { Activity, AppData } from "./types";
import { addDays, monday, planningBoundary, uid, weekday } from "./date";
import { habitPlanned, effectiveHabitChecks } from "./habits";
import { plannedDays } from "./planner";
import { blocksTime } from "./external-calendar";

export type WorkRequest = {
  kind: "task" | "habit";
  id: string;
  minutes: number;
  priority?: number;
  date?: string;
};
export type WorkPreview = {
  data: AppData;
  activities: Activity[];
  unplaced: string[];
  reused: number;
  alreadyBooked: number;
};
export function workBookings(
  data: AppData,
  kind: "task" | "habit",
  id: string,
) {
  return Object.values(data.weeks)
    .flatMap((p) => p.activities)
    .filter(
      (a) =>
        (kind === "task" ? a.taskId === id : a.habitId === id) &&
        a.status !== "skipped",
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}
export function weeklyGoals(data: AppData, week: string) {
  const end = addDays(week, 6);
  return data.goals.filter(
    (g) =>
      (g.horizon === "week" && g.week === week) ||
      data.tasks.some(
        (t) =>
          t.goalId === g.id &&
          ((t.date && t.date >= week && t.date <= end) ||
            workBookings(data, "task", t.id).some(
              (a) => monday(a.date) === week,
            )),
      ),
  );
}
export function previewWeeklyWork(
  data: AppData,
  week: string,
  requests: WorkRequest[],
  boundary = planningBoundary(),
): WorkPreview {
  const original = data.weeks[week];
  if (!original)
    return {
      data,
      activities: [],
      unplaced: ["Öppna veckan innan du planerar arbetet."],
      reused: 0,
      alreadyBooked: 0,
    };
  const rules = original.rules ?? data.settings;
  let activities = [...original.activities];
  let tasks = data.tasks;
  const placed: Activity[] = [];
  const unplaced: string[] = [];
  let reused = 0,
    alreadyBooked = 0;
  for (const req of [...requests].sort(
    (a, b) => (a.priority ?? 2) - (b.priority ?? 2),
  )) {
    const task =
      req.kind === "task" ? tasks.find((t) => t.id === req.id) : undefined;
    const habit =
      req.kind === "habit"
        ? data.habits?.find((h) => h.id === req.id)
        : undefined;
    const goal = task && data.goals.find((g) => g.id === task.goalId);
    const title = task?.title ?? habit?.title ?? "Borttaget arbete";
    if ((!task && !habit) || task?.done || habit?.paused) continue;
    if (
      req.priority !== undefined &&
      (!Number.isInteger(req.priority) || req.priority < 1 || req.priority > 3)
    ) {
      unplaced.push(`${title}: välj en giltig prioritet.`);
      continue;
    }
    if (
      !Number.isInteger(req.minutes) ||
      req.minutes < 15 ||
      req.minutes > 240 ||
      req.minutes % 15 !== 0
    ) {
      unplaced.push(`${title}: välj 15–240 minuter i steg om 15.`);
      continue;
    }
    const existing = [
      ...Object.values(data.weeks)
        .filter((p) => p.week !== week)
        .flatMap((p) => p.activities),
      ...activities,
    ];
    if (
      existing.some(
        (a) =>
          a.status !== "skipped" &&
          (task
            ? a.taskId === task.id
            : a.habitId === habit!.id && a.date === req.date),
      )
    ) {
      alreadyBooked++;
      continue;
    }
    if (
      habit &&
      (!req.date ||
        !habitPlanned(habit, req.date) ||
        effectiveHabitChecks(habit, data).includes(req.date))
    )
      continue;
    const categoryId = goal?.categoryId ?? habit?.categoryId;
    if (
      !data.categories.some(
        (c) => c.id === categoryId && c.id !== "google-calendar",
      )
    ) {
      unplaced.push(`${title}: välj ett område för kalenderpasset.`);
      continue;
    }
    const dates = Array.from({ length: 7 }, (_, d) => addDays(week, d)).filter(
      (date) =>
        date >= boundary.date &&
        (!req.date || req.date === date) &&
        plannedDays(rules).includes(weekday(date)),
    );
    let result: Activity | undefined;
    for (const date of dates) {
      const earliest = Math.max(
        rules.start,
        date === boundary.date ? boundary.minute : 0,
      );
      const base: Activity = {
        id: uid(),
        title,
        description: goal ? `Veckomål: ${goal.title}` : `Vana: ${habit!.title}`,
        categoryId: categoryId!,
        date,
        start: earliest,
        end: earliest + req.minutes,
        estimatedMinutes: req.minutes,
        blockType: "flexible",
        priority: 6 - (req.priority ?? 2),
        status: "planned",
        source: "manual",
        ...(task
          ? { taskId: task.id, goalId: task.goalId }
          : { habitId: habit!.id }),
      };
      const fits = (a: Activity, others: Activity[]) =>
        a.start >= earliest &&
        a.end <= rules.end &&
        [
          { start: rules.lunchStart, end: rules.lunchEnd },
          { start: rules.familyStart, end: rules.familyEnd },
          ...others.filter(
            (b) => b.date === date && b.status !== "skipped" && blocksTime(b),
          ),
        ].every(
          (b) =>
            a.end + rules.buffer <= b.start || a.start >= b.end + rules.buffer,
        );
      const slot = activities
        .filter(
          (a) =>
            a.date === date &&
            a.source === "generated" &&
            a.status === "planned" &&
            a.blockType === "flexible" &&
            a.categoryId === categoryId &&
            !a.taskId &&
            !a.habitId &&
            !a.applicationId &&
            !a.contactId &&
            !a.careerActionId &&
            !a.deadlineId &&
            !a.routine &&
            !a.external &&
            !a.recurrenceId &&
            !a.followUpOf &&
            a.end <= rules.end &&
            a.start >= earliest &&
            a.end - a.start >= req.minutes,
        )
        .sort((a, b) => a.start - b.start)
        .find((a) =>
          fits(
            { ...base, start: a.start, end: a.start + req.minutes },
            activities.filter((b) => b.id !== a.id),
          ),
        );
      if (slot) {
        result = {
          ...base,
          id: slot.id,
          start: slot.start,
          end: slot.start + req.minutes,
        };
        activities = activities.filter((a) => a.id !== slot.id);
        const remainingStart = result.end + rules.buffer;
        if (slot.end - remainingStart >= 5)
          activities.push({
            ...slot,
            id: uid(),
            start: remainingStart,
            estimatedMinutes: slot.end - remainingStart,
          });
        reused++;
        break;
      }
      for (
        let start = Math.ceil(earliest / 15) * 15;
        start + req.minutes <= rules.end;
        start += 15
      ) {
        const candidate = { ...base, start, end: start + req.minutes };
        if (fits(candidate, activities)) {
          result = candidate;
          break;
        }
      }
      if (result) break;
    }
    if (!result) {
      unplaced.push(
        `${title}: ingen ledig tid inom veckans planeringsregler${req.date ? ` (${req.date})` : ""}.`,
      );
      continue;
    }
    activities.push(result);
    placed.push(result);
    if (task)
      tasks = tasks.map((t) =>
        t.id === task.id ? { ...t, estimatedMinutes: req.minutes } : t,
      );
  }
  return {
    data: placed.length
      ? {
          ...data,
          tasks,
          weeks: {
            ...data.weeks,
            [week]: {
              ...original,
              activities: activities.sort(
                (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
              ),
            },
          },
        }
      : data,
    activities: placed,
    unplaced,
    reused,
    alreadyBooked,
  };
}
