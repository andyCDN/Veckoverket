import type { AppData } from "./types";
import { monday, planningBoundary } from "./date";
import { createPersonalSchedule } from "./create-personal-schedule";
import { upgradePersonalWeek } from "./personal-week";
import { normalizeFixedWeek, fixedWeekIsActive } from "./fixed-week-policy";

/** Install the fixed schedule through normal workspace load and repair drift.
 * Legacy `weekTemplate: off` was also the old default; it must not prevent this
 * requested change. Later work must fit the slots; opt-outs/resets are respected. */
export function initializePersonalSchedule(
  data: AppData,
  boundary = planningBoundary(),
): AppData {
  const current = monday(boundary.date);
  if (data.personalScheduleVersion === 2) {
    let next = upgradePersonalWeek(data, boundary);
    for (const [week, plan] of Object.entries(next.weeks))
      if (
        week >= current &&
        ((!next.settings.importedSchedule &&
          fixedWeekIsActive(next.settings) &&
          !fixedWeekIsActive(plan.rules ?? next.settings)) ||
          normalizeFixedWeek(plan, plan.rules ?? next.settings).changed)
      )
        next = createPersonalSchedule(next, week, plan.rules).data;
    return next;
  }
  let next = data;
  // Historical weeks without a snapshot must keep their original rules even
  // though the defaults for current and upcoming planning are changing.
  for (const [week, plan] of Object.entries(data.weeks)) {
    if (week < current && !plan.rules)
      next = {
        ...next,
        weeks: {
          ...next.weeks,
          [week]: { ...plan, rules: structuredClone(data.settings) },
        },
      };
  }
  const weeks = [
    ...new Set([
      current,
      ...Object.keys(data.weeks).filter((week) => week >= current),
    ]),
  ].sort();
  for (const week of weeks) next = createPersonalSchedule(next, week).data;
  return { ...next, personalScheduleVersion: 2 };
}
