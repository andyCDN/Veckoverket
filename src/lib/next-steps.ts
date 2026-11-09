import type { AppData } from "./types";
import { addDays, today } from "./date";
import { weeklyWorkOptions } from "./weekly-work";
import { taskStage, weekTasks } from "./task-workflow";
import { careerActions, type TrackedAction } from "./career-actions";
import { actionWorkflow } from "./action-workflow";
import { followUps, type FollowUp } from "./follow-up";
import { deadlineWork } from "./deadline-scheduling";
export type NextStep = {
  key: string;
  title: string;
  detail: string;
  label: string;
} & (
  | { kind: "plan"; scope: { taskId?: string; habitId?: string } }
  | { kind: "task"; id: string }
  | { kind: "career"; action: TrackedAction; followup: boolean }
  | { kind: "missed"; item: FollowUp }
  | { kind: "deadline"; id: string }
);
/** All entries point to their original record; no copied tasks or statuses. */
export function nextSteps(data: AppData, week: string): NextStep[] {
  const rows: NextStep[] = [];
  const current = today();
  const actions = careerActions(data);
  for (const task of weekTasks(data, week)) {
    const stage = taskStage(data, task);
    if (
      stage === "followup" ||
      (stage === "waiting" && task.reviewOn && task.reviewOn <= current)
    )
      rows.push({
        key: `task:${task.id}`,
        title: task.title,
        detail:
          task.state === "waiting"
            ? `Väntar på ${task.waitingFor} · ${task.reviewOn}`
            : "Passet är avslutat eller har passerat.",
        label: "Följ upp",
        kind: "task",
        id: task.id,
      });
  }
  for (const action of actions.filter((a) => a.status === "open")) {
    const flow = actionWorkflow(data, action);
    if (
      flow.booking &&
      flow.booking.date >= current &&
      flow.label === "Bokat i kalendern"
    )
      continue;
    if (action.kind === "waiting" && action.date > current) continue;
    if (action.kind !== "waiting" && action.date > addDays(week, 6)) continue;
    const followup =
      flow.waiting ||
      flow.stage === "confirm" ||
      Boolean(flow.booking) ||
      flow.stage === "reschedule";
    const application = data.applications?.find(
      (a) => a.id === action.applicationId,
    );
    const contact = data.contacts?.find((c) => c.id === action.contactId);
    const source = application
      ? `Jobb · ${application.organization} · ${application.role}`
      : `Nätverk · ${contact?.name ?? "Kontakt"}`;
    rows.push({
      key: `career:${action.id}`,
      title: action.title,
      detail: `${source} · ${action.kind === "waiting" && action.owner ? `Väntar på ${action.owner}` : flow.label}${action.date ? ` · ${action.date}` : ""}`,
      label: followup ? "Följ upp" : "Boka tid",
      kind: "career",
      action,
      followup,
    });
  }
  const grouped = new Map<
    string,
    {
      title: string;
      minutes: number;
      scope: { taskId?: string; habitId?: string };
    }
  >();
  for (const option of weeklyWorkOptions(data, week).filter(
    (o) => o.selected,
  )) {
    const { kind, id, minutes } = option.request;
    const key = `${kind}:${id}`;
    const old = grouped.get(key);
    if (old) old.minutes += minutes;
    else
      grouped.set(key, {
        title:
          kind === "task"
            ? (data.tasks.find((t) => t.id === id)?.title ?? option.label)
            : (data.habits?.find((h) => h.id === id)?.title ?? option.label),
        minutes,
        scope: kind === "task" ? { taskId: id } : { habitId: id },
      });
  }
  for (const [key, item] of grouped)
    rows.push({
      key: `plan:${key}`,
      title: item.title,
      detail: `${item.minutes} min · saknar kalenderpass`,
      label: "Boka tid",
      kind: "plan",
      scope: item.scope,
    });
  for (const item of followUps(data).filter((i) => i.remaining > 0)) {
    if (item.activity.careerActionId) continue;
    rows.push({
      key: `missed:${item.week}:${item.activity.id}`,
      title: item.activity.title,
      detail: `Missat pass · ${item.remaining} min återstår`,
      label: "Boka tid",
      kind: "missed",
      item,
    });
  }
  for (const work of deadlineWork(data).filter(
    (w) => w.deadline.date <= addDays(week, 6),
  )) {
    if (
      work.deadline.steps.some(
        (s) =>
          !work.activities.some(
            (a) => a.deadlineStepId === s.id && a.status !== "skipped",
          ),
      )
    )
      rows.push({
        key: `deadline:${work.deadline.id}`,
        title: work.deadline.title,
        detail: `Deadline · ${work.deadline.date}`,
        label: "Boka tid",
        kind: "deadline",
        id: work.deadline.id,
      });
  }
  return rows;
}
