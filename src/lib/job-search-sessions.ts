import type { Activity, AppData } from "./types";
import { planningBoundary } from "./date";
export type JobSessionRef = { week: string; activityId: string };
export function isJobSearchSession(activity: Activity) {
  return (
    activity.categoryId === "career" &&
    !activity.routine &&
    !activity.external &&
    !activity.applicationId &&
    !activity.taskId &&
    !activity.contactId &&
    !activity.deadlineId &&
    !activity.habitId &&
    !activity.careerActionId
  );
}
export function jobSessionApplications(data: AppData, activity: Activity) {
  return (activity.jobApplicationIds ?? []).flatMap((id) => {
    const job = data.applications?.find((job) => job.id === id);
    return job ? [job] : [];
  });
}
export function jobSearchSessions(
  data: AppData,
  boundary = planningBoundary(),
) {
  return Object.entries(data.weeks)
    .flatMap(([week, plan]) =>
      plan.activities
        .filter(
          (activity) =>
            isJobSearchSession(activity) &&
            activity.status === "planned" &&
            (activity.date > boundary.date ||
              (activity.date === boundary.date &&
                activity.end > boundary.minute)),
        )
        .map((activity) => ({
          week,
          activityId: activity.id,
          activity,
          jobs: jobSessionApplications(data, activity),
        })),
    )
    .sort(
      (a, b) =>
        a.activity.date.localeCompare(b.activity.date) ||
        a.activity.start - b.activity.start,
    );
}
export function assignJobsToSession(
  data: AppData,
  target: JobSessionRef,
  ids: string[],
  boundary = planningBoundary(),
): AppData {
  const activity = data.weeks[target.week]?.activities.find(
    (activity) => activity.id === target.activityId,
  );
  if (
    !activity ||
    !jobSearchSessions(data, boundary).some(
      (session) =>
        session.week === target.week &&
        session.activityId === target.activityId,
    )
  )
    throw new Error(
      "Passet kan inte användas längre. Välj ett befintligt kommande jobbsökarpass.",
    );
  if (
    !Array.isArray(ids) ||
    ids.length > 20 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => {
      const job = data.applications?.find((job) => job.id === id);
      return (
        !job ||
        job.status !== "draft" ||
        Boolean(job.deadline && job.deadline < activity.date)
      );
    })
  )
    throw new Error(
      "Välj högst 20 aktuella utkast med ansökningsdag efter eller på passets datum.",
    );
  return {
    ...data,
    weeks: {
      ...data.weeks,
      [target.week]: {
        ...data.weeks[target.week],
        activities: data.weeks[target.week].activities.map((pass) =>
          pass.id === target.activityId
            ? { ...pass, jobApplicationIds: [...ids] }
            : pass,
        ),
      },
    },
  };
}
