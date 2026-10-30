import { separateJobCategories } from "./job-categories";
import { validateCareerData } from "./career-planning";
import type { AppData } from "./types";
import { googleEventUrl, isGoogleEventKey } from "./external-calendar";
import { isLocalDate } from "./google-time";
import { refreshDemoCopy } from "./defaults";
export const STORAGE_KEY = "veckoverket.workspace.v1";
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function decodeData(raw: string): AppData {
  const d = JSON.parse(raw);
  if (
    !d ||
    d.version !== 1 ||
    typeof d.profile?.name !== "string" ||
    !Array.isArray(d.categories) ||
    !d.categories.length ||
    !Array.isArray(d.goals) ||
    !Array.isArray(d.tasks) ||
    !Array.isArray(d.recurring) ||
    !d.weeks ||
    !d.reflections
  )
    throw new Error(
      "Filen är inte en giltig Veckoverket-säkerhetskopia (version 1).",
    );
  for (const s of [
    d.settings,
    ...Object.values(d.weeks)
      .map((p) => (p as { rules?: unknown }).rules)
      .filter(Boolean),
  ] as Record<string, any>[]) {
    if (
      !s ||
      !Array.isArray(s.days) ||
      !s.days.every(
        (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 6,
      ) ||
      ![
        "start",
        "end",
        "lunchStart",
        "lunchEnd",
        "familyStart",
        "familyEnd",
        "musicMornings",
        "trainingSessions",
        "trainingMinutes",
        "buffer",
      ].every((k) => Number.isFinite(s[k])) ||
      s.start >= s.end ||
      s.start < 0 ||
      s.end > 1440 ||
      s.lunchStart >= s.lunchEnd ||
      s.familyStart >= s.familyEnd ||
      s.buffer < 0 ||
      s.trainingMinutes <= 0 ||
      (s.autoPlanning !== undefined && typeof s.autoPlanning !== "boolean")
    )
      throw new Error("Planeringsreglerna är ogiltiga.");
  }
  const ids = new Set<string>();
  for (const c of d.categories) {
    if (
      typeof c.id !== "string" ||
      ids.has(c.id) ||
      typeof c.name !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(c.color) ||
      !Number.isFinite(c.targetMinutes) ||
      c.targetMinutes < 0 ||
      !Number.isFinite(c.priority) ||
      !Number.isFinite(c.minBlock) ||
      c.minBlock <= 0
    )
      throw new Error("Kategorierna är ogiltiga.");
    ids.add(c.id);
  }
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (d.calendarCategoryRules !== undefined) {
    if (
      !Array.isArray(d.calendarCategoryRules) ||
      d.calendarCategoryRules.length > 100
    )
      throw new Error("Kategorireglerna är ogiltiga.");
    const ruleIds = new Set();
    for (const rule of d.calendarCategoryRules) {
      if (
        !rule ||
        typeof rule.id !== "string" ||
        !rule.id.trim() ||
        ruleIds.has(rule.id) ||
        typeof rule.contains !== "string" ||
        !rule.contains.trim() ||
        rule.contains.length > 120 ||
        !ids.has(rule.categoryId) ||
        rule.categoryId === "google-calendar" ||
        typeof rule.enabled !== "boolean" ||
        (rule.calendarId !== undefined &&
          (typeof rule.calendarId !== "string" ||
            !rule.calendarId.trim() ||
            rule.calendarId.length > 500))
      )
        throw new Error("En kategoriregel är ogiltig.");
      ruleIds.add(rule.id);
    }
  }
  for (const [week, plan] of Object.entries(d.weeks) as [
    string,
    { week: string; activities: Record<string, unknown>[] },
  ][]) {
    if (
      !date.test(week) ||
      plan.week !== week ||
      !Array.isArray(plan.activities)
    )
      throw new Error("Veckodatan är ogiltig.");
    const routinesFrom = (plan as { weeklyRoutinesFrom?: unknown })
      .weeklyRoutinesFrom;
    if (
      routinesFrom !== undefined &&
      (typeof routinesFrom !== "string" || !isLocalDate(routinesFrom))
    )
      throw new Error("Veckoplaneringens startdatum är ogiltigt.");
    const activityIds = new Set();
    for (const a of plan.activities) {
      if (
        typeof a.id !== "string" ||
        activityIds.has(a.id) ||
        typeof a.title !== "string" ||
        typeof a.date !== "string" ||
        !date.test(a.date) ||
        !ids.has(String(a.categoryId)) ||
        !Number.isFinite(a.start) ||
        !Number.isFinite(a.end) ||
        Number(a.end) <= Number(a.start) ||
        !["locked", "protected", "flexible"].includes(String(a.blockType)) ||
        !["planned", "done", "skipped"].includes(String(a.status)) ||
        [
          "applicationId",
          "contactId",
          "careerActionId",
          "deadlineId",
          "deadlineStepId",
        ].some(
          (k) =>
            a[k] !== undefined &&
            (typeof a[k] !== "string" ||
              !(a[k] as string).trim() ||
              (a[k] as string).length > 200),
        ) ||
        (a.routine !== undefined &&
          !["week-start", "week-review"].includes(String(a.routine))) ||
        (a.followUpOf !== undefined &&
          (!a.followUpOf ||
            typeof a.followUpOf !== "object" ||
            typeof (a.followUpOf as Record<string, unknown>).week !==
              "string" ||
            !date.test(
              String((a.followUpOf as Record<string, unknown>).week),
            ) ||
            typeof (a.followUpOf as Record<string, unknown>).activityId !==
              "string"))
      )
        throw new Error("En aktivitet är ogiltig.");
      if (a.external !== undefined || a.source === "external") {
        const e = a.external as Record<string, unknown> | undefined;
        if (
          !e ||
          e.provider !== "google-calendar" ||
          a.source !== "external" ||
          a.blockType !== "locked" ||
          typeof e.calendarId !== "string" ||
          !e.calendarId ||
          typeof e.eventId !== "string" ||
          !e.eventId ||
          typeof e.allDay !== "boolean" ||
          typeof e.busy !== "boolean" ||
          typeof e.originalStart !== "string" ||
          typeof e.originalEnd !== "string" ||
          (e.allDay
            ? !isLocalDate(String(e.originalStart)) ||
              !isLocalDate(String(e.originalEnd)) ||
              String(e.originalEnd) <= String(e.originalStart)
            : !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(String(e.originalStart)) ||
              !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(String(e.originalEnd)) ||
              !Number.isFinite(Date.parse(String(e.originalStart))) ||
              !Number.isFinite(Date.parse(String(e.originalEnd))) ||
              Date.parse(String(e.originalEnd)) <=
                Date.parse(String(e.originalStart))) ||
          (e.url !== undefined && !googleEventUrl(e.url)) ||
          Number(a.start) < 0 ||
          Number(a.end) > 1440
        )
          throw new Error("En importerad kalenderhändelse är ogiltig.");
      }
      activityIds.add(a.id);
    }
  }
  for (const g of d.goals)
    if (
      typeof g.id !== "string" ||
      typeof g.title !== "string" ||
      !ids.has(g.categoryId) ||
      !["week", "long"].includes(g.horizon) ||
      !date.test(g.week)
    )
      throw new Error("Ett mål är ogiltigt.");
  for (const t of d.tasks)
    if (
      typeof t.id !== "string" ||
      typeof t.title !== "string" ||
      typeof t.done !== "boolean" ||
      !d.goals.some((g: { id: string }) => g.id === t.goalId)
    )
      throw new Error("En uppgift är ogiltig.");
  for (const r of d.recurring)
    if (
      r.external !== undefined ||
      typeof r.id !== "string" ||
      typeof r.title !== "string" ||
      !ids.has(r.categoryId) ||
      !Array.isArray(r.weekdays) ||
      !r.weekdays.every(
        (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 6,
      ) ||
      !date.test(r.startsOn) ||
      !Number.isFinite(r.start) ||
      !Number.isFinite(r.end) ||
      r.start >= r.end
    )
      throw new Error("En återkommande aktivitet är ogiltig.");
  for (const r of Object.values(d.reflections) as Record<string, unknown>[])
    if (
      !r ||
      !["week", "good", "unfinished", "balance", "next", "updatedAt"].every(
        (k) => typeof r[k] === "string",
      ) ||
      ["startPlan", "goalReview"].some(
        (k) => r[k] !== undefined && typeof r[k] !== "string",
      )
    )
      throw new Error("En reflektion är ogiltig.");
  if (d.icalCalendar !== undefined) {
    const feed = d.icalCalendar;
    if (
      !feed ||
      typeof feed !== "object" ||
      Array.isArray(feed) ||
      typeof feed.calendarId !== "string" ||
      !feed.calendarId ||
      feed.calendarId.length > 500 ||
      typeof feed.autoRefresh !== "boolean" ||
      Object.keys(feed).some(
        (key) => !["calendarId", "autoRefresh"].includes(key),
      )
    )
      throw new Error("iCal-kalenderns inställningar är ogiltiga.");
  }
  if (d.googleCalendar !== undefined) {
    const g = d.googleCalendar;
    if (
      !g ||
      !Array.isArray(g.calendarIds) ||
      g.calendarIds.length > 20 ||
      !g.calendarIds.every(
        (id: unknown) => typeof id === "string" && id.length > 0,
      ) ||
      typeof g.lastImportedWeek !== "string" ||
      !isLocalDate(g.lastImportedWeek) ||
      typeof g.lastImportedAt !== "string" ||
      !Number.isFinite(Date.parse(g.lastImportedAt)) ||
      (g.eventCategories !== undefined &&
        (!g.eventCategories ||
          typeof g.eventCategories !== "object" ||
          Array.isArray(g.eventCategories) ||
          !Object.entries(g.eventCategories).every(
            ([key, categoryId]) =>
              isGoogleEventKey(key) &&
              typeof categoryId === "string" &&
              ids.has(categoryId),
          ))) ||
      (g.eventCategorySources !== undefined &&
        (!g.eventCategorySources ||
          typeof g.eventCategorySources !== "object" ||
          Array.isArray(g.eventCategorySources) ||
          !Object.entries(g.eventCategorySources).every(
            ([key, source]) =>
              isGoogleEventKey(key) &&
              ["manual", "rule"].includes(String(source)),
          )))
    )
      throw new Error("Google-kalenderns importinställningar är ogiltiga.");
  }
  validateCareerData(d as AppData);
  return separateJobCategories(refreshDemoCopy(d as AppData));
}
export function loadLocal(
  storage: StorageLike,
  key = STORAGE_KEY,
): AppData | null {
  const raw = storage.getItem(key);
  return raw ? decodeData(raw) : null;
}
export function saveLocal(
  storage: StorageLike,
  data: AppData,
  key = STORAGE_KEY,
) {
  storage.setItem(key, JSON.stringify(data));
}
export function downloadData(data: AppData) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `veckoverket-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
