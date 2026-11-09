import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createData } from "../lib/defaults";
import { decideTask, reviewWeek, taskStage } from "../lib/task-workflow";
import {
  previewWeeklyWork,
  weeklyWorkOptions,
  weeklyGoals,
} from "../lib/weekly-work";
import { decodeData } from "../lib/storage";
import { followUps } from "../lib/follow-up";
import type { Activity } from "../lib/types";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());
function fixture() {
  const d = createData();
  d.settings = {
    ...d.settings,
    start: 480,
    end: 960,
    autoPlanning: false,
    buffer: 0,
  };
  d.goals = [
    {
      id: "g",
      title: "Två leveranser",
      description: "",
      categoryId: "career",
      horizon: "week",
      week: "2026-11-09",
    },
  ];
  d.tasks = [
    {
      id: "t",
      title: "Första leveransen",
      goalId: "g",
      done: false,
      estimatedMinutes: 30,
    },
    { id: "other", title: "Andra leveransen", goalId: "g", done: false },
  ];
  const pass: Activity = {
    id: "p",
    taskId: "t",
    goalId: "g",
    date: "2026-11-09",
    start: 480,
    end: 510,
    title: "Första leveransen",
    categoryId: "career",
    blockType: "flexible",
    priority: 3,
    estimatedMinutes: 30,
    description: "",
    source: "manual",
    status: "done",
  };
  d.weeks = {
    "2026-11-09": {
      week: "2026-11-09",
      generatedAt: "",
      weeklyRoutinesFrom: "2026-11-09",
      rules: d.settings,
      activities: [pass],
    },
  };
  return d;
}
it("distinguishes a completed pass from task outcome and offers remaining work without duplicating a future booking", () => {
  const d = fixture();
  expect(taskStage(d, d.tasks[0])).toBe("followup");
  expect(d.tasks[0].done).toBe(false);
  const next = decideTask(d, "t", {
    kind: "more",
    minutes: 45,
    date: "2026-11-09",
  });
  expect(taskStage(next, next.tasks[0])).toBe("unplanned");
  expect(
    weeklyWorkOptions(next, "2026-11-09").some((o) => o.request.id === "t"),
  ).toBe(true);
  const result = previewWeeklyWork(
    next,
    "2026-11-09",
    [{ kind: "task", id: "t", minutes: 45 }],
    { date: "2026-11-09", minute: 600 },
  );
  expect(result.activities).toHaveLength(1);
  expect(
    result.data.weeks["2026-11-09"].activities.find((a) => a.id === "p")
      ?.status,
  ).toBe("done");
  expect(taskStage(result.data, result.data.tasks[0])).toBe("booked");
  expect(
    previewWeeklyWork(
      result.data,
      "2026-11-09",
      [{ kind: "task", id: "t", minutes: 45 }],
      { date: "2026-11-09", minute: 600 },
    ).activities,
  ).toHaveLength(0);
});
it("waiting has an owner and review date, stays out of planning, and can be completed", () => {
  const d = decideTask(fixture(), "t", {
    kind: "waiting",
    owner: "Kim",
    date: "2026-11-17",
  });
  expect(taskStage(d, d.tasks[0])).toBe("waiting");
  expect(
    weeklyWorkOptions(d, "2026-11-09").some((o) => o.request.id === "t"),
  ).toBe(false);
  expect(weeklyGoals(d, "2026-11-16").map((g) => g.id)).toContain("g");
  expect(() =>
    decideTask(d, "t", { kind: "waiting", owner: "", date: "2026-11-17" }),
  ).toThrow();
  const done = decideTask(d, "t", { kind: "done" });
  expect(done.tasks[0]).toMatchObject({
    done: true,
    state: "open",
    needsPlanning: false,
  });
  expect(done.tasks[0].waitingFor).toBeUndefined();
  expect(decodeData(JSON.stringify(done)).tasks).toMatchObject([
    { done: true },
    { done: false },
  ]);
});
it("dropping work preserves completed history and releases planned work without legacy follow-up duplicates", () => {
  const d = fixture();
  d.weeks["2026-11-09"].activities.push({
    ...d.weeks["2026-11-09"].activities[0],
    id: "future",
    status: "planned",
    date: "2026-11-10",
  });
  const dropped = decideTask(d, "t", { kind: "drop" });
  expect(taskStage(dropped, dropped.tasks[0])).toBe("dropped");
  expect(dropped.weeks["2026-11-09"].activities.map((a) => a.status)).toEqual([
    "done",
    "skipped",
  ]);
  expect(followUps(dropped)).toHaveLength(0);
  expect(d.weeks["2026-11-09"].activities[1].status).toBe("planned");
  expect(
    taskStage(
      decideTask(dropped, "t", { kind: "reopen" }),
      decideTask(dropped, "t", { kind: "reopen" }).tasks[0],
    ),
  ).toBe("unplanned");
});
it("Friday carries selected identities only and keeps a frozen report when work is finished in a later week", () => {
  const d = fixture();
  d.tasks[1].done = true;
  d.weeks["2026-11-09"].activities.push({
    ...d.weeks["2026-11-09"].activities[0],
    id: "pending",
    status: "planned",
    date: "2026-11-13",
  });
  const reviewed = reviewWeek(d, "2026-11-09", ["t", "other"]);
  expect(reviewed.tasks[0]).toMatchObject({
    id: "t",
    date: "2026-11-16",
    needsPlanning: true,
    done: false,
  });
  expect(reviewed.tasks[1].date).toBeUndefined();
  expect(reviewed.weeks["2026-11-09"].activities.map((a) => a.status)).toEqual([
    "done",
    "skipped",
  ]);
  expect(reviewed.goals[0].week).toBe("2026-11-09");
  const report = reviewed.reflections["2026-11-09"].reviewSummary;
  expect(report).toContain("förs vidare till 2026-11-16");
  const later = decideTask(reviewed, "t", { kind: "done" });
  expect(later.reflections["2026-11-09"].reviewSummary).toBe(report);
  expect(
    decodeData(JSON.stringify(reviewed)).reflections["2026-11-09"]
      .reviewSummary,
  ).toBe(report);
  expect(d.tasks[0].date).toBeUndefined();
});

it("does not carry unselected open tasks from the same goal into the next week's planning queue", () => {
  const d = fixture();
  const reviewed = reviewWeek(d, "2026-11-09", ["t"]);
  vi.setSystemTime(new Date("2026-11-16T07:00:00Z"));
  const options = weeklyWorkOptions(reviewed, "2026-11-16");
  expect(
    options.filter((o) => o.request.kind === "task").map((o) => o.request.id),
  ).toEqual(["t"]);
});

it("ending the Friday review also completes its scheduled check pass without a second completion step", () => {
  const d = fixture();
  d.weeks["2026-11-09"].activities.push({
    ...d.weeks["2026-11-09"].activities[0],
    id: "review",
    taskId: undefined,
    routine: "week-review",
    status: "planned",
    date: "2026-11-13",
  });
  const next = reviewWeek(d, "2026-11-09", []);
  expect(
    next.weeks["2026-11-09"].activities.find((a) => a.id === "review")?.status,
  ).toBe("done");
  expect(
    d.weeks["2026-11-09"].activities.find((a) => a.id === "review")?.status,
  ).toBe("planned");
});
