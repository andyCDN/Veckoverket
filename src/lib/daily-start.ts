import type { Activity, AppData, Task, WeekPlan } from "./types";
import { addDays, monday, planningBoundary, uid, weekday } from "./date";
import { plannedDays, validatePlan } from "./planner";
import { tasksInWeek, workBookings } from "./weekly-work";
import { blocksTime } from "./external-calendar";
import { RECOVERY_FOCUS } from "./daily-check-in";
import { obsoleteApplicationWork } from "./application-deadlines";
import { careerActions } from "./career-actions";
export type DailyChoice = {
  key: string;
  title: string;
  minutes: number;
  activity?: Activity;
  task?: Task;
};
export function dailyChoices(
  data: AppData,
  boundary = planningBoundary(),
): DailyChoice[] {
  const passes = data.weeks[monday(boundary.date)]?.activities ?? [];
  const booked = passes
    .filter(
      (a) =>
        a.date === boundary.date &&
        a.status === "planned" &&
        !obsoleteApplicationWork(data, a) &&
        a.end > boundary.minute &&
        !a.external &&
        !a.routine &&
        !a.habitId &&
        !["rest", "family"].includes(a.categoryId) &&
        (a.taskId
          ? data.tasks.some(
              (t) =>
                t.id === a.taskId &&
                !t.done &&
                !["waiting", "dropped"].includes(t.state ?? ""),
            )
          : a.careerActionId
            ? careerActions(data).some(
                (t) =>
                  t.id === a.careerActionId &&
                  t.status === "open" &&
                  t.kind !== "waiting",
              )
            : a.blockType === "flexible"),
    )
    .sort((a, b) => a.start - b.start)
    .map((activity) => ({
      key: `pass:${activity.id}`,
      title: activity.title,
      minutes: activity.end - Math.max(activity.start, boundary.minute),
      activity,
    }));
  const unbooked = tasksInWeek(data, monday(boundary.date))
    .filter(
      (t) =>
        !t.done &&
        !["waiting", "dropped"].includes(t.state ?? "") &&
        (!t.date || t.date <= boundary.date) &&
        !workBookings(data, "task", t.id).some(
          (a) =>
            a.status === "planned" &&
            (a.date > boundary.date ||
              (a.date === boundary.date && a.end > boundary.minute)),
        ),
    )
    .sort((a, b) => (a.estimatedMinutes ?? 60) - (b.estimatedMinutes ?? 60));
  return [
    ...booked,
    ...unbooked.map((task) => ({
      key: `task:${task.id}`,
      title: task.title,
      minutes: task.estimatedMinutes ?? 60,
      task,
    })),
  ];
}
export function dailyStart(data: AppData, boundary = planningBoundary()) {
  const plan = data.weeks[monday(boundary.date)],
    passes = plan?.activities ?? [],
    choices = dailyChoices(data, boundary);
  const gentle = plan?.gentleDays?.includes(boundary.date) ?? false,
    focusId = plan?.gentleFocus?.[boundary.date];
  const checkIn = data.dailyCheckIns?.[boundary.date];
  return {
    date: boundary.date,
    gentle,
    gentleDone: Boolean(
      focusId && passes.some((a) => a.id === focusId && a.status === "done"),
    ),
    checkIn,
    recommendation: checkIn
      ? choices.find((c) =>
          checkIn.focus.kind === "task"
            ? c.task?.id === checkIn.focus.id ||
              c.activity?.taskId === checkIn.focus.id
            : checkIn.focus.kind === "activity" &&
              c.activity?.id === checkIn.focus.id,
        )
      : gentle
        ? choices.find((c) => c.activity?.id === focusId)
        : (choices.find(
            (c) => c.activity?.taskId || c.activity?.careerActionId,
          ) ??
          choices.find((c) => c.task) ??
          choices[0]),
    next: passes
      .filter(
        (a) =>
          a.date === boundary.date &&
          a.status === "planned" &&
          a.start >= boundary.minute &&
          blocksTime(a),
      )
      .sort((a, b) => a.start - b.start)[0],
  };
}
function movable(
  a: Activity,
  data: AppData,
  boundary: { date: string; minute: number },
) {
  return (
    a.date === boundary.date &&
    a.start >= boundary.minute &&
    a.status === "planned" &&
    a.blockType === "flexible" &&
    Boolean(data.categories.find((c) => c.id === a.categoryId)?.movable) &&
    !a.external &&
    !a.recurrenceId &&
    !a.routine &&
    !a.followUpOf &&
    !a.habitId &&
    !a.careerActionId &&
    !a.applicationId &&
    !a.contactId &&
    !a.deadlineId &&
    !["rest", "family"].includes(a.categoryId) &&
    (Boolean(
      a.taskId &&
      data.tasks.some(
        (t) =>
          t.id === a.taskId &&
          !t.done &&
          !["waiting", "dropped"].includes(t.state ?? ""),
      ),
    ) ||
      a.source === "generated")
  );
}
export function gentleChoices(data: AppData, boundary = planningBoundary()) {
  return dailyChoices(data, boundary).filter(
    (c) => !c.activity || movable(c.activity, data, boundary),
  );
}
export type GentleChange = {
  title: string;
  kind: "move" | "release" | "queue";
  from: Activity;
  to?: Activity;
  minutes: number;
  queuedFor?: string;
};
export type GentlePreview = {
  data: AppData;
  date: string;
  focus?: Activity;
  changes: GentleChange[];
  errors: string[];
  fixed: Activity[];
};
/** Compute a proposal without changing saved work or moving fixed commitments. */
export function previewGentleDay(
  data: AppData,
  choiceKey: string,
  minutes: number,
  boundary = planningBoundary(),
): GentlePreview {
  const week = monday(boundary.date),
    original = data.weeks[week];
  const result: GentlePreview = {
    data,
    date: boundary.date,
    changes: [],
    errors: [],
    fixed: [],
  };
  if (!original || ![15, 30].includes(minutes)) {
    result.errors.push("Välj en liten insats på 15 eller 30 minuter.");
    return result;
  }
  const choice = gentleChoices(data, boundary).find((c) => c.key === choiceKey);
  if (choiceKey && !choice) {
    result.errors.push(
      "Välj en obokad uppgift eller ett flyttbart arbetspass som inte har börjat.",
    );
    return result;
  }
  const moving = original.activities.filter((a) => movable(a, data, boundary));
  result.fixed = original.activities.filter(
    (a) =>
      a.date === boundary.date &&
      a.status === "planned" &&
      a.end > boundary.minute &&
      !moving.includes(a),
  );
  const activities = original.activities.filter((a) => !moving.includes(a)),
    tasks = data.tasks.map((t) => ({ ...t }));
  const settings = original.rules ?? data.settings;
  const nextDate =
    Array.from({ length: 7 }, (_, i) => addDays(boundary.date, i + 1)).find(
      (d) => plannedDays(settings).includes(weekday(d)),
    ) ?? addDays(boundary.date, 1);
  const fit = (a: Activity) =>
    !validatePlan([...activities, a], settings).some(
      (c) => c.severity === "error" && c.id.includes(a.id),
    );
  let focus: Activity | undefined;
  if (choice?.activity) {
    const a = choice.activity,
      length = Math.min(minutes, a.end - a.start);
    focus = {
      ...a,
      end: a.start + length,
      estimatedMinutes: length,
      source: "manual",
    };
  } else if (choice?.task) {
    const task = choice.task,
      goal = data.goals.find((g) => g.id === task.goalId);
    if (!goal) {
      result.errors.push("Uppgiftens mål finns inte kvar.");
      return result;
    }
    for (
      let start =
        Math.ceil(Math.max(settings.start, boundary.minute) / 15) * 15;
      start + minutes <= settings.end;
      start += 15
    ) {
      const a: Activity = {
        id: uid(),
        title: task.title,
        taskId: task.id,
        goalId: goal.id,
        categoryId: goal.categoryId,
        date: boundary.date,
        start,
        end: start + minutes,
        estimatedMinutes: minutes,
        status: "planned",
        source: "manual",
        blockType: "flexible",
        priority: 3,
        description: "En liten insats för idag.",
      };
      if (plannedDays(settings).includes(weekday(boundary.date)) && fit(a)) {
        focus = a;
        break;
      }
    }
    if (!focus) {
      result.errors.push(
        "Den lilla insatsen ryms inte idag utan att flytta ett fast åtagande. Välj att behålla enbart befintliga åtaganden, eller en annan uppgift.",
      );
      return result;
    }
  }
  if (focus) {
    activities.push(focus);
    result.focus = focus;
  }
  const queued = new Map<string, number>();
  for (const a of moving) {
    const remaining = focus?.id === a.id ? a.end - focus.end : a.end - a.start;
    if (!remaining) continue;
    if (!a.taskId) {
      result.changes.push({
        title: a.title,
        kind: "release",
        from: a,
        minutes: remaining,
      });
      continue;
    }
    let to: Activity | undefined;
    for (const day of plannedDays(settings)) {
      const date = addDays(week, day);
      if (date <= boundary.date || original.gentleDays?.includes(date))
        continue;
      for (
        let start = settings.start;
        start + remaining <= settings.end;
        start += 15
      ) {
        const candidate: Activity = {
          ...a,
          id: focus?.id === a.id ? uid() : a.id,
          date,
          start,
          end: start + remaining,
          estimatedMinutes: remaining,
          source: "manual",
        };
        if (fit(candidate)) {
          to = candidate;
          break;
        }
      }
      if (to) break;
    }
    if (to) {
      activities.push(to);
      result.changes.push({
        title: a.title,
        kind: "move",
        from: a,
        to,
        minutes: remaining,
      });
    } else {
      const task = tasks.find((t) => t.id === a.taskId);
      if (task) {
        const total = (queued.get(task.id) ?? 0) + remaining;
        queued.set(task.id, total);
        task.estimatedMinutes = Math.min(480, total);
        if (focus?.taskId !== task.id) {
          task.needsPlanning = true;
          task.date = nextDate;
        }
      }
      result.changes.push({
        title: a.title,
        kind: "queue",
        from: a,
        minutes: remaining,
        queuedFor: focus?.taskId === a.taskId ? undefined : nextDate,
      });
    }
  }
  const touched = new Set([...moving.map((a) => a.taskId), focus?.taskId]);
  for (const task of tasks)
    if (
      touched.has(task.id) &&
      activities.some(
        (a) =>
          a.taskId === task.id &&
          a.status === "planned" &&
          (a.date > boundary.date ||
            (a.date === boundary.date && a.end > boundary.minute)),
      )
    )
      task.needsPlanning = false;
  const gentleFocus = { ...original.gentleFocus };
  if (focus) gentleFocus[boundary.date] = focus.id;
  else delete gentleFocus[boundary.date];
  const plan: WeekPlan = {
    ...original,
    gentleFocus,
    gentleDays: [...new Set([...(original.gentleDays ?? []), boundary.date])],
    activities: activities.sort(
      (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
    ),
  };
  const checkIn = data.dailyCheckIns?.[boundary.date];
  result.data = {
    ...data,
    tasks,
    weeks: { ...data.weeks, [week]: plan },
    ...(checkIn
      ? {
          dailyCheckIns: {
            ...data.dailyCheckIns,
            [boundary.date]: {
              ...checkIn,
              focus: focus
                ? {
                    kind: focus.taskId ? "task" : "activity",
                    id: focus.taskId ?? focus.id,
                    title: focus.title,
                  }
                : RECOVERY_FOCUS,
              updatedAt: new Date().toISOString(),
            },
          },
        }
      : {}),
  };
  return result;
}
