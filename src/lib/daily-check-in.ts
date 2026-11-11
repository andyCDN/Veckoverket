import type { AppData, DailyCheckIn, DailyFocus } from "./types";
import { planningBoundary, today } from "./date";
import { isLocalDate } from "./google-time";
import { networkGroups } from "./network-overview";

export const NO_DAILY_FOCUS: DailyFocus = {
  kind: "none",
  id: "none",
  title: "Bara dagens befintliga plan",
};

/** Dates and existing follow-ups determine ordering, never invented job-match scores. */
export function dailyPriorityOptions(data: AppData, date = today()) {
  const applications = (data.applications ?? [])
    .filter((a) => a.status === "draft" && (!a.deadline || a.deadline >= date))
    .sort(
      (a, b) =>
        (a.deadline || "9999").localeCompare(b.deadline || "9999") ||
        a.organization.localeCompare(b.organization, "sv-SE") ||
        a.role.localeCompare(b.role, "sv-SE"),
    );
  const groups = networkGroups(data, { date, minute: 0 });
  const contacts = ["followup", "other", "waiting"].flatMap(
    (id) => groups.find((g) => g.id === id)?.contacts ?? [],
  );
  return { applications, contacts };
}

export function dailyFocusStep(focus: DailyFocus, data?: AppData) {
  switch (focus.kind) {
    case "application": {
      const app = data?.applications?.find((a) => a.id === focus.id);
      return app &&
        !app.advertisement?.text.trim() &&
        !app.advertisement?.url.trim()
        ? "Lägg in annonslänken och välj ett krav du kan svara på."
        : "Läs annonsen och välj ett krav du kan svara på.";
    }
    case "contact":
      return "Läs senaste noteringen och formulera en fråga att skicka.";
    case "none":
      return "Behåll dagens befintliga plan.";
    default:
      return "Börja med första delen av uppgiften. Fem minuter räcker som start.";
  }
}

/** Resolve the original record every time, including status changes after planning. */
export function currentDailyFocus(
  data: AppData,
  value: DailyCheckIn,
  boundary = planningBoundary(),
): DailyFocus | undefined {
  const focus = value.focus;
  if (focus.kind === "application") {
    const app = data.applications?.find((a) => a.id === focus.id);
    return app &&
      app.status === "draft" &&
      (!app.deadline || app.deadline >= boundary.date)
      ? { ...focus, title: `${app.role} · ${app.organization}` }
      : undefined;
  }
  if (focus.kind === "contact") {
    const contact = data.contacts?.find((c) => c.id === focus.id);
    const last = contact?.entries.at(-1);
    if (
      !contact ||
      (last?.date === boundary.date && last.id !== focus.contactEntryId)
    )
      return undefined;
    return {
      ...focus,
      title:
        contact.name +
        (contact.organization ? ` · ${contact.organization}` : ""),
    };
  }
  if (focus.kind === "task") {
    const task = data.tasks.find((t) => t.id === focus.id);
    return task &&
      !task.done &&
      !["waiting", "dropped"].includes(task.state ?? "") &&
      (!task.date || task.date <= boundary.date)
      ? { ...focus, title: task.title }
      : undefined;
  }
  if (focus.kind === "activity") {
    const pass = Object.values(data.weeks)
      .flatMap((w) => w.activities)
      .find(
        (a) =>
          a.id === focus.id &&
          a.date === boundary.date &&
          a.status === "planned" &&
          a.end > boundary.minute,
      );
    return pass ? { ...focus, title: pass.title } : undefined;
  }
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
    throw new Error("Dagsplaneringarna är ogiltiga.");
  const text = (v: unknown, max: number): v is string =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const ids = (v: unknown): v is string[] =>
    Array.isArray(v) &&
    v.length <= 100 &&
    new Set(v).size === v.length &&
    v.every((id) => text(id, 200));
  for (const [date, raw] of Object.entries(value)) {
    const v = raw as DailyCheckIn;
    if (
      !isLocalDate(date) ||
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      !ids(v.applicationIds) ||
      !ids(v.contactIds) ||
      !v.focus ||
      !["application", "contact", "task", "activity", "none"].includes(
        v.focus.kind,
      ) ||
      !text(v.focus.id, 200) ||
      !text(v.focus.title, 4000) ||
      (v.focus.contactEntryId !== undefined &&
        !text(v.focus.contactEntryId, 200)) ||
      (v.focus.kind === "application" &&
        !v.applicationIds.includes(v.focus.id)) ||
      (v.focus.kind === "contact" && !v.contactIds.includes(v.focus.id)) ||
      !text(v.updatedAt, 50) ||
      !Number.isFinite(Date.parse(v.updatedAt))
    )
      throw new Error("En dagsplanering är ogiltig.");
  }
}

export function saveDailyCheckIn(
  data: AppData,
  date: string,
  value: DailyCheckIn,
  currentDate = today(),
): AppData {
  if (date !== currentDate)
    throw new Error("Dagen har ändrats. Öppna dagens planering igen.");
  validateDailyCheckIns({ [date]: value });
  const options = dailyPriorityOptions(data, date);
  if (
    value.applicationIds.some(
      (id) => !options.applications.some((a) => a.id === id),
    )
  )
    throw new Error(
      "Ett valt jobb är inte längre ett aktuellt utkast. Uppdatera dagens val.",
    );
  if (value.contactIds.some((id) => !data.contacts?.some((c) => c.id === id)))
    throw new Error("En vald kontakt finns inte längre. Uppdatera dagens val.");
  const focus =
    value.focus.kind === "none"
      ? NO_DAILY_FOCUS
      : currentDailyFocus(data, value, {
          date,
          minute: date === today() ? planningBoundary().minute : 0,
        });
  if (!focus)
    throw new Error(
      "Första steget är inte längre aktuellt. Välj ett annat steg.",
    );
  const saved: DailyCheckIn = {
    applicationIds: [...value.applicationIds],
    contactIds: [...value.contactIds],
    focus: {
      kind: focus.kind,
      id: focus.id,
      title: focus.title,
      ...(focus.kind === "contact" && focus.contactEntryId
        ? { contactEntryId: focus.contactEntryId }
        : {}),
    },
    updatedAt: new Date().toISOString(),
  };
  // Only planning references are saved. No copied tasks, contacts, statuses or bookings.
  return { ...data, dailyCheckIns: { ...data.dailyCheckIns, [date]: saved } };
}

export function removeDailyCheckIn(data: AppData, date: string): AppData {
  if (!data.dailyCheckIns?.[date]) return data;
  const dailyCheckIns = { ...data.dailyCheckIns };
  delete dailyCheckIns[date];
  return { ...data, dailyCheckIns };
}
