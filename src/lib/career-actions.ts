import type { Activity, AppData, CareerAction } from "./types";
import { completeApplicationAction, saveApplication } from "./applications";
import { planningBoundary, uid } from "./date";
import { isLocalDate } from "./google-time";
import { bookCareerActivity } from "./career-planning";
import { trackedActionId } from "./planning-insights";

export type TrackedAction = CareerAction & {
  legacy?: "application" | "contact";
};
export function careerSuggestions(data: AppData): TrackedAction[] {
  const open = careerActions(data).filter((a) => a.status === "open");
  return [
    ...(data.applications ?? [])
      .filter(
        (a) =>
          !["rejected", "closed"].includes(a.status) &&
          !open.some((v) => v.applicationId === a.id),
      )
      .map((a) => ({
        id: trackedActionId("application", a),
        applicationId: a.id,
        legacy: "application" as const,
        status: "open" as const,
        owner: "Jag",
        title:
          a.status === "draft"
            ? "Förbered ansökan"
            : a.status === "interview"
              ? "Förbered nästa intervju"
              : a.status === "offer"
                ? "Gå igenom erbjudandet"
                : "Följ upp ansökan",
        date: a.status === "draft" ? a.deadline : "",
        reason:
          a.status === "draft"
            ? "Ansökan är ett utkast och saknar nästa steg."
            : a.status === "interview"
              ? "Ansökan är i intervjufasen och saknar nästa steg."
              : a.status === "offer"
                ? "Ett erbjudande finns att ta ställning till."
                : "Ansökan är skickad och saknar planerad uppföljning.",
      })),
    ...(data.contacts ?? [])
      .filter((c) => !open.some((v) => v.contactId === c.id))
      .map((c) => ({
        id: trackedActionId("contact", c),
        contactId: c.id,
        legacy: "contact" as const,
        status: "open" as const,
        owner: "Jag",
        title: `Följ upp kontakten med ${c.name}`,
        date: "",
        reason:
          "Kontakten saknar nästa steg. Bestäm innehåll och datum före sparning.",
      })),
  ];
}
export function careerActions(data: AppData): TrackedAction[] {
  return [
    ...(data.careerActions ?? []),
    ...(data.applications ?? [])
      .filter(
        (a) =>
          a.nextAction.trim() && !["closed", "rejected"].includes(a.status),
      )
      .map((a) => ({
        id: trackedActionId("application", a),
        title: a.nextAction,
        date: a.followUpDate,
        owner: a.nextActionOwner ?? "Jag",
        reason: a.nextActionReason ?? "",
        applicationId: a.id,
        status: "open" as const,
        legacy: "application" as const,
      })),
    ...(data.contacts ?? [])
      .filter((c) => c.nextAction.trim())
      .map((c) => ({
        id: trackedActionId("contact", c),
        title: c.nextAction,
        date: c.followUpDate,
        owner: c.nextActionOwner ?? "Jag",
        reason: c.nextActionReason ?? "",
        contactId: c.id,
        status: "open" as const,
        legacy: "contact" as const,
      })),
  ].sort(
    (a, b) =>
      (a.date || "9999").localeCompare(b.date || "9999") ||
      a.title.localeCompare(b.title, "sv"),
  );
}
export function validateCareerAction(a: CareerAction) {
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max;
  if (
    !text(a.id, 200) ||
    !a.id.trim() ||
    !text(a.title, 4000) ||
    !a.title.trim() ||
    !text(a.date, 10) ||
    (a.date !== "" && !isLocalDate(a.date)) ||
    !text(a.owner, 200) ||
    !text(a.reason, 4000) ||
    !["open", "done"].includes(a.status) ||
    (!a.applicationId && !a.contactId) ||
    [a.applicationId, a.contactId, a.interviewId].some(
      (v) => v !== undefined && (!text(v, 200) || !v.trim()),
    )
  )
    throw new Error("Nästa steg har ogiltiga uppgifter.");
  if (
    a.source &&
    (!/^[a-f0-9-]{36}$/i.test(a.source.recordingId) ||
      !text(a.source.evidence, 600) ||
      !a.source.evidence.trim() ||
      !Array.isArray(a.source.segmentIndexes) ||
      !a.source.segmentIndexes.length ||
      a.source.segmentIndexes.length > 3000 ||
      a.source.segmentIndexes.some(
        (i) => !Number.isInteger(i) || i < 0 || i > 100000,
      ))
  )
    throw new Error("Ljudhänvisningen är ogiltig.");
}
export function saveCareerAction(
  data: AppData,
  draft: TrackedAction,
  now = new Date(),
): AppData {
  validateCareerAction(draft);
  const previous = [...careerActions(data), ...careerSuggestions(data)].find(
    (a) => a.id === draft.id,
  );
  if (previous?.status === "done")
    throw new Error("Ett avklarat nästa steg kan inte ändras.");
  if (
    draft.legacy &&
    (!previous ||
      previous.legacy !== draft.legacy ||
      previous.applicationId !== draft.applicationId ||
      previous.contactId !== draft.contactId)
  )
    throw new Error("Nästa steg finns inte kvar.");
  if (
    (draft.applicationId &&
      !data.applications?.some((a) => a.id === draft.applicationId)) ||
    (draft.contactId && !data.contacts?.some((c) => c.id === draft.contactId))
  )
    throw new Error("Den kopplade ansökan eller kontakten finns inte kvar.");
  if (draft.legacy === "application")
    return {
      ...data,
      applications: data.applications!.map((a) =>
        a.id === draft.applicationId
          ? saveApplication(
              a,
              {
                ...a,
                nextAction: draft.title,
                followUpDate: draft.date,
                nextActionReason: draft.reason,
                nextActionOwner: draft.owner,
              },
              now,
            )
          : a,
      ),
    };
  if (draft.legacy === "contact")
    return {
      ...data,
      contacts: data.contacts!.map((c) =>
        c.id === draft.contactId
          ? {
              ...c,
              nextAction: draft.title,
              followUpDate: draft.date,
              nextActionReason: draft.reason,
              nextActionOwner: draft.owner,
              nextActionId: c.nextAction.trim() ? c.nextActionId : uid(),
            }
          : c,
      ),
    };
  const { legacy: _legacy, ...action } = draft;
  return {
    ...data,
    careerActions: [
      ...(data.careerActions ?? []).filter((a) => a.id !== action.id),
      action,
    ],
  };
}
export function completeCareerAction(
  data: AppData,
  id: string,
  now = new Date(),
): AppData {
  const action = careerActions(data).find((a) => a.id === id);
  if (!action || action.status === "done") return data;
  const { legacy: _legacy, ...snapshot } = action;
  const archive = action.legacy
    ? [
        ...(data.careerActions ?? []),
        { ...snapshot, id: uid(), status: "done" as const },
      ]
    : data.careerActions;
  if (action.legacy === "application")
    return {
      ...data,
      careerActions: archive,
      applications: data.applications!.map((a) =>
        a.id === action.applicationId ? completeApplicationAction(a, now) : a,
      ),
    };
  if (action.legacy === "contact")
    return {
      ...data,
      careerActions: archive,
      contacts: data.contacts!.map((c) =>
        c.id === action.contactId
          ? {
              ...c,
              nextAction: "",
              nextActionId: undefined,
              followUpDate: "",
              entries: [
                ...c.entries,
                {
                  id: uid(),
                  date: planningBoundary(now).date,
                  channel: "Nästa steg genomfört",
                  notes: action.title,
                },
              ],
            }
          : c,
      ),
    };
  return {
    ...data,
    careerActions: data.careerActions!.map((a) =>
      a.id === id ? { ...a, status: "done" } : a,
    ),
  };
}
/** A booked action is separate from completion. Calendar outcomes are never inferred. */
export function bookCareerAction(
  data: AppData,
  actionId: string,
  date: string,
  start: number,
  minutes: number,
  now = new Date(),
) {
  const action = careerActions(data).find((a) => a.id === actionId),
    boundary = planningBoundary(now);
  if (
    !action ||
    action.status === "done" ||
    date < boundary.date ||
    (date === boundary.date && start < boundary.minute) ||
    Object.values(data.weeks).some((p) =>
      p.activities.some(
        (a) => a.careerActionId === actionId && a.status === "planned",
      ),
    )
  )
    return {
      data,
      activities: [],
      errors: ["Nästa steg är redan bokat, avklarat eller tiden har passerat."],
    };
  const activity: Activity = {
    id: uid(),
    title: action.title,
    description: [action.reason, `Ansvarig: ${action.owner || "Ej fastställt"}`]
      .filter(Boolean)
      .join("\n"),
    date,
    start,
    end: start + minutes,
    estimatedMinutes: minutes,
    categoryId: action.applicationId ? "career" : "networking",
    status: "planned",
    source: "manual",
    blockType: "flexible",
    priority: 4,
    applicationId: action.applicationId,
    contactId: action.contactId,
    careerActionId: actionId,
  };
  return bookCareerActivity(data, activity);
}
