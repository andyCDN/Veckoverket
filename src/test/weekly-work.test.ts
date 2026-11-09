import { expect, it, vi } from "vitest";
import { createData } from "../lib/defaults";
import { previewWeeklyWork, weeklyGoals } from "../lib/weekly-work";
import { effectiveHabitChecks, habitWeek } from "../lib/habits";
import { decodeData } from "../lib/storage";
import type { Activity } from "../lib/types";
function fixture() {
  const d = createData();
  d.settings = {
    ...d.settings,
    start: 480,
    end: 960,
    days: [0, 1, 2, 3, 4],
    buffer: 0,
  };
  d.goals = [
    {
      id: "g1",
      week: "2026-11-09",
      title: "Ansökningar",
      description: "",
      categoryId: "career",
      horizon: "week",
    },
    {
      id: "g2",
      week: "2026-11-09",
      title: "Arbetsprov",
      description: "",
      categoryId: "career",
      horizon: "week",
    },
  ];
  d.tasks = [
    { id: "t1", goalId: "g1", title: "Anpassa ansökan A", done: false },
    { id: "t2", goalId: "g2", title: "Skicka arbetsprov B", done: false },
  ];
  d.habits = [
    {
      id: "h",
      title: "Rörelse",
      createdOn: "2026-11-09",
      schedule: { kind: "days", days: [0] },
      checks: [],
      minutes: 30,
      categoryId: "health",
    },
  ];
  const base: Activity = {
    id: "slot",
    title: "Generellt jobbsök",
    goalId: "g1",
    categoryId: "career",
    date: "2026-11-09",
    start: 540,
    end: 660,
    estimatedMinutes: 120,
    source: "generated",
    status: "planned",
    priority: 3,
    description: "",
    blockType: "flexible",
  };
  d.weeks = {
    "2026-11-09": {
      week: "2026-11-09",
      generatedAt: "",
      rules: d.settings,
      weeklyRoutinesFrom: "2026-11-09",
      activities: [
        base,
        {
          ...base,
          id: "protected",
          source: "manual",
          blockType: "locked",
          start: 660,
          end: 720,
          goalId: undefined,
        },
      ],
    },
  };
  return d;
}
const requests = [
  { kind: "task" as const, id: "t1", minutes: 60 },
  { kind: "task" as const, id: "t2", minutes: 45 },
  { kind: "habit" as const, id: "h", minutes: 30, date: "2026-11-09" },
];
it("preview assigns each real task to its own goal, reuses generic time and protects fixed bookings", () => {
  const data = fixture(),
    before = structuredClone(data);
  const result = previewWeeklyWork(data, "2026-11-09", requests, {
    date: "2026-11-09",
    minute: 480,
  });
  expect(data).toEqual(before);
  expect(result.activities).toHaveLength(3);
  expect(result.reused).toBe(2);
  expect(result.activities.find((a) => a.taskId === "t2")?.goalId).toBe("g2");
  expect(
    result.data.weeks["2026-11-09"].activities.find(
      (a) => a.id === "protected",
    ),
  ).toEqual(data.weeks["2026-11-09"].activities[1]);
  expect(result.data.tasks.every((t) => !t.done)).toBe(true);
  expect(decodeData(JSON.stringify(result.data)).weeks).toEqual(
    result.data.weeks,
  );
  const repeated = previewWeeklyWork(result.data, "2026-11-09", requests, {
    date: "2026-11-09",
    minute: 480,
  });
  expect(repeated.activities).toEqual([]);
  expect(repeated.data).toBe(result.data);
});
it("keeps work visible as unplaced when capacity is missing and never changes past or protected passes", () => {
  const data = fixture();
  data.weeks["2026-11-09"].activities = data.weeks["2026-11-09"].activities.map(
    (a) => ({ ...a, blockType: "locked" }),
  );
  data.weeks["2026-11-09"].rules = {
    ...data.settings,
    days: [0],
    start: 540,
    end: 720,
  };
  const result = previewWeeklyWork(data, "2026-11-09", requests, {
    date: "2026-11-09",
    minute: 540,
  });
  expect(result.activities).toEqual([]);
  expect(result.unplaced).toHaveLength(3);
  expect(result.data).toBe(data);
});
it("derives habit days from real outcomes without writing manual marks or double counting", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
  try {
    const data = fixture();
    const result = previewWeeklyWork(data, "2026-11-09", requests, {
      date: "2026-11-09",
      minute: 480,
    }).data;
    const habit = result.habits![0];
    const pass = result.weeks["2026-11-09"].activities.find((a) => a.habitId)!;
    expect(effectiveHabitChecks(habit, result)).toEqual([]);
    pass.status = "done";
    expect(habitWeek(habit, "2026-11-09", result).completed).toBe(1);
    expect(habit.checks).toEqual([]);
    habit.checks.push("2026-11-09");
    expect(effectiveHabitChecks(habit, result)).toEqual(["2026-11-09"]);
    pass.status = "skipped";
    expect(effectiveHabitChecks(habit, result)).toEqual(["2026-11-09"]);
    expect(result.tasks.every((t) => !t.done)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
it("keeps a dated task connected to its original goal after moving its booking to another week", () => {
  const data = fixture();
  const result = previewWeeklyWork(data, "2026-11-09", requests, {
    date: "2026-11-09",
    minute: 480,
  }).data;
  const pass = result.weeks["2026-11-09"].activities.find(
    (a) => a.taskId === "t1",
  )!;
  result.weeks["2026-11-09"].activities = result.weeks[
    "2026-11-09"
  ].activities.filter((a) => a !== pass);
  result.weeks["2026-11-16"] = {
    week: "2026-11-16",
    generatedAt: "",
    activities: [{ ...pass, date: "2026-11-16" }],
  };
  expect(weeklyGoals(result, "2026-11-16").map((g) => g.id)).toContain("g1");
  expect(result.goals[0].week).toBe("2026-11-09");
});

it("prioritizes chosen important work before lower priority tasks when only one fits", () => {
  const data = fixture();
  data.weeks["2026-11-09"].activities = [];
  data.weeks["2026-11-09"].rules = {
    ...data.settings,
    days: [0],
    start: 540,
    end: 600,
  };
  const result = previewWeeklyWork(
    data,
    "2026-11-09",
    [
      { kind: "task", id: "t1", minutes: 60, priority: 3 },
      { kind: "task", id: "t2", minutes: 45, priority: 1 },
    ],
    { date: "2026-11-09", minute: 480 },
  );
  expect(result.activities).toHaveLength(1);
  expect(result.activities[0].taskId).toBe("t2");
  expect(result.unplaced).toHaveLength(1);
});

it("uses enabled weekend capacity even when the weekday list contains weekdays only", () => {
  const data = fixture();
  data.weeks["2026-11-09"].rules = { ...data.settings, weekends: true };
  data.habits![0].schedule = { kind: "days", days: [6] };
  const result = previewWeeklyWork(
    data,
    "2026-11-09",
    [{ kind: "habit", id: "h", date: "2026-11-15", minutes: 30 }],
    { date: "2026-11-09", minute: 480 },
  );
  expect(result.activities[0]).toMatchObject({
    habitId: "h",
    date: "2026-11-15",
  });
});
