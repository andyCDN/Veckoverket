import type {
  Activity,
  AppData,
  Category,
  Conflict,
  Settings,
  WeekPlan,
} from "./types";
import { addDays, today } from "./date";
import { usesWeekTemplate, templateBlocks } from "./week-template";
import { blocksTime } from "./external-calendar";

export const ROUTINE_CATEGORY: Category = {
  id: "weekly-planning",
  name: "Planering & uppföljning",
  color: "#243d9b",
  targetMinutes: 45,
  priority: 5,
  minBlock: 15,
  allowSplit: false,
  movable: false,
};
export const WEEKLY_ROUTINES = [
  {
    kind: "week-start",
    day: 0,
    minutes: 15,
    title: "Veckostart",
    description:
      "Välj veckans viktigaste mål. Kontrollera bokningar och avsätt tid för uppgifterna.",
  },
  {
    kind: "week-review",
    day: 4,
    minutes: 30,
    title: "Veckoavstämning",
    description:
      "Sammanfatta veckan, följ upp målen och gå igenom nästa veckas planering.",
  },
] as const;

export function weeklyRoutines(settings: Settings) {
  if (usesWeekTemplate(settings) && settings.importedSchedule)
    return templateBlocks(settings)
      .filter((b) => b.routine)
      .map((b) => ({
        kind: b.routine!,
        day: b.day,
        minutes: b.end - b.start,
        title: b.title,
        description:
          "Veckoincheck och uppföljning enligt ditt importerade schema.",
        start: b.start,
      }));
  return WEEKLY_ROUTINES.map((routine) =>
    usesWeekTemplate(settings)
      ? {
          ...routine,
          day: routine.kind === "week-start" ? 0 : 3,
          minutes: 30,
          title:
            routine.kind === "week-start" ? "Veckoincheck" : "Stänga veckan",
          start: routine.kind === "week-start" ? 510 : 780,
        }
      : { ...routine, start: undefined as number | undefined },
  );
}

export function routineMinutes(
  settings: Settings,
  week?: string,
  from?: string,
) {
  return weeklyRoutines(settings)
    .filter(
      (r) =>
        settings.days.includes(r.day) &&
        (!week || !from || addDays(week, r.day) >= from),
    )
    .reduce((sum, r) => sum + r.minutes, 0);
}

/** Add routines without moving appointments or changing logged outcomes.
 * Only untouched, splittable generated suggestions can donate time. */
export function addWeeklyRoutines(
  plan: WeekPlan,
  settings: Settings,
  categories: Category[],
  from = plan.week,
  notBefore?: { date: string; minute: number },
): WeekPlan {
  let activities = [...plan.activities];
  for (const routine of weeklyRoutines(settings)) {
    const date = addDays(plan.week, routine.day);
    const earliest =
      notBefore?.date === date
        ? Math.max(settings.start, notBefore.minute)
        : settings.start;
    if (
      plan.gentleDays?.includes(date) ||
      !settings.days.includes(routine.day) ||
      date < from ||
      activities.some((a) => a.routine === routine.kind)
    )
      continue;
    const busy = activities
      .filter((a) => a.date === date && blocksTime(a))
      .sort((a, b) => a.start - b.start);
    const fits = (start: number, other: Activity[]) => {
      const end = start + routine.minutes;
      return (
        start >= earliest &&
        end <= settings.end &&
        other.every(
          (a) =>
            !blocksTime(a) ||
            a.date !== date ||
            end + settings.buffer <= a.start ||
            start >= a.end + settings.buffer,
        )
      );
    };
    // Mornings first on Monday, the last available slot on Friday.
    const candidates =
      routine.start !== undefined
        ? [routine.start]
        : routine.day === 0
          ? [earliest, ...busy.map((a) => a.end + settings.buffer)]
          : [
              settings.end - routine.minutes,
              ...busy.map((a) => a.start - settings.buffer - routine.minutes),
            ].sort((a, b) => b - a);
    let start = candidates.find((time) => fits(time, activities));
    if (start === undefined && routine.start === undefined) {
      const donors = busy
        .filter((a) => {
          const category = categories.find((c) => c.id === a.categoryId);
          return (
            a.source === "generated" &&
            a.status === "planned" &&
            a.blockType === "flexible" &&
            a.start >= earliest &&
            !a.routine &&
            !a.external &&
            !a.followUpOf &&
            !a.recurrenceId &&
            category?.allowSplit &&
            category.movable &&
            a.end - a.start >=
              routine.minutes + settings.buffer + category.minBlock
          );
        })
        .sort((a, b) =>
          routine.day === 0 ? a.start - b.start : b.end - a.end,
        );
      for (const donor of donors) {
        const time =
          routine.day === 0 ? donor.start : donor.end - routine.minutes;
        const trimmed =
          routine.day === 0
            ? { ...donor, start: time + routine.minutes + settings.buffer }
            : { ...donor, end: time - settings.buffer };
        trimmed.estimatedMinutes = trimmed.end - trimmed.start;
        const revised = activities.map((a) =>
          a.id === donor.id ? trimmed : a,
        );
        if (!fits(time, revised)) continue;
        activities = revised;
        start = time;
        break;
      }
    }
    if (start === undefined) continue;
    const baseId = `${plan.week}-${routine.kind}`;
    let id = baseId,
      sequence = 1;
    while (activities.some((a) => a.id === id)) id = `${baseId}-${sequence++}`;
    activities.push({
      id,
      title: routine.title,
      description: routine.description,
      categoryId: ROUTINE_CATEGORY.id,
      date,
      start,
      end: start + routine.minutes,
      estimatedMinutes: routine.minutes,
      blockType: "protected",
      priority: 5,
      status: "planned",
      source: "generated",
      routine: routine.kind,
    });
  }
  return {
    ...plan,
    activities: activities.sort(
      (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
    ),
    weeklyRoutinesFrom: from,
    ...(plan.targets
      ? {
          targets: {
            ...plan.targets,
            [ROUTINE_CATEGORY.id]: routineMinutes(settings, plan.week, from),
          },
        }
      : {}),
  };
}

export function routineConflicts(
  plan: WeekPlan,
  settings: Settings,
): Conflict[] {
  if (!plan.weeklyRoutinesFrom) return [];
  return weeklyRoutines(settings)
    .filter(
      (r) =>
        settings.days.includes(r.day) &&
        !plan.gentleDays?.includes(addDays(plan.week, r.day)) &&
        addDays(plan.week, r.day) >= plan.weeklyRoutinesFrom! &&
        !plan.activities.some((a) => a.routine === r.kind),
    )
    .map((r) => ({
      id: `routine-${r.kind}`,
      severity: "warning",
      message: `${r.title}: ${r.minutes} minuter har inte kunnat bokas.`,
      suggestion:
        "Frigör tid på rätt veckodag och välj Planera veckan. Egna bokningar och genomförda pass har behållits.",
    }));
}

/** Upgrade current/future saved plans once. Past dates and explicitly empty
 * weeks (including a reset workspace) remain untouched. */
export function upgradeWeeklyRoutines(data: AppData, from = today()): AppData {
  const categories = data.categories.some((c) => c.id === ROUTINE_CATEGORY.id)
    ? data.categories
    : [...data.categories, { ...ROUTINE_CATEGORY }];
  let changed = categories !== data.categories;
  const weeks = { ...data.weeks };
  for (const [week, plan] of Object.entries(weeks)) {
    if (
      addDays(week, 6) < from ||
      plan.weeklyRoutinesFrom ||
      !plan.activities.length
    )
      continue;
    weeks[week] = addWeeklyRoutines(
      plan,
      plan.rules ?? data.settings,
      categories,
      from,
    );
    changed = true;
  }
  return changed ? { ...data, categories, weeks } : data;
}
