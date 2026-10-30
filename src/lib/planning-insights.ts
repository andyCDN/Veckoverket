import type { Activity, AppData } from "./types";
import { monday } from "./date";
export function trackedActionId(
  kind: "application" | "contact",
  item: { id: string; nextActionId?: string },
) {
  if (item.nextActionId) return item.nextActionId;
  const plain = `${kind}:${item.id}`;
  if (plain.length <= 200) return plain;
  let hash = 2166136261;
  for (const c of plain) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `${plain.slice(0, 180)}:${(hash >>> 0).toString(16)}`;
}

export function activityDeadline(data: AppData, a: Activity) {
  const explicit = data.deadlines?.find((d) => d.id === a.deadlineId);
  if (explicit)
    return {
      date: explicit.date,
      minute: explicit.minute,
      label: explicit.title,
    };
  if (a.deadlineId) {
    const app = data.applications?.find((v) => v.id === a.applicationId);
    if (app?.deadline)
      return {
        date: app.deadline,
        minute: (data.weeks[monday(app.deadline)]?.rules ?? data.settings).end,
        label: `${app.role} · ${app.organization}`,
      };
  }
  if (a.careerActionId) {
    const action = data.careerActions?.find((v) => v.id === a.careerActionId);
    const legacy =
      data.applications?.find(
        (v) => trackedActionId("application", v) === a.careerActionId,
      ) ??
      data.contacts?.find(
        (v) => trackedActionId("contact", v) === a.careerActionId,
      );
    const date = action?.date || legacy?.followUpDate;
    if (date)
      return {
        date,
        minute: (data.weeks[monday(date)]?.rules ?? data.settings).end,
        label: "Uppföljning",
      };
  }
}
export function planningLimitError(
  data: AppData,
  a: Activity,
  others: Activity[],
) {
  const due = activityDeadline(data, a);
  if (due && (a.date > due.date || (a.date === due.date && a.end > due.minute)))
    return "Passet skulle sluta efter deadline eller uppföljningsdatum.";
  const deadline = data.deadlines?.find((d) => d.id === a.deadlineId);
  if (deadline && a.deadlineStepId) {
    const index = deadline.steps.findIndex((s) => s.id === a.deadlineStepId);
    for (const other of others.filter(
      (v) =>
        v.id !== a.id &&
        v.deadlineId === a.deadlineId &&
        v.status !== "skipped",
    )) {
      const otherIndex = deadline.steps.findIndex(
        (s) => s.id === other.deadlineStepId,
      );
      if (index < 0 || otherIndex < 0 || index === otherIndex) continue;
      const before = index < otherIndex ? a : other,
        after = index < otherIndex ? other : a;
      if (
        before.date > after.date ||
        (before.date === after.date && before.end > after.start)
      )
        return "Delstegen måste ligga i sin utförandeordning.";
    }
  }
  return undefined;
}
export function jobShare(activities: Activity[]) {
  const active = activities.filter(
    (a) =>
      a.status !== "skipped" &&
      !a.external?.allDay &&
      a.external?.busy !== false,
  );
  const career = active
      .filter((a) => a.categoryId === "career")
      .reduce((n, a) => n + a.end - a.start, 0),
    networking = active
      .filter((a) => a.categoryId === "networking")
      .reduce((n, a) => n + a.end - a.start, 0);
  return {
    career,
    networking,
    percent:
      career + networking
        ? Math.round((100 * career) / (career + networking))
        : null,
  };
}
