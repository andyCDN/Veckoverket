import type { Activity, AppData } from "./types";

/** Submission preparation ends when the linked application leaves draft.
 * Keep standalone deadlines and older orphaned references usable. */
export function applicationDeadlineActive(
  data: AppData,
  applicationId?: string,
) {
  const application = applicationId
    ? data.applications?.find((a) => a.id === applicationId)
    : undefined;
  return !application || application.status === "draft";
}

/** A linked deadline identifies submission work, unlike interviews or follow-ups.
 * Derive this from current status so old saved weeks need no destructive migration. */
export function obsoleteApplicationWork(data: AppData, activity: Activity) {
  if (!activity.deadlineId) return false;
  const deadline = data.deadlines?.find((d) => d.id === activity.deadlineId);
  return !applicationDeadlineActive(
    data,
    deadline?.applicationId ?? activity.applicationId,
  );
}
