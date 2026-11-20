import type { AppData, WeekPlan } from "./types";
import { monday, planningBoundary } from "./date";
import { DEFAULT_CATEGORIES } from "./defaults";
import { generateWeek } from "./planner";
import {
  templateSettings,
  templateTargetMinutes,
  WEEK_TEMPLATE_ID,
} from "./week-template";

/** Reconcile every future week with the selected pattern, including snapshots
 * loaded after activation. Explicit bookings/outcomes and empty weeks survive. */
export function upgradePersonalWeek(
  data: AppData,
  boundary = planningBoundary(),
  force = false,
): AppData {
  if (!force && data.settings.weekTemplate === "off") return data;
  const installing = force || data.settings.weekTemplate === undefined;
  const settings = installing ? templateSettings(data.settings) : data.settings;
  let categories = data.categories;
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
      categories = [...categories, { ...category }];
  }
  let weeks = data.weeks;
  const updateWeek = (week: string, plan: WeekPlan) => {
    if (weeks === data.weeks) weeks = { ...weeks };
    weeks[week] = plan;
  };
  for (const [week, plan] of Object.entries(data.weeks)) {
    if (week <= monday(boundary.date)) {
      // Older backups may predate per-week rules. Freeze their original rules
      // before changing the defaults for upcoming weeks.
      if (installing && !plan.rules)
        updateWeek(week, {
          ...plan,
          rules: structuredClone(data.settings),
        });
      continue;
    }
    if (
      !installing &&
      plan.templateId === WEEK_TEMPLATE_ID &&
      plan.rules?.weekTemplate === WEEK_TEMPLATE_ID
    )
      continue;
    if (!plan.activities.length) {
      updateWeek(week, {
        ...plan,
        templateId: WEEK_TEMPLATE_ID,
        rules: structuredClone(settings),
        targets: Object.fromEntries(
          categories.map((c) => [c.id, templateTargetMinutes(c.id)]),
        ),
      });
      continue;
    }
    const result = generateWeek(week, { ...data, settings, categories }, plan, {
      notBefore: boundary,
    }).plan;
    const original = new Set(plan.activities);
    updateWeek(week, {
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
    });
  }
  return settings === data.settings &&
    categories === data.categories &&
    weeks === data.weeks
    ? data
    : { ...data, settings, categories, weeks };
}
