import type { Activity, AppData, Deadline } from "./types";
import { addDays, monday, planningBoundary } from "./date";
import { isLocalDate } from "./google-time";
import { planDeadline, type PlanningPreview } from "./career-planning";

export const DEFAULT_DEADLINE_WORK_MINUTES = 60;
/** Keep generated references within the workspace's 200-character id limit. */
function applicationDeadlineId(id: string) {
  if (id.length <= 160) return `application-deadline-${id}`;
  let hash = 14695981039346656037n;
  for (const character of id)
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(character.codePointAt(0)!)) * 1099511628211n,
    );
  return `application-deadline-${id.slice(0, 150)}-${hash.toString(16)}`;
}
export type DeadlineWork = {
  deadline: Deadline;
  applicationOnly: boolean;
  activities: Activity[];
};

/** Application dates remain dates; their work reservation has a stable linked id.
 * Explicit steps replace the fallback work item, avoiding duplicate reservations. */
export function deadlineWork(data: AppData): DeadlineWork[] {
  const all = Object.values(data.weeks).flatMap((week) => week.activities);
  const explicit = data.deadlines ?? [];
  const covered = new Set(explicit.map((d) => d.applicationId));
  const derived: Deadline[] = (data.applications ?? [])
    .filter(
      (a) =>
        a.status === "draft" &&
        isLocalDate(a.deadline) &&
        (!covered.has(a.id) ||
          all.some(
            (pass) =>
              pass.deadlineId === applicationDeadlineId(a.id) &&
              pass.status === "planned",
          )),
    )
    .map((a) => ({
      id: applicationDeadlineId(a.id),
      title: `${a.role} · ${a.organization}`,
      date: a.deadline,
      minute: (data.weeks[monday(a.deadline)]?.rules ?? data.settings).end,
      categoryId:
        data.categories.find((c) => c.id === "career")?.id ??
        data.categories[0].id,
      applicationId: a.id,
      steps: [
        {
          id: "work",
          title: "Arbeta med ansökan",
          minutes: DEFAULT_DEADLINE_WORK_MINUTES,
        },
      ],
    }));
  return [...explicit, ...derived]
    .map((deadline) => ({
      deadline,
      applicationOnly: derived.includes(deadline),
      activities: all.filter((a) => a.deadlineId === deadline.id),
    }))
    .sort(
      (a, b) =>
        a.deadline.date.localeCompare(b.deadline.date) ||
        a.deadline.minute - b.deadline.minute ||
        a.deadline.id.localeCompare(b.deadline.id),
    );
}

/** Book atomically, retaining existing outcome/manual/locked/imported activities.
 * A generated future block in the same category can receive the concrete task;
 * its id, time, duration, category and goal are retained. */
export function bookDeadlineWork(
  data: AppData,
  id: string,
  boundary = planningBoundary(),
): PlanningPreview {
  const work = deadlineWork(data).find((item) => item.deadline.id === id);
  if (!work)
    return {
      data,
      activities: [],
      errors: ["Deadlinen finns inte kvar eller ansökan är redan skickad."],
    };
  if (
    work.deadline.steps.every((step) =>
      work.activities.some((a) => a.deadlineStepId === step.id),
    )
  )
    return { data, activities: [], errors: [] };
  return planDeadline(data, work.deadline, boundary, {
    reuseGenerated: true,
    onlyMissing: true,
    ...(work.deadline.applicationId && !work.applicationOnly
      ? {
          fallbackDeadlineId: applicationDeadlineId(
            work.deadline.applicationId,
          ),
        }
      : {}),
  });
}

export function deadlineTiming(
  work: DeadlineWork,
  boundary = planningBoundary(),
) {
  const due = work.deadline;
  const past =
    due.date < boundary.date ||
    (due.date === boundary.date && due.minute <= boundary.minute);
  if (!work.activities.length)
    return past
      ? "Deadline har passerat. Ingen arbetstid är bokad."
      : "Arbetstid saknar bokning.";
  if (
    work.activities.some(
      (a) => a.date > due.date || (a.date === due.date && a.end > due.minute),
    )
  )
    return "Ett bokat pass slutar efter deadline.";
  if (
    work.activities.some(
      (a) =>
        a.status === "skipped" ||
        (a.status === "planned" &&
          (a.date < boundary.date ||
            (a.date === boundary.date && a.end <= boundary.minute))),
    )
  )
    return "Ett arbetspass behöver följas upp.";
  if (
    work.deadline.steps.some(
      (step) => !work.activities.some((a) => a.deadlineStepId === step.id),
    )
  )
    return "Ett eller flera delsteg saknar bokad arbetstid.";
  if (work.activities.every((a) => a.status === "done"))
    return "Arbetspassen är genomförda.";
  return "Arbetstid är bokad före deadline.";
}

export function upcomingDeadlineWork(data: AppData, date: string) {
  return deadlineWork(data).filter(
    (work) =>
      work.deadline.date === date ||
      work.activities.some((a) => a.date === date) ||
      (!work.activities.length &&
        work.deadline.date >= date &&
        work.deadline.date <= addDays(date, 7)),
  );
}
