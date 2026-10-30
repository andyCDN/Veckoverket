import type { AppData } from "./types";
import type { RecordingSession } from "../../supabase/functions/_shared/recording-schema";
import { planningBoundary } from "./date";
export function saveReviewedRecording(
  data: AppData,
  session: RecordingSession,
  text: string,
  now = new Date(),
): AppData {
  if (session.state !== "complete")
    throw new Error(
      "Sammanfatta inspelningen innan du sparar den i historiken.",
    );
  const notes = text.trim(),
    { applicationId, contactId, interviewId } = session.context;
  if (!notes || notes.length > 4000)
    throw new Error("Sammanfattningen behöver innehålla 1–4000 tecken.");
  if (!applicationId && !contactId)
    throw new Error("Välj en ansökan eller kontakt.");
  const app = applicationId
      ? data.applications?.find((a) => a.id === applicationId)
      : undefined,
    contact = contactId
      ? data.contacts?.find((c) => c.id === contactId)
      : undefined;
  if (
    (applicationId && !app) ||
    (contactId && !contact) ||
    (interviewId && !app?.interviews?.some((i) => i.id === interviewId))
  )
    throw new Error(
      "Den kopplade ansökan, intervjun eller kontakten finns inte kvar. Kopiera texten manuellt till rätt post.",
    );
  const id = `recording-${session.id}`,
    date = planningBoundary(new Date(session.startedAt)).date;
  const appDone = !app || app.history?.some((e) => e.id === id),
    contactDone = !contact || contact.entries.some((e) => e.id === id);
  if (appDone && contactDone) return data;
  return {
    ...data,
    applications:
      app && !appDone
        ? data.applications!.map((a) =>
            a.id === app.id
              ? {
                  ...a,
                  contactIds: contact
                    ? [...new Set([...(a.contactIds ?? []), contact.id])]
                    : a.contactIds,
                  history: [
                    ...(a.history ?? []),
                    {
                      id,
                      date,
                      recordedAt: now.toISOString(),
                      kind: "note" as const,
                      notes: `Samtal: ${session.title}\n${notes}`,
                    },
                  ],
                }
              : a,
          )
        : data.applications,
    contacts:
      contact && !contactDone
        ? data.contacts!.map((c) =>
            c.id === contact.id
              ? {
                  ...c,
                  entries: [
                    ...c.entries,
                    {
                      id,
                      date,
                      channel: `Samtal: ${session.title}`.slice(0, 200),
                      notes,
                    },
                  ],
                }
              : c,
          )
        : data.contacts,
  };
}
