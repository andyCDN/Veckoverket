import type { Activity, AppData, NetworkContact } from "./types";
import { careerActions, type TrackedAction } from "./career-actions";
import { actionNeedsAttention } from "./action-workflow";
import { planningBoundary, today, uid } from "./date";

export function networkGroups(data: AppData, boundary = planningBoundary()) {
  const actions = careerActions(data).filter((a) => a.status === "open");
  const groups = [
    {
      id: "followup",
      title: "Att följa upp",
      contacts: [] as { contact: NetworkContact; step?: TrackedAction }[],
    },
    {
      id: "waiting",
      title: "Väntar på svar",
      contacts: [] as { contact: NetworkContact; step?: TrackedAction }[],
    },
    {
      id: "other",
      title: "Övriga kontakter",
      contacts: [] as { contact: NetworkContact; step?: TrackedAction }[],
    },
  ];
  for (const contact of data.contacts ?? []) {
    const steps = actions
      .filter((a) => a.contactId === contact.id)
      .sort(
        (a, b) =>
          Number(!actionNeedsAttention(data, a, boundary)) -
            Number(!actionNeedsAttention(data, b, boundary)) ||
          (a.date || "9999").localeCompare(b.date || "9999") ||
          Number(!a.legacy) - Number(!b.legacy),
      );
    const step = steps[0];
    const index = !step
      ? 2
      : step.kind === "waiting" && step.date && step.date > boundary.date
        ? 1
        : 0;
    groups[index].contacts.push({ contact, step });
  }
  for (const group of groups)
    group.contacts.sort(
      (a, b) =>
        (a.step?.date || "9999").localeCompare(b.step?.date || "9999") ||
        a.contact.name.localeCompare(b.contact.name, "sv-SE"),
    );
  return groups.filter((group) => group.contacts.length);
}

export function contactTimeline(data: AppData, contact: NetworkContact) {
  const actions = (data.careerActions ?? []).filter(
    (a) => a.contactId === contact.id,
  );
  const actionIds = new Set(actions.map((a) => a.id));
  const entries: {
    id: string;
    date: string;
    title: string;
    notes: string;
    activity?: Activity;
  }[] = [...contact.entries].reverse().map((e) => ({
    ...e,
    id: `log:${e.id}`,
    title: e.channel || "Anteckning",
  }));
  for (const action of actions)
    for (const update of [...(action.updates ?? [])].reverse())
      entries.push({
        id: `action:${action.id}:${update.id}`,
        date: update.date,
        title: `${update.kind === "fulfilled" ? "Överenskommelse uppfylld" : update.kind === "changed" ? "Ändrad överenskommelse" : "Överenskommelse"}: ${action.title}`,
        notes: update.note,
      });
  for (const plan of Object.values(data.weeks))
    for (const activity of plan.activities) {
      if (
        activity.contactId === contact.id ||
        (activity.careerActionId && actionIds.has(activity.careerActionId))
      )
        entries.push({
          id: `pass:${activity.date}:${activity.id}`,
          date: `${activity.date}T${String(Math.floor(activity.start / 60)).padStart(2, "0")}:${String(activity.start % 60).padStart(2, "0")}`,
          title: activity.title,
          notes:
            activity.status === "done"
              ? "Genomfört kalenderpass"
              : activity.status === "skipped"
                ? "Kalenderpass som inte blev av"
                : "Bokat kalenderpass",
          activity,
        });
    }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export type ContactLogInput = {
  date: string;
  channel: string;
  notes: string;
  next?: {
    title: string;
    date: string;
    kind: "task" | "waiting";
    owner: string;
  };
};
export function logContact(
  data: AppData,
  contactId: string,
  input: ContactLogInput,
): AppData {
  const contact = data.contacts?.find((c) => c.id === contactId);
  if (!contact) return data;
  const next = input.next;
  const notes = [
    input.notes.trim(),
    next
      ? `${next.kind === "waiting" ? "Överenskommelse – väntar på" : "Nästa steg"}: ${next.title.trim()}${next.owner.trim() ? ` · ${next.owner.trim()}` : ""}${next.date ? ` · ${next.date}` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (notes.length > 4000)
    throw new Error(
      "Anteckningen och nästa steget är för långa tillsammans. Korta texten innan du sparar.",
    );
  return {
    ...data,
    contacts: data.contacts!.map((c) =>
      c.id !== contactId
        ? c
        : {
            ...c,
            entries: [
              ...c.entries,
              {
                id: uid(),
                date: input.date || today(),
                channel: input.channel,
                notes,
              },
            ],
            ...(next
              ? {
                  nextAction: next.title.trim(),
                  followUpDate: next.date,
                  nextActionKind: next.kind,
                  nextActionOwner: next.owner.trim(),
                  nextActionId: c.nextAction.trim()
                    ? (c.nextActionId ?? uid())
                    : uid(),
                }
              : {}),
          },
    ),
  };
}
