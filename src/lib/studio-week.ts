import { weeklyGoals } from "./weekly-work";
import { addDays, today } from "./date";
import type { Activity, AppData } from "./types";

/** Professional overview only; saved personal bookings remain in the workspace. */
export function studioWeek(
  data: AppData,
  week: string,
  activities: Activity[],
  currentDate = today(),
) {
  const end = addDays(week, 6);
  const professional = activities.filter(
    (activity) =>
      activity.date >= week &&
      activity.date <= end &&
      activity.categoryId !== "family",
  );
  const goals = weeklyGoals(data, week).filter(
    (goal) => goal.categoryId !== "family",
  );
  const goalIds = new Set(goals.map((goal) => goal.id));
  const professionalGoalIds = new Set(
    data.goals
      .filter((goal) => goal.categoryId !== "family")
      .map((goal) => goal.id),
  );
  const tasks = data.tasks.filter(
    (task) =>
      professionalGoalIds.has(task.goalId) &&
      (professional.some((a) => a.taskId === task.id) ||
        (task.date
          ? task.date >= week && task.date <= end
          : goalIds.has(task.goalId))),
  );
  const completed = tasks.filter((task) => task.done).length;
  const meetings = professional.filter(
    (activity) =>
      activity.categoryId !== "rest" &&
      !activity.external?.allDay &&
      activity.external?.busy !== false &&
      (data.applications?.some((application) =>
        application.interviews?.some(
          (interview) => interview.meetingActivityId === activity.id,
        ),
      ) ||
        activity.external ||
        activity.blockType === "locked"),
  );
  const focus = professional.filter(
    (activity) =>
      activity.categoryId !== "rest" &&
      activity.blockType !== "locked" &&
      !meetings.includes(activity) &&
      !activity.external?.allDay &&
      activity.external?.busy !== false,
  );
  const deadlines = (data.deadlines ?? []).filter(
    (deadline) =>
      deadline.date >= week &&
      deadline.date <= end &&
      deadline.categoryId !== "family",
  );
  const critical = deadlines.filter(
    (deadline) =>
      deadline.date <= addDays(currentDate, 2) &&
      (!deadline.steps.length ||
        deadline.steps.some(
          (step) =>
            !activities.some(
              (activity) =>
                activity.deadlineId === deadline.id &&
                activity.deadlineStepId === step.id &&
                activity.status === "done",
            ),
        )),
  );
  return {
    activities: professional,
    goals,
    tasks,
    completed,
    percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    meetings: meetings.length,
    focus: focus.length,
    focusMinutes: focus.reduce(
      (sum, activity) => sum + activity.end - activity.start,
      0,
    ),
    deadlines,
    critical: critical.length,
  };
}
