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
  FOUR_DAY_WEEK,
  templateTargetMinutes,
  WEEK_TEMPLATE_ID,
} from "./week-template";

/** Exact weekly slots. Explicit work, appointments and outcomes take precedence.
 * Empty intervals stay empty; a blocked slot is reported rather than moved silently. */
export function generateTemplateWeek(
  week: string,
  data: Pick<AppData, "settings" | "categories" | "recurring">,
  existing?: WeekPlan,
  boundary?: { date: string; minute: number },
): PlanResult {
  const settings = data.settings;
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
  const activities = (existing?.activities ?? []).filter(
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
  const availableId = (base: string) => {
    let id = base.slice(0, 200),
      sequence = 1;
    while (activities.some((a) => a.id === id)) {
      const suffix = `-${sequence++}`;
      id = `${base.slice(0, 200 - suffix.length)}${suffix}`;
    }
    return id;
  };
  for (const recurring of data.recurring.filter(
    (r) => !excludedActivityTitle(settings, r.title),
  )) {
    for (const day of recurring.weekdays.filter((day) =>
      settings.days.includes(day),
    )) {
      const date = addDays(week, day);
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
  for (const block of FOUR_DAY_WEEK) {
    const date = addDays(week, block.day),
      id = `${week}-template-${block.id}`;
    if (
      !settings.days.includes(block.day) ||
      existing?.gentleDays?.includes(date) ||
      (boundary &&
        (date < boundary.date ||
          (date === boundary.date && block.start < boundary.minute))) ||
      activities.some(
        (a) =>
          (a.id === id && !assigned(a)) ||
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
          assigned(a) &&
          !a.external &&
          !a.recurrenceId &&
          a.categoryId === block.categoryId &&
          a.start >= block.start &&
          a.end <= block.end,
      )
    ) {
      let cursor = block.start;
      for (const held of [...occupied, { start: block.end, end: block.end }]) {
        if (held.start - cursor >= 5)
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
        suggestion:
          "Bokningen är bevarad. Välj en annan tid för mallpasset om det behövs.",
      });
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
      generatedAt: new Date().toISOString(),
      rules: structuredClone(settings),
      weeklyRoutinesFrom: boundary?.date ?? week,
      targets: Object.fromEntries(
        data.categories.map((c) => [c.id, templateTargetMinutes(c.id)]),
      ),
    },
    conflicts,
  };
}
