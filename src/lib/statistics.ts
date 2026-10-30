import type { AppData } from "./types";
import { addDays, monday, today } from "./date";
import { categoryMinutes, targetMinutes } from "./planner";
const finiteTarget = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

export function periodStatistics(
  data: AppData,
  selectedWeek: string,
  length: 4 | 12,
  categoryId = "all",
  currentDate = today(),
) {
  const currentWeek = monday(currentDate),
    end = selectedWeek > currentWeek ? currentWeek : selectedWeek;
  const categories = data.categories.filter(
    (c) => categoryId === "all" || c.id === categoryId,
  );
  const weeks = Array.from({ length }, (_, i) => {
    const week = addDays(end, (i - length + 1) * 7),
      plan = data.weeks[week];
    const activities = (plan?.activities ?? []).filter(
      (a) => a.date >= week && a.date < addDays(week, 7),
    );
    const planned = categoryMinutes(activities),
      done = categoryMinutes(activities, "done");
    const rows = categories.map((category) => ({
      category,
      planned: planned[category.id] ?? 0,
      done: done[category.id] ?? 0,
      target: plan
        ? plan.targets
          ? finiteTarget(plan.targets[category.id])
          : finiteTarget(targetMinutes(category, plan.rules ?? data.settings))
        : 0,
    }));
    return {
      week,
      saved: Boolean(plan),
      ongoing: week === currentWeek,
      rows,
      planned: rows.reduce((n, r) => n + r.planned, 0),
      done: rows.reduce((n, r) => n + r.done, 0),
      target: rows.reduce((n, r) => n + r.target, 0),
    };
  });
  const rows = categories.map((category) => ({
    category,
    planned: weeks.reduce(
      (n, w) =>
        n + (w.rows.find((r) => r.category.id === category.id)?.planned ?? 0),
      0,
    ),
    done: weeks.reduce(
      (n, w) =>
        n + (w.rows.find((r) => r.category.id === category.id)?.done ?? 0),
      0,
    ),
    target: weeks.reduce(
      (n, w) =>
        n + (w.rows.find((r) => r.category.id === category.id)?.target ?? 0),
      0,
    ),
  }));
  const planned = rows.reduce((n, r) => n + r.planned, 0),
    done = rows.reduce((n, r) => n + r.done, 0);
  return {
    weeks,
    rows,
    planned,
    done,
    savedWeeks: weeks.filter((w) => w.saved).length,
    completion: planned ? Math.round((done / planned) * 100) : null,
    end,
    start: weeks[0].week,
  };
}
