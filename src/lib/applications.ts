import type { ApplicationHistoryEntry, JobApplication } from "./types";
import { addDays, today, uid } from "./date";
export const APPLICATION_STATUSES = {
  draft: "Utkast",
  sent: "Skickad",
  interview: "Intervju",
  offer: "Erbjudande",
  rejected: "Avslag",
  closed: "Avslutad",
} as const;
export const ACTION_PERIODS = {
  all: "Alla datum",
  overdue: "Passerat datum",
  today: "Idag",
  week: "Kommande sju dagar",
  undated: "Utan datum",
} as const;
export type ActionPeriod = keyof typeof ACTION_PERIODS;
export function matchesActionPeriod(
  a: JobApplication,
  period: ActionPeriod,
  date = today(),
) {
  if (period === "all") return true;
  if (["closed", "rejected"].includes(a.status) || !a.nextAction.trim())
    return false;
  if (period === "undated") return !a.followUpDate;
  if (!a.followUpDate) return false;
  if (period === "overdue") return a.followUpDate < date;
  if (period === "today") return a.followUpDate === date;
  return a.followUpDate > date && a.followUpDate <= addDays(date, 7);
}
function entry(
  kind: ApplicationHistoryEntry["kind"],
  notes: string,
  now: Date,
): ApplicationHistoryEntry {
  return {
    id: uid(),
    kind,
    notes,
    date: todayAt(now),
    recordedAt: now.toISOString(),
  };
}
function todayAt(now: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function saveApplication(
  previous: JobApplication | undefined,
  draft: JobApplication,
  now = new Date(),
): JobApplication {
  const history = [...(previous?.history ?? draft.history ?? [])];
  if (!previous)
    history.push({
      ...entry("created", "Ansökan registrerad.", now),
      status: draft.status,
    });
  else {
    if (previous.status !== draft.status)
      history.push({
        ...entry(
          "status",
          `${APPLICATION_STATUSES[previous.status]} → ${APPLICATION_STATUSES[draft.status]}`,
          now,
        ),
        status: draft.status,
      });
    if (
      previous.nextAction !== draft.nextAction ||
      previous.followUpDate !== draft.followUpDate ||
      (previous.nextActionReason ?? "") !== (draft.nextActionReason ?? "") ||
      (previous.nextActionOwner ?? "Jag") !==
        (draft.nextActionOwner ?? "Jag") ||
      (previous.nextActionKind ?? "task") !== (draft.nextActionKind ?? "task")
    )
      history.push(
        entry(
          "action",
          draft.nextAction.trim()
            ? `Nästa steg: ${draft.nextAction}${draft.followUpDate ? ` · ${draft.followUpDate}` : " · Utan datum"}${draft.nextActionOwner ? ` · Ansvarig: ${draft.nextActionOwner}` : ""}${draft.nextActionReason ? `\n${draft.nextActionReason}` : ""}`.slice(
                0,
                5000,
              )
            : "Nästa steg borttaget.",
          now,
        ),
      );
  }
  return {
    ...draft,
    history,
    nextActionId: draft.nextAction.trim()
      ? previous?.nextAction.trim()
        ? previous.nextActionId
        : (draft.nextActionId ?? uid())
      : undefined,
  };
}
export function completeApplicationAction(
  a: JobApplication,
  now = new Date(),
): JobApplication {
  if (!a.nextAction.trim()) return a;
  return {
    ...a,
    nextAction: "",
    nextActionId: undefined,
    nextActionKind: undefined,
    followUpDate: "",
    history: [
      ...(a.history ?? []),
      entry(
        "action",
        `Genomfört: ${a.nextAction}${a.followUpDate ? ` · Planerat datum ${a.followUpDate}` : ""}`,
        now,
      ),
    ],
  };
}

export function recordApplicationEvent(
  a: JobApplication,
  kind: ApplicationHistoryEntry["kind"],
  notes: string,
  now = new Date(),
): JobApplication {
  return { ...a, history: [...(a.history ?? []), entry(kind, notes, now)] };
}
