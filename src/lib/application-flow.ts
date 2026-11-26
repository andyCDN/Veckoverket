import type { AppData, JobApplication } from "./types";
import {
  documentUrl,
  validateApplicationMaterials,
} from "./application-materials";
import { recordApplicationEvent } from "./applications";
import { uid, addDays, today, planningBoundary } from "./date";
import { isLocalDate } from "./google-time";
import { saveApplication } from "./applications";

export function applicationStage(job: JobApplication) {
  if (job.status !== "draft") return "waiting" as const;
  if (!job.advertisement?.text.trim()) return "advertisement" as const;
  if (
    !job.preparation?.cvReadyAt &&
    !job.materials?.some((material) => material.kind === "cv")
  )
    return "cv" as const;
  return job.preparation?.applicationOpenedAt
    ? ("send" as const)
    : ("apply" as const);
}
export function suggestedFollowUpDate(date = today()) {
  return addDays(date, 7);
}
export function applicationNextStep(job: JobApplication) {
  const stage = applicationStage(job);
  return stage === "advertisement"
    ? "Komplettera annonsen"
    : stage === "cv"
      ? "Anpassa CV"
      : stage === "apply"
        ? "Öppna ansökningssidan"
        : stage === "send"
          ? "Bekräfta skickad"
          : "Följ upp arbetsgivarens svar";
}
export function updateApplicationFollowUp(
  data: AppData,
  id: string,
  date: string,
  now = new Date(),
): AppData {
  const previous = data.applications?.find((job) => job.id === id);
  if (!previous || previous.status !== "sent")
    throw new Error(
      "Ansökan är inte längre i väntan på svar. Öppna jobbet igen.",
    );
  if (date && (!isLocalDate(date) || date < planningBoundary(now).date))
    throw new Error(
      "Välj ett uppföljningsdatum från idag eller lämna datumet tomt.",
    );
  const waiting =
    previous.nextActionKind === "waiting" || !previous.nextAction.trim();
  const updated = saveApplication(
    previous,
    {
      ...previous,
      followUpDate: date,
      ...(waiting
        ? {
            nextAction: date ? "Invänta svar från arbetsgivaren" : "",
            nextActionKind: date ? ("waiting" as const) : undefined,
            nextActionOwner: date ? previous.organization : undefined,
            nextActionReason: date
              ? "Bevaka arbetsgivarens svar från det valda datumet."
              : undefined,
          }
        : {}),
    },
    now,
  );
  return {
    ...data,
    applications: data.applications!.map((job) =>
      job.id === id ? updated : job,
    ),
  };
}
export function updateApplicationPreparation(
  data: AppData,
  id: string,
  action: "cv-ready" | "application-opened",
  cvUrl = "",
  now = new Date(),
): AppData {
  const previous = data.applications?.find((job) => job.id === id);
  if (!previous || previous.status !== "draft")
    throw new Error("Ansökan är inte längre ett utkast. Öppna jobbet igen.");
  if (cvUrl && !documentUrl(cvUrl))
    throw new Error("Ange en giltig länk till ditt CV.");
  const cv = previous.materials?.find(
    (material) =>
      material.kind === "cv" &&
      documentUrl(material.url) === documentUrl(cvUrl),
  );
  const materials =
    action === "cv-ready" && cvUrl
      ? [
          ...(previous.materials ?? []).filter(
            (material) => material.id !== cv?.id,
          ),
          {
            ...cv,
            id: cv?.id ?? uid(),
            title: cv?.title ?? "Anpassat CV",
            kind: "cv" as const,
            url: documentUrl(cvUrl)!,
            version: cv?.version ?? "",
            sentOn: cv?.sentOn ?? "",
          },
        ]
      : previous.materials;
  const preparation = {
    ...previous.preparation,
    [action === "cv-ready" ? "cvReadyAt" : "applicationOpenedAt"]:
      now.toISOString(),
  };
  const updated = recordApplicationEvent(
    { ...previous, preparation, ...(materials ? { materials } : {}) },
    "note",
    action === "cv-ready"
      ? "Anpassat CV markerat som klart."
      : "Ansökningssidan öppnad. Ansökan är fortfarande ett utkast tills den bekräftas som skickad.",
    now,
  );
  validateApplicationMaterials(updated);
  return {
    ...data,
    applications: data.applications!.map((job) =>
      job.id === id ? updated : job,
    ),
  };
}
