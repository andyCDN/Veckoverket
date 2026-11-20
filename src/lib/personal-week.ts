import type { AppData } from "./types";
import { monday, planningBoundary } from "./date";
import { DEFAULT_CATEGORIES } from "./defaults";
import { generateWeek } from "./planner";
import { templateSettings, templateTargetMinutes } from "./week-template";

/** Install the requested pattern once. The current week, saved outcomes and
 * explicit appointments survive; intentional empty weeks stay empty. */
export function upgradePersonalWeek(
  data: AppData,
  boundary = planningBoundary(),
  force = false,
): AppData {
  if (!force && data.settings.weekTemplate !== undefined) return data;
  const settings = templateSettings(data.settings);
  const categories = [...data.categories];
  for (const category of DEFAULT_CATEGORIES) {
    if (
      [
        "career",
        "networking",
        "learning",
        "health",
        "rest",
        "family",
        "weekly-planning",
      ].includes(category.id) &&
      !categories.some((c) => c.id === category.id)
    )
      categories.push({ ...category });
  }
  const next: AppData = {
    ...data,
    settings,
    categories,
    weeks: { ...data.weeks },
  };
  for (const [week, plan] of Object.entries(data.weeks)) {
    if (week <= monday(boundary.date)) {
      // Older backups may predate per-week rules. Freeze their original rules
      // before changing the defaults for upcoming weeks.
      if (!plan.rules)
        next.weeks[week] = {
          ...plan,
          rules: structuredClone(data.settings),
        };
      continue;
    }
    if (!plan.activities.length) {
      next.weeks[week] = {
        ...plan,
        rules: structuredClone(settings),
        targets: Object.fromEntries(
          categories.map((c) => [c.id, templateTargetMinutes(c.id)]),
        ),
      };
      continue;
    }
    const result = generateWeek(week, next, plan, { notBefore: boundary }).plan;
    const original = new Set(plan.activities);
    next.weeks[week] = {
      ...result,
      activities: result.activities.map((a) =>
        original.has(a) || a.goalId
          ? a
          : {
              ...a,
              goalId: data.goals.find(
                (g) => g.week === week && g.categoryId === a.categoryId,
              )?.id,
            },
      ),
    };
  }
  return next;
}
