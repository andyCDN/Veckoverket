import type { Activity, AppData, CareerAction } from "./types";
import { completeApplicationAction, saveApplication } from "./applications";
import { addDays, monday, planningBoundary, uid } from "./date";
import { isLocalDate } from "./google-time";
import { bookCareerActivity } from "./career-planning";
import { trackedActionId } from "./planning-insights";
import { generateWeek } from "./planner";

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
        kind: a.nextActionKind ?? "task",
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
        kind: c.nextActionKind ?? "task",
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
  if (a.kind !== undefined && !["task", "waiting"].includes(a.kind))
    throw new Error("Åtgärdens typ är ogiltig.");
  if (a.updates !== undefined) {
    if (
      !Array.isArray(a.updates) ||
      a.updates.length > 1000 ||
      new Set(a.updates.map((v) => v.id)).size !== a.updates.length
    )
      throw new Error("Åtgärdens historik är ogiltig.");
    for (const u of a.updates)
      if (
        !text(u.id, 200) ||
        !u.id.trim() ||
        !isLocalDate(u.date) ||
        !["fulfilled", "changed", "open"].includes(u.kind) ||
        !text(u.note, 4000) ||
        (u.recordingId !== undefined &&
          !/^[a-f0-9-]{36}$/i.test(u.recordingId)) ||
        (u.previous &&
          (!text(u.previous.title, 4000) ||
            !text(u.previous.owner, 200) ||
            !text(u.previous.reason, 4000) ||
            (u.previous.date !== "" && !isLocalDate(u.previous.date))))
      )
        throw new Error("Åtgärdens historik är ogiltig.");
  }
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
                nextActionKind: draft.kind ?? "task",
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
              nextActionKind: draft.kind ?? "task",
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
              nextActionKind: undefined,
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
  now: Date | { date: string; minute: number } = new Date(),
) {
  const action = careerActions(data).find((a) => a.id === actionId),
    boundary = now instanceof Date ? planningBoundary(now) : now;
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
    title:
      action.kind === "waiting" ? `Följ upp: ${action.title}` : action.title,
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

export function actionBookingSuggestions(
  data: AppData,
  id: string,
  minutes = 30,
  boundary = planningBoundary(),
): { date: string; start: number; end: number }[] {
  const action = careerActions(data).find((a) => a.id === id);
  if (
    !action ||
    action.status !== "open" ||
    !Number.isInteger(minutes) ||
    minutes < 5 ||
    minutes > 480
  )
    return [];
  const first =
    action.kind === "waiting" && action.date > boundary.date
      ? action.date
      : boundary.date;
  const last =
    action.kind !== "waiting" && action.date >= first
      ? action.date
      : addDays(first, 14);
  const suggestions: { date: string; start: number; end: number }[] = [];
  let prepared = data;
  for (
    let date = first;
    date <= last && date <= addDays(first, 31) && suggestions.length < 4;
    date = addDays(date, 1)
  ) {
    const week = monday(date);
    if (!prepared.weeks[week]) {
      const plan = generateWeek(week, prepared).plan;
      prepared = {
        ...prepared,
        weeks: {
          ...prepared.weeks,
          [week]: {
            ...plan,
            activities: plan.activities.filter(
              (a) =>
                a.source !== "generated" ||
                a.blockType !== "flexible" ||
                a.routine,
            ),
          },
        },
      };
    }
    const rules = prepared.weeks[week]?.rules ?? prepared.settings;
    for (
      let start =
        Math.ceil(
          Math.max(rules.start, date === boundary.date ? boundary.minute : 0) /
            5,
        ) * 5;
      start + minutes <= rules.end;
      start += 5
    ) {
      const result = bookCareerAction(
        prepared,
        id,
        date,
        start,
        minutes,
        boundary,
      );
      if (!result.errors.length) {
        suggestions.push({ date, start, end: start + minutes });
        break;
      }
    }
  }
  return suggestions;
}

export function relatedCareerActions(
  data: AppData,
  context: { applicationId?: string; contactId?: string },
  recordingId?: string,
) {
  return careerActions(data).filter(
    (a) =>
      (context.applicationId
        ? a.applicationId === context.applicationId
        : context.contactId
          ? a.contactId === context.contactId
          : false) &&
      (!recordingId || a.source?.recordingId !== recordingId),
  );
}
export function reviewCareerAgreement(
  data: AppData,
  id: string,
  input: {
    kind: "fulfilled" | "changed" | "open";
    note: string;
    recordingId?: string;
    title?: string;
    date?: string;
    owner?: string;
    reason?: string;
  },
  now = new Date(),
): AppData {
  const action = careerActions(data).find((a) => a.id === id);
  if (!action || action.status !== "open")
    throw new Error(
      "Överenskommelsen är redan avslutad eller finns inte kvar.",
    );
  if (
    input.recordingId &&
    action.updates?.some(
      (u) =>
        u.recordingId === input.recordingId &&
        u.kind === input.kind &&
        u.note === input.note,
    )
  )
    return data;
  const update = {
    id: uid(),
    date: planningBoundary(now).date,
    kind: input.kind,
    note: input.note,
    ...(input.recordingId ? { recordingId: input.recordingId } : {}),
    ...(input.kind === "changed"
      ? {
          previous: {
            title: action.title,
            date: action.date,
            owner: action.owner,
            reason: action.reason,
          },
        }
      : {}),
  };
  if (input.kind === "fulfilled") {
    const done = completeCareerAction(data, id, now);
    // Legacy single-step fields are archived with a new ID by completion.
    const target = action.legacy ? done.careerActions!.at(-1)!.id : action.id;
    const next = {
      ...done,
      careerActions: done.careerActions!.map((a) =>
        a.id === target ? { ...a, updates: [...(a.updates ?? []), update] } : a,
      ),
    };
    validateCareerAction(next.careerActions!.find((a) => a.id === target)!);
    return next;
  }
  const patched = {
    ...action,
    ...(input.kind === "changed"
      ? {
          title: input.title ?? action.title,
          date: input.date ?? action.date,
          owner: input.owner ?? action.owner,
          reason: input.reason ?? action.reason,
        }
      : {}),
    updates: [...(action.updates ?? []), update],
  };
  if (action.legacy) {
    const saved = saveCareerAction(data, patched, now);
    // Preserve the conversation trail as a separate action; clear only this legacy field.
    const converted = { ...patched, legacy: undefined };
    const base = {
      ...saved,
      applications: saved.applications?.map((a) =>
        a.id === action.applicationId
          ? {
              ...a,
              nextAction: "",
              followUpDate: "",
              nextActionId: undefined,
              nextActionKind: undefined,
            }
          : a,
      ),
      contacts: saved.contacts?.map((c) =>
        c.id === action.contactId
          ? {
              ...c,
              nextAction: "",
              followUpDate: "",
              nextActionId: undefined,
              nextActionKind: undefined,
            }
          : c,
      ),
    };
    return saveCareerAction(base, converted, now);
  }
  return saveCareerAction(data, patched, now);
}
