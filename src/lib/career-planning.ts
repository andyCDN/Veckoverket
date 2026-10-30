import type { Activity, AppData, Deadline, Settings, WeekPlan } from "./types";
import { addDays, monday, planningBoundary, weekday } from "./date";
import { generateWeek, plannedDays, validateMove } from "./planner";
import { blocksTime } from "./external-calendar";
import { isLocalDate } from "./google-time";

export type PlanningPreview = {
  data: AppData;
  activities: Activity[];
  errors: string[];
};

// Lunch/family reservations also apply to imported or explicitly empty weeks.
function fits(a: Activity, held: Activity[], s: Settings) {
  if (
    !plannedDays(s).includes(weekday(a.date)) ||
    a.start < s.start ||
    a.end > s.end
  )
    return false;
  const reservations = [
    { start: s.lunchStart, end: s.lunchEnd },
    { start: s.familyStart, end: s.familyEnd },
    ...held.filter((b) => b.date === a.date && blocksTime(b)),
  ];
  return reservations.every(
    (b) => a.end + s.buffer <= b.start || a.start >= b.end + s.buffer,
  );
}

/** Explicit, atomic day proposal. No change to past, started, completed, skipped,
 * protected, recurring or imported activities; all other days remain identical. */
export function replanDay(
  data: AppData,
  boundary = planningBoundary(),
): PlanningPreview {
  const week = monday(boundary.date),
    plan = data.weeks[week];
  if (!plan)
    return {
      data,
      activities: [],
      errors: ["Det finns ingen sparad plan för dagen."],
    };
  const s = plan.rules ?? data.settings;
  const movable = plan.activities
    .filter(
      (a) =>
        a.date === boundary.date &&
        a.start >= boundary.minute &&
        a.status === "planned" &&
        a.blockType === "flexible" &&
        !a.external &&
        !a.recurrenceId &&
        !a.routine &&
        !a.deadlineId &&
        data.categories.find((c) => c.id === a.categoryId)?.movable,
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.start - b.start ||
        a.id.localeCompare(b.id),
    );
  const moving = new Set(movable.map((a) => a.id));
  const held = plan.activities.filter((a) => !moving.has(a.id));
  const placed: Activity[] = [];
  for (const a of movable) {
    let moved: Activity | undefined;
    for (
      let start = Math.ceil(Math.max(s.start, boundary.minute) / 5) * 5;
      start + a.end - a.start <= s.end;
      start += 5
    ) {
      const candidate = {
        ...a,
        start,
        end: start + a.end - a.start,
        source: "manual" as const,
      };
      if (
        fits(candidate, held, s) &&
        !validateMove(a, candidate, held, s, data.categories)
      ) {
        moved = start === a.start ? a : candidate;
        break;
      }
    }
    if (!moved)
      return {
        data,
        activities: [],
        errors: [
          `”${a.title}” ryms inte i resten av dagen. Planen har inte ändrats.`,
        ],
      };
    placed.push(moved);
    held.push(moved);
  }
  const byId = new Map(placed.map((a) => [a.id, a]));
  const activities = placed.filter((a) => {
    const old = movable.find((b) => b.id === a.id)!;
    return a.start !== old.start;
  });
  if (!activities.length) return { data, activities: [], errors: [] };
  return {
    data: {
      ...data,
      weeks: {
        ...data.weeks,
        [week]: {
          ...plan,
          activities: plan.activities.map((a) => byId.get(a.id) ?? a),
        },
      },
    },
    activities,
    errors: [],
  };
}

/** Steps are supplied in execution order, then placed backwards, latest first.
 * Existing plans are immutable constraints. Failed proposals never partially save. */
export function planDeadline(
  data: AppData,
  deadline: Deadline,
  boundary = planningBoundary(),
): PlanningPreview {
  const fail = (message: string): PlanningPreview => ({
    data,
    activities: [],
    errors: [message],
  });
  if (
    !isLocalDate(deadline.date) ||
    deadline.date < boundary.date ||
    deadline.date > addDays(boundary.date, 366) ||
    !Number.isInteger(deadline.minute) ||
    deadline.minute < 0 ||
    deadline.minute > 1440 ||
    !deadline.steps.length ||
    deadline.steps.length > 30 ||
    !data.categories.some(
      (c) => c.id === deadline.categoryId && c.id !== "google-calendar",
    ) ||
    deadline.steps.some(
      (s) =>
        !s.title.trim() ||
        !Number.isInteger(s.minutes) ||
        s.minutes < 5 ||
        s.minutes > 480,
    )
  )
    return fail("Ange en deadline inom ett år och delsteg på 5–480 minuter.");
  const existing = Object.values(data.weeks)
    .flatMap((p) => p.activities)
    .filter((a) => a.deadlineId === deadline.id);
  if (existing.length)
    return fail(
      "Deadlinen har redan kalenderpass. Redigera eller ta bort passen i kalendern innan du planerar igen.",
    );
  const weeks = { ...data.weeks };
  const placed: Activity[] = [];
  let latestDate = deadline.date,
    latestMinute = deadline.minute;
  for (const step of [...deadline.steps].reverse()) {
    let result: Activity | undefined;
    for (
      let date = latestDate;
      date >= boundary.date && !result;
      date = addDays(date, -1)
    ) {
      const week = monday(date);
      let plan = weeks[week];
      if (!plan) {
        const generated = generateWeek(week, data).plan;
        plan = {
          ...generated,
          activities: generated.activities.filter(
            (a) =>
              a.source !== "generated" ||
              a.blockType !== "flexible" ||
              a.routine,
          ),
        };
        weeks[week] = plan;
      }
      const s = plan.rules ?? data.settings;
      const endLimit = Math.min(
        s.end,
        date === latestDate ? latestMinute : 1440,
      );
      for (
        let end = Math.floor(endLimit / 5) * 5;
        end - step.minutes >=
        Math.max(s.start, date === boundary.date ? boundary.minute : 0);
        end -= 5
      ) {
        const candidate: Activity = {
          id: `deadline-${deadline.id}-${step.id}`,
          title: `${deadline.title}: ${step.title}`,
          description: `Deadline ${deadline.date}`,
          categoryId: deadline.categoryId,
          date,
          start: end - step.minutes,
          end,
          estimatedMinutes: step.minutes,
          blockType: "flexible",
          priority: 5,
          status: "planned",
          source: "manual",
          deadlineId: deadline.id,
          deadlineStepId: step.id,
          applicationId: deadline.applicationId,
        };
        if (fits(candidate, plan.activities, s)) {
          result = candidate;
          break;
        }
      }
    }
    if (!result)
      return fail(
        `”${step.title}” ryms inte före deadline. Frigör tid eller ändra delstegen. Planen har inte ändrats.`,
      );
    const week = monday(result.date);
    weeks[week] = {
      ...weeks[week],
      activities: [...weeks[week].activities, result],
    };
    placed.push(result);
    latestDate = result.date;
    latestMinute = result.start - (weeks[week].rules ?? data.settings).buffer;
  }
  // Do not persist unused weeks inspected while searching for space.
  const changed: Record<string, WeekPlan> = { ...data.weeks };
  for (const a of placed) changed[monday(a.date)] = weeks[monday(a.date)];
  return {
    data: { ...data, weeks: changed },
    activities: placed.reverse(),
    errors: [],
  };
}

export function validateCareerData(d: AppData) {
  const text = (v: unknown, max = 4000): v is string =>
    typeof v === "string" && v.length <= max;
  const date = (v: unknown) =>
    v === "" || (typeof v === "string" && isLocalDate(v));
  function records(value: unknown): Record<string, any>[] {
    if (!Array.isArray(value) || value.length > 10000)
      throw new Error("Jobb- och nätverksdata är ogiltiga.");
    const ids = new Set();
    for (const r of value) {
      if (!r || !text(r.id, 200) || !r.id.trim() || ids.has(r.id))
        throw new Error("Jobb- och nätverksdata har ogiltiga id:n.");
      ids.add(r.id);
    }
    return value;
  }
  for (const a of records(d.applications === undefined ? [] : d.applications))
    if (
      !text(a.organization, 200) ||
      !a.organization.trim() ||
      !text(a.role, 200) ||
      !a.role.trim() ||
      !["draft", "sent", "interview", "offer", "rejected", "closed"].includes(
        a.status,
      ) ||
      !date(a.deadline) ||
      !date(a.followUpDate) ||
      !text(a.nextAction) ||
      !text(a.notes)
    )
      throw new Error("En ansökan är ogiltig.");
  for (const c of records(d.contacts === undefined ? [] : d.contacts)) {
    if (
      !text(c.name, 200) ||
      !c.name.trim() ||
      !text(c.organization, 200) ||
      !text(c.nextAction) ||
      !date(c.followUpDate)
    )
      throw new Error("En kontakt är ogiltig.");
    for (const e of records(c.entries))
      if (!date(e.date) || !e.date || !text(e.channel, 200) || !text(e.notes))
        throw new Error("En kontaktanteckning är ogiltig.");
  }
  for (const dline of records(d.deadlines === undefined ? [] : d.deadlines)) {
    if (
      !text(dline.title, 200) ||
      !dline.title.trim() ||
      !date(dline.date) ||
      !dline.date ||
      !Number.isInteger(dline.minute) ||
      dline.minute < 0 ||
      dline.minute > 1440 ||
      !d.categories.some((c) => c.id === dline.categoryId) ||
      (dline.applicationId !== undefined && !text(dline.applicationId, 200)) ||
      !Array.isArray(dline.steps) ||
      !dline.steps.length ||
      dline.steps.length > 30
    )
      throw new Error("En deadline är ogiltig.");
    for (const s of records(dline.steps))
      if (
        !text(s.title, 200) ||
        !s.title.trim() ||
        !Number.isInteger(s.minutes) ||
        s.minutes < 5 ||
        s.minutes > 480
      )
        throw new Error("Ett delsteg är ogiltigt.");
  }
}

export function bookCareerActivity(
  data: AppData,
  activity: Activity,
): PlanningPreview {
  const week = monday(activity.date);
  const plan =
    data.weeks[week] ??
    (() => {
      const p = generateWeek(week, data).plan;
      return {
        ...p,
        activities: p.activities.filter(
          (a) =>
            a.source !== "generated" || a.blockType !== "flexible" || a.routine,
        ),
      };
    })();
  if (
    !activity.title.trim() ||
    !data.categories.some(
      (c) => c.id === activity.categoryId && c.id !== "google-calendar",
    ) ||
    !Number.isInteger(activity.end - activity.start) ||
    activity.end - activity.start < 5 ||
    activity.end - activity.start > 480 ||
    plan.activities.some((a) => a.id === activity.id) ||
    !isLocalDate(activity.date) ||
    !Number.isFinite(activity.start) ||
    !Number.isFinite(activity.end) ||
    activity.end <= activity.start ||
    !fits(activity, plan.activities, plan.rules ?? data.settings)
  )
    return {
      data,
      activities: [],
      errors: [
        "Passet ryms inte på den valda tiden. Välj en ledig tid inom dina planeringsregler.",
      ],
    };
  return {
    data: {
      ...data,
      weeks: {
        ...data.weeks,
        [week]: { ...plan, activities: [...plan.activities, activity] },
      },
    },
    activities: [activity],
    errors: [],
  };
}
