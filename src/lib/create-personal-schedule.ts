import type { Activity, AppData, WeekPlan, Settings } from "./types";
import type { CloudTransport } from "./workspace-sync";
import { addDays, monday } from "./date";
import { isLocalDate } from "./google-time";
import { DEFAULT_CATEGORIES } from "./defaults";
import { removeLinkedInSeries } from "./activity-exclusions";
import {
  generateTemplateWeek,
  matchesTemplateBlock,
} from "./template-planning";
import { templateBlocks, templateSettings } from "./week-template";
import { validatePlan } from "./planner";
import {
  normalizeFixedWeek,
  replacedScheduleActivities,
} from "./fixed-week-policy";

export type PersonalScheduleReport = {
  week: string;
  slots: number;
  conflicts: string[];
};

const hasWork = (a: Activity) =>
  Boolean(
    a.taskId ||
    a.habitId ||
    a.applicationId ||
    a.contactId ||
    a.careerActionId ||
    a.deadlineId ||
    a.followUpOf,
  );

// Supabase jsonb returns object keys in database order. Compare content rather
// than insertion order when checking the saved document for idempotence.
const serialize = (value: unknown) =>
  JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.keys(entry)
            .sort()
            .map((key) => [key, entry[key]]),
        )
      : entry,
  );

export function scheduleSlotCount(plan: WeekPlan) {
  return templateBlocks(plan.rules).filter((block) => {
    const date = addDays(plan.week, block.day);
    const intervals = plan.activities
      .filter(
        (a) =>
          a.date === date &&
          a.start >= block.start &&
          a.end <= block.end &&
          matchesTemplateBlock(a, block),
      )
      .sort((a, b) => a.start - b.start);
    let cursor = block.start;
    for (const a of intervals) {
      if (a.start > cursor) return false;
      cursor = Math.max(cursor, a.end);
    }
    return cursor >= block.end;
  }).length;
}

/** Install the prescribed slots. Superseded planning and work that cannot fit
 * remain outside the active calendar; appointments and outcomes are retained. */
export function createPersonalSchedule(
  data: AppData,
  week: string,
  rules?: Settings,
) {
  if (!isLocalDate(week) || monday(week) !== week)
    throw new Error("Välj en giltig vecka som börjar på en måndag.");
  const cleaned = removeLinkedInSeries(data, [], true).data;
  const settings = {
    ...templateSettings(rules ?? cleaned.settings),
    keepTemplateSlots: true,
    strictWeekTemplate: true,
  };
  const required = new Set(templateBlocks(settings).map((b) => b.categoryId));
  const categories = [
    ...cleaned.categories,
    ...DEFAULT_CATEGORIES.filter(
      (c) =>
        required.has(c.id) &&
        !cleaned.categories.some((existing) => existing.id === c.id),
    ),
  ];
  const existing = cleaned.weeks[week];
  const normalized = existing
    ? normalizeFixedWeek(existing, settings)
    : undefined;
  const preserved =
    (normalized?.activities ?? existing?.activities)?.filter(
      (a) =>
        a.status !== "planned" ||
        hasWork(a) ||
        a.external ||
        a.recurrenceId ||
        (a.source !== "generated" &&
          !a.routine &&
          !a.id.startsWith(`${week}-template-`)),
    ) ?? [];
  const base = existing
    ? {
        ...existing,
        activities: preserved,
        replacedActivities: replacedScheduleActivities(
          existing,
          normalized?.replaced ?? [],
          preserved,
        ),
        gentleDays: undefined,
        gentleFocus: undefined,
      }
    : undefined;
  const result = generateTemplateWeek(
    week,
    { ...cleaned, settings, categories },
    base,
  );
  const plan = {
    ...result.plan,
    activities: result.plan.activities.map((a) =>
      preserved.includes(a) || a.goalId || a.source !== "generated"
        ? a
        : {
            ...a,
            goalId: cleaned.goals.find(
              (g) => g.week === week && g.categoryId === a.categoryId,
            )?.id,
          },
    ),
  };
  // Loading the operation page again must not create duplicates or another save.
  const signature = (p: WeekPlan | undefined) =>
    p &&
    serialize({
      ...p,
      generatedAt: "",
    });
  const unchanged =
    cleaned === data &&
    (rules || serialize(settings) === serialize(data.settings)) &&
    serialize(categories) === serialize(data.categories) &&
    signature(plan) === signature(existing);
  let next = unchanged
    ? data
    : {
        ...cleaned,
        settings: rules ? cleaned.settings : settings,
        categories,
        weeks: { ...cleaned.weeks, [week]: plan },
      };
  const unscheduled = new Set(
    plan.replacedActivities?.flatMap((a) => (a.taskId ? [a.taskId] : [])) ?? [],
  );
  for (const other of Object.values(next.weeks))
    for (const a of other.activities)
      if (a.taskId && a.status !== "skipped") unscheduled.delete(a.taskId);
  if (
    next.tasks.some((t) => unscheduled.has(t.id) && !t.done && !t.needsPlanning)
  )
    next = {
      ...next,
      tasks: next.tasks.map((t) =>
        unscheduled.has(t.id) && !t.done ? { ...t, needsPlanning: true } : t,
      ),
    };
  const slots = scheduleSlotCount(plan);
  if (slots !== templateBlocks(settings).length)
    throw new Error(
      "Alla schemapass kunde inte skapas. Ingen ändring har sparats.",
    );
  const report: PersonalScheduleReport = {
    week,
    slots,
    conflicts: validatePlan(plan.activities, settings)
      .filter((c) => c.id.startsWith("overlap-"))
      .map((c) => c.message),
  };
  const scheduleError = validatePlan(plan.activities, settings).find((c) =>
    c.id.startsWith("schedule-"),
  );
  if (scheduleError)
    throw new Error(
      `Veckoschemats tidsgräns är inte uppfylld: ${scheduleError.message}`,
    );
  return { data: next, report };
}

/** Save the authenticated account's current document with revision checking,
 * then reread the actual saved week before reporting success. */
export async function createPersonalScheduleInCloud(
  transport: CloudTransport,
  week: string,
): Promise<PersonalScheduleReport> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await transport.load();
    if (!current)
      throw new Error("Ingen sparad molnplan hittades för det här kontot.");
    const result = createPersonalSchedule(current.data, week);
    if (result.data !== current.data) {
      try {
        await transport.save(result.data, current.revision);
      } catch (error) {
        if (error instanceof Error && error.name === "CloudConflict") continue;
        throw error;
      }
    }
    const verified = await transport.load();
    if (!verified)
      throw new Error("Det sparade veckoschemat kunde inte kontrolleras.");
    const check = createPersonalSchedule(verified.data, week);
    if (check.data === verified.data) return check.report;
  }
  throw new Error("Veckoschemat kunde inte verifieras i molnet. Försök igen.");
}
