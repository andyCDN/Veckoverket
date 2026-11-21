import type {
  Activity,
  AppData,
  Conflict,
  PlanResult,
  WeekPlan,
} from "./types";
import { addDays } from "./date";
import { blocksTime } from "./external-calendar";
import { excludedActivityTitle } from "./activity-exclusions";
import {
  fixedWeekIsActive,
  fitsFixedWeek,
  genericScheduleArea,
  normalizeFixedWeek,
  replacedScheduleActivities,
} from "./fixed-week-policy";
import {
  templateBlocks,
  templateTargetMinutes,
  WEEK_TEMPLATE_ID,
  type WeekTemplateBlock,
} from "./week-template";

/** A concrete booking may fulfil a template slot without being duplicated. */
export function matchesTemplateBlock(a: Activity, block: WeekTemplateBlock) {
  if (a.status === "skipped" || !blocksTime(a)) return false;
  if (block.routine) return a.routine === block.routine;
  if (block.blockType === "flexible") return a.categoryId === block.categoryId;
  const title = a.title.normalize("NFKC").toLocaleLowerCase("sv-SE").trim();
  if (
    a.categoryId === block.categoryId &&
    title === block.title.normalize("NFKC").toLocaleLowerCase("sv-SE").trim()
  )
    return true;
  if (block.categoryId === "health")
    return /^(träna|träning)(?:\s|$)/u.test(title);
  if (block.categoryId === "rest") return /^lunch(?:\s|$)/u.test(title);
  if (block.categoryId === "family") return /^hämta(?:\s|$)/u.test(title);
  return a.categoryId === block.categoryId;
}

/** Prescribed slots govern work. Displaced planning remains outside the active
 * calendar; fixed appointments and logged outcomes remain visible. */
export function generateTemplateWeek(
  week: string,
  data: Pick<AppData, "settings" | "categories" | "recurring">,
  existing?: WeekPlan,
  boundary?: { date: string; minute: number },
): PlanResult {
  const settings = data.settings;
  const normalized = existing
    ? normalizeFixedWeek(existing, settings)
    : undefined;
  const started = (a: Activity) =>
    Boolean(
      boundary &&
      (a.date < boundary.date ||
        (a.date === boundary.date && a.start < boundary.minute)),
    );
  const assigned = (a: Activity) =>
    Boolean(
      a.taskId ||
      a.habitId ||
      a.applicationId ||
      a.contactId ||
      a.careerActionId ||
      a.deadlineId ||
      a.followUpOf,
    );
  const activities = (
    normalized?.activities ??
    existing?.activities ??
    []
  ).filter(
    (a) =>
      a.source !== "generated" ||
      a.status !== "planned" ||
      started(a) ||
      existing?.gentleDays?.includes(a.date) ||
      assigned(a) ||
      a.external ||
      a.recurrenceId,
  );
  const conflicts: Conflict[] = [];
  const replacedIds = new Set(
    [
      ...(existing?.replacedActivities ?? []),
      ...(normalized?.replaced ?? []),
    ].map((a) => a.id),
  );
  const availableId = (base: string) => {
    let id = base.slice(0, 200),
      sequence = 1;
    while (activities.some((a) => a.id === id) || replacedIds.has(id)) {
      const suffix = `-${sequence++}`;
      id = `${base.slice(0, 200 - suffix.length)}${suffix}`;
    }
    return id;
  };
  for (const recurring of data.recurring.filter(
    (r) =>
      !excludedActivityTitle(settings, r.title) &&
      !settings.importedSchedule?.ignoredRecurringIds.includes(r.id),
  )) {
    for (const day of recurring.weekdays.filter((day) =>
      settings.days.includes(day),
    )) {
      const date = addDays(week, day);
      if (
        fixedWeekIsActive(settings) &&
        (genericScheduleArea(recurring, settings) ||
          !fitsFixedWeek(
            { ...recurring, date, source: "recurring", status: "planned" },
            settings,
          ))
      )
        continue;
      if (
        date < recurring.startsOn ||
        (boundary &&
          (date < boundary.date ||
            (date === boundary.date && recurring.start < boundary.minute))) ||
        activities.some(
          (a) => a.recurrenceId === recurring.id && a.date === date,
        )
      )
        continue;
      const {
        weekdays: _weekdays,
        startsOn: _startsOn,
        id: _id,
        ...fields
      } = recurring;
      const pass: Activity = {
        ...fields,
        id: availableId(`${week}-recurring-${day}-${recurring.id}`),
        date,
        recurrenceId: recurring.id,
        status: "planned",
        source: "recurring",
      };
      activities.push(pass);
    }
  }
  for (const block of templateBlocks(settings)) {
    const date = addDays(week, block.day),
      id = `${week}-template-${block.id}`;
    if (
      !settings.days.includes(block.day) ||
      existing?.gentleDays?.includes(date) ||
      (boundary &&
        (date < boundary.date ||
          (date === boundary.date && block.start < boundary.minute))) ||
      activities.some((a) =>
        settings.keepTemplateSlots
          ? a.date === date &&
            a.start === block.start &&
            a.end === block.end &&
            matchesTemplateBlock(a, block)
          : (a.id === id && !assigned(a)) ||
            (block.routine && a.routine === block.routine),
      )
    )
      continue;
    if (!data.categories.some((c) => c.id === block.categoryId)) {
      conflicts.push({
        id: `template-category-${id}`,
        severity: "warning",
        message: `${block.title}: området saknas.`,
        suggestion:
          "Återställ området i inställningarna innan du planerar igen.",
      });
      continue;
    }
    const pass: Activity = {
      id: availableId(id),
      title: block.title,
      description: "Min fyradagarsvecka.",
      categoryId: block.categoryId,
      date,
      start: block.start,
      end: block.end,
      estimatedMinutes: block.end - block.start,
      blockType: block.blockType,
      priority: 5,
      status: "planned",
      source: "generated",
      ...(block.routine ? { routine: block.routine } : {}),
    };
    const occupied = activities
      .filter(
        (a) =>
          a.date === date &&
          blocksTime(a) &&
          a.start < pass.end &&
          a.end > pass.start,
      )
      .sort((a, b) => a.start - b.start);
    // Real work can consume part of its area's slot. Keep the remaining time
    // inside that slot, including pieces shorter than the generic minimum.
    if (
      block.blockType === "flexible" &&
      occupied.length &&
      occupied.every(
        (a) =>
          (fixedWeekIsActive(settings) ||
            (assigned(a) && !a.external && !a.recurrenceId)) &&
          a.categoryId === block.categoryId &&
          a.start >= block.start &&
          a.end <= block.end,
      )
    ) {
      let cursor = block.start;
      for (const held of [...occupied, { start: block.end, end: block.end }]) {
        if (held.start - cursor >= (settings.keepTemplateSlots ? 1 : 5))
          activities.push({
            ...pass,
            id: availableId(`${id}-part-${cursor}`),
            start: cursor,
            end: held.start,
            estimatedMinutes: held.start - cursor,
          });
        cursor = Math.max(cursor, held.end);
      }
    } else if (occupied.length) {
      conflicts.push({
        id: `template-busy-${id}`,
        severity: "warning",
        message: `${block.title} ${date}: malltiden upptas av en befintlig bokning.`,
        suggestion: settings.keepTemplateSlots
          ? "Både schemapasset och den egna bokningen finns kvar. Flytta den bokning som passar bäst."
          : "Bokningen är bevarad. Välj en annan tid för mallpasset om det behövs.",
      });
      if (settings.keepTemplateSlots) activities.push(pass);
    } else activities.push(pass);
  }
  return {
    plan: {
      ...existing,
      templateId: WEEK_TEMPLATE_ID,
      templateNeedsRefresh: undefined,
      week,
      activities: activities.sort(
        (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
      ),
      replacedActivities: replacedScheduleActivities(
        existing,
        normalized?.replaced ?? [],
        activities,
      ),
      generatedAt: new Date().toISOString(),
      rules: structuredClone(settings),
      weeklyRoutinesFrom: boundary?.date ?? week,
      targets: Object.fromEntries(
        data.categories.map((c) => [
          c.id,
          templateTargetMinutes(c.id, settings),
        ]),
      ),
    },
    conflicts,
  };
}
