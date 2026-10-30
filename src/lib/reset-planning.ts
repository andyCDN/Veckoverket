import type { AppData } from "./types";
import { monday, today } from "./date";
import { targetMinutes } from "./planner";

export function resetPlanning(data: AppData, week = monday(today())): AppData {
  const { googleCalendar: _import, icalCalendar: _feed, ...preserved } = data;
  return {
    ...preserved,
    goals: [],
    tasks: [],
    recurring: [],
    reflections: {},
    // Persist an explicitly empty current week so reload does not create a demo
    // plan. Settings and categories remain available for the next real plan.
    weeks: {
      [week]: {
        week,
        activities: [],
        rules: structuredClone(data.settings),
        targets: Object.fromEntries(
          data.categories.map((c) => [c.id, targetMinutes(c, data.settings)]),
        ),
        generatedAt: new Date().toISOString(),
      },
    },
  };
}
