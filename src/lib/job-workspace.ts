import type { AppData, JobApplication } from "./types";
import { planningBoundary } from "./date";
import { careerActions, type TrackedAction } from "./career-actions";
import { interviewActivity } from "./application-interviews";
import { isClosedApplication } from "./application-overview";
import { saveApplication, completeApplicationAction } from "./applications";
import { isLocalDate } from "./google-time";

export type JobLane = "todo" | "waiting" | "closed";
export const JOB_LANES: Record<JobLane, string> = {
  todo: "Att göra",
  waiting: "Väntar på svar",
  closed: "Avslutade",
};
export function jobWorkspace(data: AppData, boundary = planningBoundary()) {
  const actions = careerActions(data).filter((a) => a.status === "open");
  return (data.applications ?? [])
    .map((application) => {
      const steps = actions.filter((a) => a.applicationId === application.id);
      const actionable = (step: TrackedAction) =>
        step.kind !== "waiting" ||
        Boolean(step.date && step.date <= boundary.date);
      const step = [...steps].sort(
        (a, b) =>
          Number(!actionable(a)) - Number(!actionable(b)) ||
          (a.date || "9999").localeCompare(b.date || "9999"),
      )[0];
      const interviews = (application.interviews ?? [])
        .map((interview) => {
          const meeting = interviewActivity(
            data,
            interview.meetingActivityId,
          )?.activity;
          const preparation = interviewActivity(
            data,
            interview.preparationActivityId,
          )?.activity;
          return {
            interview,
            meeting,
            preparation,
            date: meeting?.date ?? interview.date,
            end: meeting?.end ?? interview.end,
            upcoming:
              meeting?.status !== "done" &&
              meeting?.status !== "skipped" &&
              ((meeting?.date ?? interview.date) > boundary.date ||
                ((meeting?.date ?? interview.date) === boundary.date &&
                  (meeting?.end ?? interview.end) > boundary.minute)),
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
      const interview = interviews.find((i) => i.upcoming) ?? interviews.at(-1);
      const lane: JobLane = isClosedApplication(application)
        ? "closed"
        : steps.some(actionable) ||
            (application.status === "draft" &&
              application.deadline &&
              application.deadline <= boundary.date)
          ? "todo"
          : steps.length || application.status === "sent"
            ? "waiting"
            : "todo";
      const dates = [
        step?.date,
        application.status === "draft" ? application.deadline : "",
        application.status === "interview" && interview?.upcoming
          ? (interview?.preparation?.date ?? interview?.date)
          : "",
      ]
        .filter((d): d is string => Boolean(d))
        .sort();
      const date =
        lane === "closed"
          ? ([...(application.history ?? [])]
              .filter(
                (e) =>
                  e.kind === "status" &&
                  (e.status === "closed" || e.status === "rejected"),
              )
              .map((e) => e.date)
              .sort()
              .at(-1) ?? "")
          : (dates[0] ?? "");
      const next =
        lane === "closed"
          ? "Processen är avslutad"
          : step?.title ||
            (application.status === "draft"
              ? "Förbered ansökan"
              : application.status === "interview"
                ? interview
                  ? interview.upcoming
                    ? "Förbered intervju"
                    : "Följ upp intervjun"
                  : "Boka intervju"
                : application.status === "offer"
                  ? "Gå igenom erbjudandet"
                  : "Invänta svar från arbetsgivaren");
      const primary =
        lane === "closed" || lane === "waiting"
          ? "Visa ansökan"
          : step?.kind === "waiting"
            ? "Följ upp"
            : step &&
                !/^(förbered (?:ansökan|nästa intervju)|(?:skapa|anpassa).*cv|skriv.*(?:ansökan|brev)|läs annonsen|bedöm jobbet|gå igenom erbjudandet)/iu.test(
                  step.title,
                )
              ? "Gör nästa steg"
              : application.status === "interview"
                ? interview
                  ? interview.upcoming
                    ? "Förbered intervju"
                    : "Följ upp intervjun"
                  : "Boka intervju"
                : application.status === "offer"
                  ? "Gå igenom erbjudandet"
                  : application.status === "draft"
                    ? !application.advertisement?.text &&
                      !application.advertisement?.url
                      ? "Förbered ansökan"
                      : application.materials?.some((m) => m.kind === "cv")
                        ? "Fortsätt ansökan"
                        : "Fortsätt med CV"
                    : "Gör nästa steg";
      return { application, lane, step, steps, interview, date, next, primary };
    })
    .sort(
      (a, b) =>
        (a.date || "9999").localeCompare(b.date || "9999") ||
        a.application.organization.localeCompare(
          b.application.organization,
          "sv-SE",
        ) ||
        a.application.role.localeCompare(b.application.role, "sv-SE"),
    );
}
export type JobRow = ReturnType<typeof jobWorkspace>[number];

export function markApplicationSent(
  data: AppData,
  id: string,
  followUpDate: string,
  now = new Date(),
): AppData {
  const previous = data.applications?.find((a) => a.id === id);
  if (!previous || previous.status !== "draft")
    throw new Error("Ansökan är inte längre ett utkast. Öppna jobbet igen.");
  if (
    followUpDate &&
    (!isLocalDate(followUpDate) || followUpDate < planningBoundary(now).date)
  )
    throw new Error(
      "Välj ett uppföljningsdatum från idag eller lämna datumet tomt.",
    );
  const prepared = completeApplicationAction(previous, now);
  const updated = saveApplication(
    prepared,
    {
      ...prepared,
      status: "sent",
      nextAction: followUpDate ? "Invänta svar från arbetsgivaren" : "",
      followUpDate,
      nextActionKind: followUpDate ? "waiting" : undefined,
      nextActionOwner: followUpDate ? previous.organization : undefined,
      nextActionReason: followUpDate
        ? "Ansökan är skickad. Bevaka arbetsgivarens svar från det valda datumet."
        : undefined,
    },
    now,
  );
  return {
    ...data,
    applications: data.applications!.map((a) => (a.id === id ? updated : a)),
  };
}
