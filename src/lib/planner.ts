import type {
  Activity,
  AppData,
  Category,
  Conflict,
  PlanResult,
  Settings,
  WeekPlan,
} from "./types";
import { addDays, weekday } from "./date";
import { blocksTime, GOOGLE_CATEGORY_ID } from "./external-calendar";
import {
  addWeeklyRoutines,
  ROUTINE_CATEGORY,
  routineMinutes,
  routineConflicts,
} from "./weekly-routines";

export function plannedDays(s: Settings): number[] {
  return [
    ...new Set([
      ...s.days.filter((d) => d < 5 || s.weekends),
      ...(s.weekends ? [5, 6] : []),
    ]),
  ].sort();
}
export function visibleDays(s: Settings, activities: Activity[]): number[] {
  return [
    ...new Set([...plannedDays(s), ...activities.map((a) => weekday(a.date))]),
  ].sort();
}
export function categoryMinutes(
  activities: Activity[],
  status?: Activity["status"],
): Record<string, number> {
  return activities
    .filter(
      (a) =>
        (!status || a.status === status) &&
        (!a.external || (a.external.busy && !a.external.allDay)),
    )
    .reduce<Record<string, number>>((totals, a) => {
      totals[a.categoryId] = (totals[a.categoryId] || 0) + a.end - a.start;
      return totals;
    }, {});
}
export function targetMinutes(category: Category, s: Settings) {
  if (category.id === ROUTINE_CATEGORY.id) return routineMinutes(s);
  if (category.id === GOOGLE_CATEGORY_ID) return 0;
  if (category.id === "music")
    return s.musicMornings * (s.lunchStart - s.start);
  if (category.id === "health") return s.trainingSessions * s.trainingMinutes;
  if (category.id === "family")
    return (
      plannedDays(s).length *
      Math.max(
        0,
        Math.min(s.end, s.familyEnd) - Math.max(s.start, s.familyStart),
      )
    );
  return category.targetMinutes;
}
export function capacity(s: Settings) {
  const overlap = (a: number, b: number) =>
    Math.max(0, Math.min(s.end, b) - Math.max(s.start, a));
  const lunch = overlap(s.lunchStart, s.lunchEnd),
    family = overlap(s.familyStart, s.familyEnd);
  const shared = Math.max(
    0,
    Math.min(s.end, s.lunchEnd, s.familyEnd) -
      Math.max(s.start, s.lunchStart, s.familyStart),
  );
  return (
    plannedDays(s).length *
    Math.max(0, s.end - s.start - lunch - family + shared)
  );
}
export function budgetRemaining(categories: Category[], s: Settings) {
  return (
    capacity(s) -
    categories
      .filter((c) => c.id !== "family" && c.id !== "rest")
      .reduce((n, c) => n + targetMinutes(c, s), 0) -
    categories
      .filter((c) => c.id === "rest")
      .reduce((n, c) => n + c.targetMinutes, 0)
  );
}
const overlap = (a: Activity, b: Activity) =>
  a.date === b.date && a.start < b.end && b.start < a.end;
export function validatePlan(activities: Activity[], s: Settings): Conflict[] {
  const issues: Conflict[] = [],
    days = plannedDays(s);
  const ordered = [...activities].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
  );
  ordered.forEach((a, i) => {
    if (
      !Number.isFinite(a.start) ||
      !Number.isFinite(a.end) ||
      a.end <= a.start ||
      a.start < 0 ||
      a.end > 1440
    )
      issues.push({
        id: `duration-${a.id}`,
        message: `”${a.title}” har en ogiltig tidslängd.`,
        suggestion: "Välj en sluttid efter starttiden.",
        severity: "error",
      });
    if (
      !a.external &&
      (!days.includes(weekday(a.date)) || a.start < s.start || a.end > s.end)
    )
      issues.push({
        id: `availability-${a.id}`,
        message: `”${a.title}” ligger utanför din tillgängliga tid.`,
        suggestion:
          "Flytta aktiviteten eller ändra tillgängligheten i inställningarna.",
        severity: "error",
      });
    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j];
      if (b.date !== a.date) break;
      if (!blocksTime(a) || !blocksTime(b) || (a.external && b.external))
        continue;
      if (overlap(a, b))
        issues.push({
          id: `overlap-${a.id}-${b.id}`,
          message: `”${a.title}” och ”${b.title}” överlappar den ${a.date}.`,
          suggestion:
            "Flytta en flexibel aktivitet. Låst tid ändras aldrig automatiskt.",
          severity: "error",
        });
      else if (
        s.buffer > 0 &&
        b.start >= a.end &&
        b.start - a.end < s.buffer &&
        (a.blockType !== "locked" || b.blockType !== "locked")
      )
        issues.push({
          id: `buffer-${a.id}-${b.id}`,
          message: `För kort buffert mellan ”${a.title}” och ”${b.title}”.`,
          suggestion: `Lämna minst ${s.buffer} minuter mellan aktiviteterna.`,
          severity: "error",
        });
    }
    if (
      a.categoryId === "music" &&
      a.source === "generated" &&
      (a.start !== s.start || a.end !== s.lunchStart)
    )
      issues.push({
        id: `music-${a.id}`,
        message: "Musikförmiddagen måste vara sammanhängande.",
        suggestion: "Behåll hela förmiddagen eller ändra reglerna.",
        severity: "error",
      });
  });
  return issues;
}
export function validateMove(
  original: Activity,
  moved: Activity,
  activities: Activity[],
  s: Settings,
  categories: Category[],
): string | null {
  if (original.blockType === "locked")
    return "Låst tid kan redigeras i formuläret men får inte flyttas med dra och släpp.";
  if (
    !categories.find((c) => c.id === original.categoryId)?.movable ||
    (original.categoryId === "music" && !s.musicMovable)
  )
    return "Flytt av den här aktiviteten är inte tillåten. Ändra dess regel i inställningarna.";
  if (
    original.blockType === "protected" &&
    original.end - original.start !== moved.end - moved.start
  )
    return "Skyddad tid måste flyttas som ett helt block.";
  if (
    original.categoryId === "music" &&
    (moved.start !== s.start || moved.end !== s.lunchStart)
  )
    return "Musiken behöver en hel förmiddag.";
  const issues = validatePlan(
    [...activities.filter((a) => a.id !== original.id), moved],
    s,
  );
  return issues.find((c) => c.id.includes(moved.id))?.message ?? null;
}

/** Hard: locked reservations, availability, no overlap, buffers, contiguous protected blocks.
 * Soft: music Tue/Fri; training afternoons; study Wed/Thu. Objective: satisfy ranked budgets,
 * then give remaining capacity to career. No random choices or clock-dependent scheduling.
 */
export function generateWeek(
  week: string,
  data: Pick<AppData, "settings" | "categories" | "recurring">,
  existing?: WeekPlan,
): PlanResult {
  const { settings: s, recurring } = data;
  const categories = data.categories.filter((c) => c.id !== GOOGLE_CATEGORY_ID);
  const days = plannedDays(s),
    activities: Activity[] = [],
    conflicts: Conflict[] = [];
  let sequence = 0;
  const add = (
    value: Partial<Activity> &
      Pick<Activity, "title" | "date" | "start" | "end" | "categoryId">,
  ) => {
    while (activities.some((a) => a.id === `${week}-auto-${sequence}`))
      sequence++;
    const a: Activity = {
      id: `${week}-auto-${sequence++}`,
      description: "",
      estimatedMinutes: value.end - value.start,
      priority: 3,
      blockType: "flexible",
      status: "planned",
      source: "generated",
      ...value,
    };
    activities.push(a);
    return a;
  };
  // Preserve explicitly entered/moved activities and logged outcomes; regenerate only unedited suggestions.
  activities.push(
    ...(existing?.activities.filter(
      (a) => a.source !== "generated" || a.status !== "planned",
    ) ?? []),
  );
  // Without explicit permission, existing protected music retains its original place.
  // Reducing the requested count explicitly releases the surplus generated mornings.
  const heldMusic = activities.filter((a) => a.categoryId === "music").length;
  let retainMusic = Math.max(0, s.musicMornings - heldMusic);
  for (const a of existing?.activities ?? []) {
    if (
      a.source !== "generated" ||
      a.status !== "planned" ||
      a.blockType === "locked" ||
      a.routine
    )
      continue;
    const category = categories.find((c) => c.id === a.categoryId);
    if (a.categoryId === "music") {
      if (
        !s.musicMovable &&
        retainMusic > 0 &&
        a.start === s.start &&
        a.end === s.lunchStart
      ) {
        activities.push(a);
        retainMusic--;
      }
    } else if (category && !category.movable) activities.push(a);
  }
  for (const day of days) {
    const date = addDays(week, day);
    for (const [key, title, categoryId, start, end] of [
      ["lunch", "Lunch & paus", "rest", s.lunchStart, s.lunchEnd],
      ["family", "Familj & vardag", "family", s.familyStart, s.familyEnd],
    ] as const) {
      const from = Math.max(start, s.start),
        to = Math.min(end, s.end);
      const same = activities.some(
        (a) =>
          a.date === date &&
          a.start === from &&
          a.end === to &&
          a.categoryId === categoryId &&
          a.blockType === "locked",
      );
      if (from < to && !same)
        add({
          id: `${week}-${day}-${key}`,
          title,
          categoryId,
          date,
          start: from,
          end: to,
          blockType: "locked",
          priority: 5,
        });
    }
  }
  for (const r of recurring)
    for (const day of days.filter((d) => r.weekdays.includes(d))) {
      const date = addDays(week, day);
      if (
        date < r.startsOn ||
        activities.some((a) => a.recurrenceId === r.id && a.date === date)
      )
        continue;
      const { weekdays: _days, startsOn: _start, id, ...value } = r;
      add({
        ...value,
        id: `${week}-repeat-${id}-${day}`,
        date,
        recurrenceId: id,
        source: "recurring",
      });
    }
  // Free ranges include the required buffer on both sides of occupied time.
  function gaps(day: number) {
    const date = addDays(week, day),
      busy = activities
        .filter((a) => a.date === date && blocksTime(a))
        .sort((a, b) => a.start - b.start);
    let cursor = s.start;
    const result: { date: string; start: number; end: number; day: number }[] =
      [];
    for (const a of busy) {
      const from = Math.max(s.start, a.start - s.buffer),
        to = Math.min(s.end, a.end + s.buffer);
      if (to <= s.start || from >= s.end) continue;
      if (from > cursor) result.push({ date, start: cursor, end: from, day });
      cursor = Math.max(cursor, to);
    }
    if (cursor < s.end) result.push({ date, start: cursor, end: s.end, day });
    return result;
  }
  const missing = (id: string, title: string, minutes: number) =>
    conflicts.push({
      id: `budget-${id}`,
      severity: "warning",
      message: `${title}: ${minutes} minuter får inte plats i veckan.`,
      suggestion:
        id === "health"
          ? "Minska ett tidsmål, frigör ett sammanhängande pass eller tillåt helger. Jobbsökandets minimitid skyddas."
          : "Minska tidsmålet, minska bufferten eller utöka din tillgänglighet. Inga fasta åtaganden har flyttats.",
    });
  const music = categories.find((c) => c.id === "music");
  const existingMusic = activities.filter(
    (a) =>
      a.categoryId === "music" && a.start === s.start && a.end === s.lunchStart,
  ).length;
  let musicNeeded = Math.max(0, s.musicMornings - existingMusic);
  if (music)
    for (const day of [1, 4, 0, 2, 3, 5, 6].filter((d) => days.includes(d))) {
      if (!musicNeeded) break;
      if (gaps(day).some((g) => g.start <= s.start && g.end >= s.lunchStart)) {
        add({
          title: "Musikproduktion",
          categoryId: "music",
          date: addDays(week, day),
          start: s.start,
          end: s.lunchStart,
          blockType: "protected",
          priority: music.priority,
        });
        musicNeeded--;
      }
    }
  if (musicNeeded)
    missing(
      "music",
      `${musicNeeded} musikförmiddag${musicNeeded > 1 ? "ar" : ""}`,
      musicNeeded * (s.lunchStart - s.start),
    );
  const flex = categories
    .filter((c) => !["music", "family", ROUTINE_CATEGORY.id].includes(c.id))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const c of flex) {
    let remaining = Math.max(
      0,
      targetMinutes(c, s) - (categoryMinutes(activities)[c.id] || 0),
    );
    if (c.id === "health") {
      let sessions = Math.max(
        0,
        s.trainingSessions -
          activities.filter(
            (a) =>
              a.categoryId === "health" && a.end - a.start >= s.trainingMinutes,
          ).length,
      );
      const slots = () =>
        days
          .flatMap(gaps)
          .filter((g) => g.end - g.start >= s.trainingMinutes)
          .sort((a, b) => {
            const score = (g: typeof a) =>
              (g.start >= s.lunchEnd ? 0 : 100) +
              [1, 3, 0, 2, 4, 5, 6].indexOf(g.day);
            return score(a) - score(b) || a.start - b.start;
          });
      while (sessions > 0) {
        const slot = slots()[0];
        if (!slot) break;
        add({
          title: "Träning",
          categoryId: c.id,
          date: slot.date,
          start: slot.start,
          end: slot.start + s.trainingMinutes,
          priority: c.priority,
        });
        sessions--;
      }
      if (sessions)
        missing(c.id, `${sessions} träningspass`, sessions * s.trainingMinutes);
      continue;
    }
    const preferred = (day: number, start: number) =>
      c.id === "learning"
        ? day === 2 && start < s.lunchStart
          ? 0
          : day === 3 && start < s.lunchStart
            ? 1
            : day === 0 && start >= s.lunchEnd
              ? 2
              : day === 4 && start >= s.lunchEnd
                ? 3
                : 10 + day
        : day === 0 && start < s.lunchStart
          ? 0
          : day === 2 && start >= s.lunchEnd
            ? 1
            : 10 + day;
    while (remaining >= c.minBlock) {
      const candidates = days
        .flatMap(gaps)
        .filter(
          (g) => g.end - g.start >= (c.allowSplit ? c.minBlock : remaining),
        )
        .sort(
          (a, b) =>
            preferred(a.day, a.start) - preferred(b.day, b.start) ||
            a.start - b.start,
        );
      const slot = candidates[0];
      if (!slot) break;
      const duration = c.allowSplit
        ? Math.min(remaining, slot.end - slot.start)
        : remaining;
      add({
        title:
          c.id === "learning"
            ? "Kompetensutveckling"
            : c.id === "career"
              ? "Jobbsökande & nätverk"
              : c.name,
        categoryId: c.id,
        date: slot.date,
        start: slot.start,
        end: slot.start + duration,
        priority: c.priority,
        blockType: c.allowSplit ? "flexible" : "protected",
      });
      remaining -= duration;
    }
    if (remaining > 0) missing(c.id, c.name, remaining);
  }
  const career = categories.find((c) => c.id === "career");
  if (career)
    for (const day of days)
      for (const g of gaps(day))
        if (g.end - g.start >= career.minBlock)
          add({
            title: "Jobbsökande & nätverk",
            categoryId: career.id,
            date: g.date,
            start: g.start,
            end: g.end,
            priority: career.priority,
          });
  // Associate generated blocks with suitable goals in the presentation layer, not the engine.
  const basePlan: WeekPlan = {
    week,
    activities: activities.sort(
      (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
    ),
    generatedAt: new Date().toISOString(),
    rules: structuredClone(s),
    targets: Object.fromEntries(
      categories.map((c) => [c.id, targetMinutes(c, s)]),
    ),
  };
  const plan = categories.some((c) => c.id === ROUTINE_CATEGORY.id)
    ? addWeeklyRoutines(basePlan, s, categories)
    : basePlan;
  const totals = categoryMinutes(plan.activities);
  for (const c of categories.filter(
    (c) => !["family", "rest", ROUTINE_CATEGORY.id].includes(c.id),
  )) {
    const remaining = targetMinutes(c, s) - (totals[c.id] || 0);
    if (
      remaining > 0 &&
      !conflicts.some((issue) => issue.id === `budget-${c.id}`)
    )
      missing(c.id, c.name, remaining);
  }
  conflicts.push(
    ...validatePlan(plan.activities, s),
    ...routineConflicts(plan, s),
  );
  return { plan, conflicts };
}
export function assessWeek(
  plan: WeekPlan,
  data: Pick<AppData, "categories" | "settings">,
): Conflict[] {
  const rules = plan.rules ?? data.settings;
  const totals = categoryMinutes(plan.activities),
    conflicts = [
      ...validatePlan(plan.activities, rules),
      ...routineConflicts(plan, rules),
    ];
  for (const c of data.categories.filter(
    (c) =>
      (!plan.targets || c.id in plan.targets) &&
      !["family", "rest", ROUTINE_CATEGORY.id].includes(c.id),
  )) {
    const missing =
      (plan.targets?.[c.id] ?? targetMinutes(c, rules)) - (totals[c.id] || 0);
    if (missing > 0)
      conflicts.push({
        id: `target-${c.id}`,
        severity: "warning",
        message: `${c.name}: ${missing} minuter återstår att planera.`,
        suggestion:
          "Generera ett nytt förslag eller lägg till en aktivitet i en ledig lucka. Minska tidsmålet eller tillåt helger om veckan är full.",
      });
  }
  if (
    rules.trainingSessions >
      plan.activities.filter(
        (a) =>
          a.categoryId === "health" && a.end - a.start >= rules.trainingMinutes,
      ).length &&
    !conflicts.some((c) => c.id === "target-health")
  )
    conflicts.push({
      id: "sessions-health",
      severity: "warning",
      message: "Träningspassen är uppdelade i för korta block.",
      suggestion: "Avsätt sammanhängande tid för varje pass.",
    });
  return conflicts;
}
