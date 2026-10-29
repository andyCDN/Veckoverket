import type { Activity, AppData } from "./types";
import { planningBoundary, monday } from "./date";
import { generateWeek } from "./planner";

export function canReplanActivity(
  activity: Activity,
  data: Pick<AppData, "categories" | "settings">,
  boundary = planningBoundary(),
) {
  if (
    activity.source !== "generated" ||
    activity.status !== "planned" ||
    activity.external ||
    activity.recurrenceId ||
    activity.followUpOf ||
    activity.blockType === "locked" ||
    activity.date < boundary.date ||
    (activity.date === boundary.date && activity.start < boundary.minute)
  )
    return false;
  if (activity.routine) return true;
  if (activity.categoryId === "music") return data.settings.musicMovable;
  return Boolean(
    data.categories.find((c) => c.id === activity.categoryId)?.movable,
  );
}

export function bookingConstraints(
  activities: Activity[],
  data: Pick<AppData, "settings" | "categories">,
  boundary = planningBoundary(),
) {
  return data.settings.autoPlanning
    ? activities.filter((a) => !canReplanActivity(a, data, boundary))
    : activities;
}

/** Recompute only the weeks affected by a booking mutation. Past/started work,
 * appointments and outcomes are retained by the engine; invalid candidates do
 * not replace the current plan. No timers, network requests or hidden writes. */
export function replanAfterBookings(
  data: AppData,
  weeks: string[],
  boundary = planningBoundary(),
): AppData {
  if (!data.settings.autoPlanning) return data;
  let next = data;
  for (const week of [...new Set(weeks)].sort()) {
    const current = next.weeks[week];
    if (!current || !current.activities.length || week < monday(boundary.date))
      continue;
    const settings = {
      ...(current.rules ?? data.settings),
      autoPlanning: true,
    };
    const categories = next.categories.map((category) =>
      current.targets?.[category.id] === undefined
        ? category
        : { ...category, targetMinutes: current.targets[category.id] },
    );
    const result = generateWeek(
      week,
      { ...next, settings, categories },
      current,
      { notBefore: boundary },
    );
    if (result.conflicts.some((c) => c.severity === "error")) continue;
    const held = new Set(current.activities);
    const plan = {
      ...result.plan,
      activities: result.plan.activities.map((a) =>
        held.has(a) || a.goalId || a.external || a.source !== "generated"
          ? a
          : {
              ...a,
              goalId: next.goals.find(
                (g) => g.categoryId === a.categoryId && g.week === week,
              )?.id,
            },
      ),
    };
    next = { ...next, weeks: { ...next.weeks, [week]: plan } };
  }
  return next;
}
