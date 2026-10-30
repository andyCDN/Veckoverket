import type { Activity, AppData, ApplicationInterview } from "./types";
import { addDays, planningBoundary, uid } from "./date";
import { isLocalDate } from "./google-time";
import {
  bookCareerActivity,
  planDeadline,
  type PlanningPreview,
} from "./career-planning";
import { recordApplicationEvent, saveApplication } from "./applications";
export type InterviewBooking = {
  title: string;
  date: string;
  start: number;
  minutes: number;
  preparationMinutes: number;
  location: string;
  preparationNotes: string;
  contactId?: string;
};
export type InterviewNotesInput = {
  preparationNotes: string;
  outcomeNotes: string;
  nextAction: string;
  followUpDate: string;
  feedbackNotes?: string;
  preparationChecklist?: ApplicationInterview["preparationChecklist"];
  nextActionOwner?: string;
  nextActionReason?: string;
};
export function interviewActivity(data: AppData, id?: string) {
  if (!id) return;
  for (const [week, plan] of Object.entries(data.weeks)) {
    const activity = plan.activities.find((a) => a.id === id);
    if (activity) return { week, activity };
  }
}
export function scheduleApplicationInterview(
  data: AppData,
  applicationId: string,
  input: InterviewBooking,
  now = new Date(),
): PlanningPreview {
  const fail = (message: string): PlanningPreview => ({
    data,
    activities: [],
    errors: [message],
  });
  const app = data.applications?.find((a) => a.id === applicationId),
    boundary = planningBoundary(now);
  if (!app) return fail("Ansökan finns inte kvar.");
  if (
    !input.title.trim() ||
    input.title.length > 200 ||
    !isLocalDate(input.date) ||
    input.date < boundary.date ||
    input.date > addDays(boundary.date, 366) ||
    !Number.isInteger(input.start) ||
    input.start < 0 ||
    input.start > 1439 ||
    (input.date === boundary.date && input.start < boundary.minute) ||
    !Number.isInteger(input.minutes) ||
    input.minutes < 5 ||
    input.minutes > 480 ||
    input.start + input.minutes > 1440 ||
    !Number.isInteger(input.preparationMinutes) ||
    (input.preparationMinutes !== 0 &&
      (input.preparationMinutes < 5 || input.preparationMinutes > 480)) ||
    input.location.length > 1000 ||
    input.preparationNotes.length > 4000
  )
    return fail(
      "Kontrollera titel, datum och passlängder. Intervjun behöver ligga inom ett år och i framtiden.",
    );
  if (
    input.contactId &&
    (!app.contactIds?.includes(input.contactId) ||
      !data.contacts?.some((c) => c.id === input.contactId))
  )
    return fail("Välj en av ansökans kopplade kontakter.");
  const categoryId =
    data.categories.find((c) => c.id === "career")?.id ??
    data.categories.find((c) => c.movable && c.id !== "google-calendar")?.id;
  if (!categoryId)
    return fail("Välj först ett livsområde för jobbsök i inställningarna.");
  const id = uid();
  const meeting: Activity = {
    id: uid(),
    title: input.title.trim(),
    description: input.location,
    date: input.date,
    start: input.start,
    end: input.start + input.minutes,
    estimatedMinutes: input.minutes,
    blockType: "locked",
    priority: 5,
    categoryId,
    source: "manual",
    status: "planned",
    applicationId,
  };
  const booking = bookCareerActivity(data, meeting);
  if (booking.errors.length) return booking;
  let next = booking.data;
  const activities = [meeting];
  let preparationActivityId: string | undefined;
  if (input.preparationMinutes > 0) {
    const prepared = planDeadline(
      next,
      {
        id: `interview-${id}`,
        title: input.title,
        date: input.date,
        minute: input.start,
        categoryId,
        applicationId,
        steps: [
          {
            id: "preparation",
            title: "Förberedelse",
            minutes: input.preparationMinutes,
          },
        ],
      },
      boundary,
    );
    if (prepared.errors.length)
      return fail(
        `Förberedelsen ryms inte före intervjun. ${prepared.errors[0]}`,
      );
    const original = prepared.activities[0];
    const { deadlineId: _deadline, deadlineStepId: _step, ...rest } = original;
    const preparation: Activity = {
      ...rest,
      blockType: "protected",
      description: input.preparationNotes,
    };
    preparationActivityId = preparation.id;
    next = {
      ...prepared.data,
      weeks: Object.fromEntries(
        Object.entries(prepared.data.weeks).map(([week, plan]) => [
          week,
          plan.activities.some((a) => a.id === original.id)
            ? {
                ...plan,
                activities: plan.activities.map((a) =>
                  a.id === original.id ? preparation : a,
                ),
              }
            : plan,
        ]),
      ),
    };
    activities.unshift(preparation);
  }
  const interview: ApplicationInterview = {
    id,
    title: meeting.title,
    date: input.date,
    start: meeting.start,
    end: meeting.end,
    location: input.location,
    contactId: input.contactId,
    meetingActivityId: meeting.id,
    preparationActivityId,
    preparationNotes: input.preparationNotes,
    outcomeNotes: "",
  };
  const updated = recordApplicationEvent(
    saveApplication(
      app,
      {
        ...app,
        status: "interview",
        interviews: [...(app.interviews ?? []), interview],
      },
      now,
    ),
    "interview",
    `Intervju bokad: ${meeting.title} · ${input.date}.`,
    now,
  );
  return {
    data: {
      ...next,
      applications: next.applications!.map((a) =>
        a.id === applicationId ? updated : a,
      ),
    },
    activities,
    errors: [],
  };
}
export function saveInterviewNotes(
  data: AppData,
  applicationId: string,
  interviewId: string,
  input: InterviewNotesInput,
  complete = false,
  now = new Date(),
): AppData {
  const app = data.applications?.find((a) => a.id === applicationId),
    interview = app?.interviews?.find((i) => i.id === interviewId);
  if (!app || !interview) throw new Error("Intervjun finns inte kvar.");
  if (
    [input.preparationNotes, input.outcomeNotes, input.nextAction].some(
      (s) => s.length > 4000,
    ) ||
    (input.feedbackNotes !== undefined && input.feedbackNotes.length > 4000) ||
    (input.nextActionReason !== undefined &&
      input.nextActionReason.length > 4000) ||
    (input.nextActionOwner !== undefined &&
      input.nextActionOwner.length > 200) ||
    (input.preparationChecklist !== undefined &&
      (input.preparationChecklist.length > 30 ||
        new Set(input.preparationChecklist.map((i) => i.id)).size !==
          input.preparationChecklist.length ||
        input.preparationChecklist.some(
          (i) =>
            !i.id.trim() ||
            i.id.length > 200 ||
            !i.title.trim() ||
            i.title.length > 200 ||
            typeof i.done !== "boolean",
        ))) ||
    (input.followUpDate !== "" && !isLocalDate(input.followUpDate))
  )
    throw new Error("Kontrollera anteckningar och uppföljningsdatum.");
  const meeting = interviewActivity(data, interview.meetingActivityId);
  if (complete && (!meeting || meeting.activity.status === "skipped"))
    throw new Error(
      "Kalenderpasset saknas eller är markerat som Blev inte av. Kontrollera intervjun i kalendern först.",
    );
  const completedAt = complete
    ? (interview.completedAt ?? now.toISOString())
    : interview.completedAt;
  const updatedInterview = {
    ...interview,
    preparationNotes: input.preparationNotes,
    outcomeNotes: input.outcomeNotes,
    ...(input.feedbackNotes !== undefined
      ? { feedbackNotes: input.feedbackNotes }
      : {}),
    ...(input.preparationChecklist !== undefined
      ? { preparationChecklist: input.preparationChecklist }
      : {}),
    ...(completedAt ? { completedAt } : {}),
  };
  if (
    JSON.stringify(updatedInterview) === JSON.stringify(interview) &&
    app.nextAction === input.nextAction &&
    app.followUpDate === input.followUpDate &&
    (input.nextActionOwner === undefined ||
      app.nextActionOwner === input.nextActionOwner) &&
    (input.nextActionReason === undefined ||
      app.nextActionReason === input.nextActionReason) &&
    (!complete || meeting?.activity.status === "done")
  )
    return data;
  const notes =
    complete && !interview.completedAt
      ? `Intervju genomförd: ${interview.title}`
      : `Intervjuanteckningar uppdaterade: ${interview.title}`;
  const updated = recordApplicationEvent(
    saveApplication(
      app,
      {
        ...app,
        nextAction: input.nextAction,
        followUpDate: input.followUpDate,
        ...(input.nextActionOwner !== undefined
          ? { nextActionOwner: input.nextActionOwner }
          : {}),
        ...(input.nextActionReason !== undefined
          ? { nextActionReason: input.nextActionReason }
          : {}),
        interviews: app.interviews!.map((i) =>
          i.id === interviewId ? updatedInterview : i,
        ),
      },
      now,
    ),
    "interview",
    `${notes}${input.outcomeNotes ? `\n${input.outcomeNotes}` : ""}`,
    now,
  );
  const withFeedback =
    input.feedbackNotes !== undefined &&
    input.feedbackNotes !== (interview.feedbackNotes ?? "") &&
    input.feedbackNotes.trim()
      ? recordApplicationEvent(updated, "feedback", input.feedbackNotes, now)
      : updated;
  const weeks =
    complete && meeting && meeting.activity.status !== "done"
      ? {
          ...data.weeks,
          [meeting.week]: {
            ...data.weeks[meeting.week],
            activities: data.weeks[meeting.week].activities.map((a) =>
              a.id === meeting.activity.id
                ? { ...a, status: "done" as const }
                : a,
            ),
          },
        }
      : data.weeks;
  return {
    ...data,
    weeks,
    applications: data.applications!.map((a) =>
      a.id === applicationId ? withFeedback : a,
    ),
  };
}
