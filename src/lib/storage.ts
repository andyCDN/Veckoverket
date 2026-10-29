import type { AppData } from "./types";
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
      s.trainingMinutes <= 0
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
        !["planned", "done", "skipped"].includes(String(a.status))
      )
        throw new Error("En aktivitet är ogiltig.");
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
      )
    )
      throw new Error("En reflektion är ogiltig.");
  return d as AppData;
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
