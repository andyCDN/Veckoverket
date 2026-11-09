import type { AppData } from "./types";
import type { TaskDecision } from "./task-workflow";
import {
  careerActions,
  completeCareerAction,
  saveCareerAction,
} from "./career-actions";
import { actionBookings } from "./action-workflow";
import { planningBoundary } from "./date";
import { isLocalDate } from "./google-time";
export function resolveCareerTask(
  data: AppData,
  id: string,
  decision: TaskDecision,
): AppData {
  const action = careerActions(data).find(
    (a) => a.id === id && a.status === "open",
  );
  if (!action) return data;
  if (decision.kind === "done") return completeCareerAction(data, id);
  if (decision.kind !== "more" && decision.kind !== "waiting") return data;
  if (!decision.date || !isLocalDate(decision.date))
    throw new Error("Välj ett giltigt datum.");
  if (decision.kind === "waiting" && !decision.owner?.trim())
    throw new Error("Ange vem du väntar på.");
  const boundary = planningBoundary();
  const expired = new Set(
    actionBookings(data, action)
      .filter(
        (a) =>
          a.status === "planned" &&
          (a.date < boundary.date ||
            (a.date === boundary.date && a.end <= boundary.minute)),
      )
      .map((a) => a.id),
  );
  const base = expired.size
    ? {
        ...data,
        weeks: Object.fromEntries(
          Object.entries(data.weeks).map(([week, plan]) => [
            week,
            {
              ...plan,
              activities: plan.activities.map((a) =>
                expired.has(a.id) ? { ...a, status: "skipped" as const } : a,
              ),
            },
          ]),
        ),
      }
    : data;
  return saveCareerAction(base, {
    ...action,
    kind: decision.kind === "waiting" ? "waiting" : "task",
    date: decision.date,
    owner: decision.kind === "waiting" ? decision.owner!.trim() : "Jag",
  });
}
