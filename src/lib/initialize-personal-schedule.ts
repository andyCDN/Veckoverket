import type { AppData } from "./types";
import { monday, planningBoundary } from "./date";
import { createPersonalSchedule } from "./create-personal-schedule";
import { upgradePersonalWeek } from "./personal-week";

/** Install the requested schedule through the normal workspace load, once.
 * Legacy `weekTemplate: off` was also the old default; it must not prevent this
 * requested change. Later intentional edits, opt-outs and resets are respected. */
export function initializePersonalSchedule(
  data: AppData,
  boundary = planningBoundary(),
): AppData {
  if (data.personalScheduleVersion === 1)
    return upgradePersonalWeek(data, boundary);

  const current = monday(boundary.date);
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
  return { ...next, personalScheduleVersion: 1 };
}
