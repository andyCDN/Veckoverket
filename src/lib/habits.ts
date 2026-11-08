import type { AppData, Habit } from "./types";
import { addDays, today, weekday } from "./date";
import { isLocalDate } from "./google-time";

export function validateHabits(
  value: unknown,
): asserts value is Habit[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 500)
    throw new Error("Vanorna är ogiltiga.");
  const ids = new Set<string>();
  for (const habit of value) {
    if (
      !habit ||
      typeof habit.id !== "string" ||
      !habit.id.trim() ||
      habit.id.length > 200 ||
      ids.has(habit.id) ||
      typeof habit.title !== "string" ||
      !habit.title.trim() ||
      habit.title.length > 120 ||
      typeof habit.createdOn !== "string" ||
      !isLocalDate(habit.createdOn) ||
      (habit.paused !== undefined && typeof habit.paused !== "boolean") ||
      !Array.isArray(habit.checks) ||
      habit.checks.length > 50000 ||
      new Set(habit.checks).size !== habit.checks.length ||
      !habit.checks.every(
        (date: unknown) =>
          typeof date === "string" &&
          isLocalDate(date) &&
          date >= habit.createdOn,
      )
    )
      throw new Error("En vana är ogiltig.");
    ids.add(habit.id);
    const s = habit.schedule;
    if (
      !s ||
      (s.kind !== "days" && s.kind !== "weekly") ||
      (s.kind === "weekly" &&
        (!Number.isInteger(s.target) || s.target < 1 || s.target > 7)) ||
      (s.kind === "days" &&
        (!Array.isArray(s.days) ||
          !s.days.length ||
          s.days.length > 7 ||
          new Set(s.days).size !== s.days.length ||
          !s.days.every(
            (d: unknown) =>
              Number.isInteger(d) && Number(d) >= 0 && Number(d) <= 6,
          )))
    )
      throw new Error("Vanans veckomål är ogiltigt.");
  }
}
export function habitPlanned(habit: Habit, date: string) {
  return (
    date >= habit.createdOn &&
    (habit.schedule.kind === "weekly" ||
      habit.schedule.days.includes(weekday(date)))
  );
}
export function habitWeek(habit: Habit, week: string) {
  const dates = Array.from({ length: 7 }, (_, day) => addDays(week, day));
  const eligible = dates.filter((date) => habitPlanned(habit, date));
  const target =
    habit.schedule.kind === "weekly"
      ? Math.min(habit.schedule.target, eligible.length)
      : eligible.length;
  const completed = dates.filter((date) => habit.checks.includes(date)).length;
  return {
    dates,
    target,
    completed,
    percent: target ? Math.min(100, Math.round((completed / target) * 100)) : 0,
  };
}
export function toggleHabit(
  data: AppData,
  id: string,
  date: string,
  currentDate = today(),
): AppData {
  const habit = data.habits?.find((h) => h.id === id);
  if (
    !habit ||
    !isLocalDate(date) ||
    date > currentDate ||
    date < habit.createdOn
  )
    return data;
  const checked = habit.checks.includes(date);
  if (!checked && (habit.paused || !habitPlanned(habit, date))) return data;
  return {
    ...data,
    habits: data.habits!.map((h) =>
      h.id !== id
        ? h
        : {
            ...h,
            checks: checked
              ? h.checks.filter((d) => d !== date)
              : [...h.checks, date].sort(),
          },
    ),
  };
}
export type HabitDraft = Pick<Habit, "id" | "title" | "schedule" | "createdOn">;
export function saveHabit(data: AppData, draft: HabitDraft): AppData {
  const previous = data.habits?.find((h) => h.id === draft.id);
  const habit: Habit = {
    ...draft,
    title: draft.title.trim(),
    createdOn: previous?.createdOn ?? draft.createdOn,
    checks: previous?.checks ?? [],
    paused: previous?.paused ?? false,
  };
  const habits = previous
    ? data.habits!.map((h) => (h.id === habit.id ? habit : h))
    : [...(data.habits ?? []), habit];
  validateHabits(habits);
  return { ...data, habits };
}
export function pauseHabit(data: AppData, id: string): AppData {
  if (!data.habits?.some((h) => h.id === id)) return data;
  return {
    ...data,
    habits: data.habits.map((h) =>
      h.id === id ? { ...h, paused: !h.paused } : h,
    ),
  };
}
