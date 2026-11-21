import type { Activity, Settings, WeekPlan } from "./types";
import { DAY_NAMES, time, weekday } from "./date";
import { templateBlocks, usesWeekTemplate } from "./week-template";

export const fixedWeekIsActive = (s: Settings) =>
  usesWeekTemplate(s) && Boolean(s.strictWeekTemplate);
const key = (title: string) =>
  title
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("sv-SE")
    .replace(/\s+/g, " ")
    .replace(/\s*\((?:återkommande|varje vecka|veckovis)\)$/, "");
const genericAreas: Record<string, string> = {
  kompetensutveckling: "learning",
  jobbsök: "career",
  "söka jobb": "career",
  nätverksförfrågningar: "networking",
  nätverkande: "networking",
  träna: "health",
  träning: "health",
  lunch: "rest",
  "lunch & paus": "rest",
  veckostart: "weekly-planning",
  veckoincheck: "weekly-planning",
  veckoavstämning: "weekly-planning",
  "stänga veckan": "weekly-planning",
  hämta: "family",
  "familj & vardag": "family",
  musikproduktion: "music",
  "musik & kreativitet": "music",
};
export const genericScheduleArea = (
  a: Pick<Activity, "title"> & Partial<Pick<Activity, "categoryId">>,
  s?: Settings,
) =>
  s?.importedSchedule?.blocks.find(
    (b) => key(b.title) === key(a.title) && b.categoryId === a.categoryId,
  )?.categoryId ??
  s?.importedSchedule?.blocks.find((b) => key(b.title) === key(a.title))
    ?.categoryId ??
  genericAreas[key(a.title)];
export const hasScheduledWork = (a: Partial<Activity>) =>
  Boolean(
    a.taskId ||
    a.habitId ||
    a.applicationId ||
    a.contactId ||
    a.careerActionId ||
    a.deadlineId ||
    a.followUpOf,
  );

/** Learning is always timeboxed. Fixed interviews/appointments are distinct
 * from flexible job/network work; generic legacy slots are always managed. */
export function scheduledWorkArea(a: Activity, s?: Settings) {
  if (s?.importedSchedule && a.external) return;
  const generic = genericScheduleArea(a, s);
  if (generic) return generic;
  if (/^kompetensutveckling(?:\s|[:–—-]|$)/u.test(key(a.title)))
    return "learning";
  if (a.categoryId === "learning") return "learning";
  if (
    s?.importedSchedule?.blocks.some((b) => b.categoryId === a.categoryId) &&
    (a.blockType === "flexible" || hasScheduledWork(a))
  )
    return a.categoryId;
  if (
    ["career", "networking"].includes(a.categoryId) &&
    a.blockType !== "locked" &&
    (a.blockType === "flexible" || hasScheduledWork(a))
  )
    return a.categoryId;
}
export function fitsFixedWeek(a: Activity, s: Settings) {
  if (!fixedWeekIsActive(s) || a.status !== "planned") return true;
  const area = scheduledWorkArea(a, s);
  if (!area) return true;
  if (a.external && (!a.external.busy || a.external.allDay)) return false;
  const wholeSlot =
    genericScheduleArea(a, s) &&
    !hasScheduledWork(a) &&
    a.source !== "generated";
  return templateBlocks(s).some(
    (b) =>
      b.day === weekday(a.date) &&
      b.categoryId === area &&
      a.start >= b.start &&
      a.end <= b.end &&
      (!wholeSlot || (a.start === b.start && a.end === b.end)),
  );
}
export function fixedWeekError(a: Activity, s: Settings) {
  if (fitsFixedWeek(a, s)) return;
  const area = scheduledWorkArea(a, s);
  const slots = templateBlocks(s).filter(
    (b) => b.day === weekday(a.date) && b.categoryId === area,
  );
  return slots.length
    ? `${a.title}: ${DAY_NAMES[weekday(a.date)]} följer veckoschemat ${slots.map((b) => `${time(b.start)}–${time(b.end)}`).join(", ")}. Använd den tiden i stället för att lägga till fler pass.`
    : `${a.title}: det finns ingen schematid för detta den dagen. Välj en dag och tid som ingår i veckoschemat.`;
}

/** Remove superseded generic slots regardless of their old source. Concrete
 * work can consume its prescribed slot, never expand it. Removed records are
 * retained separately, outside the active calendar and its time totals. */
export function normalizeFixedWeek(plan: WeekPlan, s: Settings) {
  if (!fixedWeekIsActive(s))
    return {
      activities: plan.activities,
      replaced: [] as Activity[],
      changed: false,
    };
  const kept = plan.activities.filter((a) => a.status !== "planned");
  const replaced: Activity[] = [],
    fillers: Activity[] = [];
  let changed = false;
  for (const a of plan.activities.filter((a) => a.status === "planned")) {
    if (s.importedSchedule && a.external) {
      kept.push(a);
      continue;
    }
    const generic = genericScheduleArea(a, s);
    if (generic && !hasScheduledWork(a)) {
      if (a.source === "generated" && fitsFixedWeek(a, s)) fillers.push(a);
      else if (
        a.categoryId === generic &&
        fitsFixedWeek(a, s) &&
        templateBlocks(s).some(
          (b) =>
            b.day === weekday(a.date) &&
            b.categoryId === generic &&
            b.start === a.start &&
            b.end === a.end,
        )
      )
        fillers.push(a);
      else {
        replaced.push(a);
        changed = true;
      }
      continue;
    }
    const area = scheduledWorkArea(a, s);
    if (
      area &&
      (a.categoryId !== area ||
        !fitsFixedWeek(a, s) ||
        kept.some(
          (b) =>
            b.date === a.date &&
            b.status !== "skipped" &&
            scheduledWorkArea(b, s) === area &&
            b.start < a.end &&
            b.end > a.start,
        ))
    ) {
      replaced.push(a);
      changed = true;
    } else kept.push(a);
  }
  for (const a of fillers.sort(
    (a, b) =>
      Number(a.source === "generated") - Number(b.source === "generated"),
  )) {
    const area = scheduledWorkArea(a, s);
    if (
      kept.some(
        (b) =>
          b.date === a.date &&
          b.status !== "skipped" &&
          scheduledWorkArea(b, s) === area &&
          b.start < a.end &&
          b.end > a.start,
      )
    ) {
      changed = true;
      if (a.source !== "generated") replaced.push(a);
    } else kept.push(a);
  }
  return {
    activities: changed
      ? kept.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
      : plan.activities,
    replaced,
    changed,
  };
}

export function replacedScheduleActivities(
  plan: WeekPlan | undefined,
  removed: Activity[],
  active: Activity[],
) {
  const entries = new Map(
    (plan?.replacedActivities ?? []).map((a) => [`${a.id}:${a.date}`, a]),
  );
  for (const a of removed) entries.set(`${a.id}:${a.date}`, a);
  const ids = new Set(
    active
      .filter(
        (a) =>
          a.source !== "generated" ||
          hasScheduledWork(a) ||
          a.status !== "planned",
      )
      .map((a) => `${a.id}:${a.date}`),
  );
  const result = [...entries.values()].filter(
    (a) => !ids.has(`${a.id}:${a.date}`),
  );
  return result.length ? result : undefined;
}
