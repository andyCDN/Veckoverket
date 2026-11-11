import type { AppData, DailyCheckIn } from "./types";
import { today } from "./date";
import { isLocalDate } from "./google-time";

export const CHECK_IN_MOODS = {
  heavy: "Tungt",
  okay: "Okej",
  good: "Bra",
} as const;
export const CHECK_IN_CUES = {
  now: "Nu",
  "after-break": "Efter nästa paus",
  "after-booking": "Efter nästa bokade pass",
} as const;
export const RECOVERY_FOCUS: DailyCheckIn["focus"] = {
  kind: "recovery",
  id: "recovery",
  title: "Ta en paus utan krav",
};

export function checkInPlan(checkIn: DailyCheckIn) {
  const cue =
    checkIn.cue === "now"
      ? "Nu"
      : checkIn.cue === "after-break"
        ? "Efter nästa paus"
        : `Efter ${checkIn.cueTitle ?? "nästa bokade pass"}`;
  return checkIn.focus.kind === "recovery"
    ? `${cue}: fem minuters paus utan krav.`
    : `${cue}: fem minuter med ”${checkIn.focus.title}”.`;
}

export function validateDailyCheckIns(
  value: unknown,
): asserts value is Record<string, DailyCheckIn> | undefined {
  if (value === undefined) return;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 10000
  )
    throw new Error("Dagsincheckningarna är ogiltiga.");
  const text = (v: unknown, max: number): v is string =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max;
  for (const [date, raw] of Object.entries(value)) {
    const v = raw as DailyCheckIn;
    if (
      !isLocalDate(date) ||
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      !Object.hasOwn(CHECK_IN_MOODS, v.mood) ||
      !Object.hasOwn(CHECK_IN_CUES, v.cue) ||
      !v.focus ||
      !["task", "activity", "recovery"].includes(v.focus.kind) ||
      !text(v.focus.id, 200) ||
      !text(v.focus.title, 4000) ||
      (v.cueTitle !== undefined && !text(v.cueTitle, 4000)) ||
      (v.cue === "after-booking" && !text(v.cueTitle, 4000)) ||
      !text(v.updatedAt, 50) ||
      !Number.isFinite(Date.parse(v.updatedAt))
    )
      throw new Error("En dagsincheckning är ogiltig.");
  }
}

export function saveDailyCheckIn(
  data: AppData,
  date: string,
  value: DailyCheckIn,
  currentDate = today(),
): AppData {
  if (date !== currentDate)
    throw new Error("Dagen har ändrats. Öppna dagens incheckning igen.");
  validateDailyCheckIns({ [date]: value });
  if (
    value.focus.kind === "task" &&
    !data.tasks.some(
      (task) =>
        task.id === value.focus.id &&
        !task.done &&
        !["waiting", "dropped"].includes(task.state ?? ""),
    )
  )
    throw new Error("Uppgiften är inte längre aktuell. Välj ett annat steg.");
  if (
    value.focus.kind === "activity" &&
    !Object.values(data.weeks).some((week) =>
      week.activities.some(
        (activity) =>
          activity.id === value.focus.id &&
          activity.date === date &&
          activity.status === "planned",
      ),
    )
  )
    throw new Error("Passet är inte längre aktuellt. Välj ett annat steg.");
  return {
    ...data,
    dailyCheckIns: { ...data.dailyCheckIns, [date]: structuredClone(value) },
  };
}

export function removeDailyCheckIn(data: AppData, date: string): AppData {
  if (!data.dailyCheckIns?.[date]) return data;
  const dailyCheckIns = { ...data.dailyCheckIns };
  delete dailyCheckIns[date];
  return { ...data, dailyCheckIns };
}
