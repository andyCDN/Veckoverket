import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createData } from "../lib/defaults";
import { nextSteps } from "../lib/next-steps";
import { careerActions, bookCareerAction } from "../lib/career-actions";
import { resolveCareerTask } from "../lib/career-task-resolution";
import { decodeData } from "../lib/storage";
import type { Activity } from "../lib/types";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());
function fixture() {
  const d = createData();
  d.goals = [
    {
      id: "g",
      title: "Resultat",
      week: "2026-11-09",
      horizon: "week",
      categoryId: "career",
      description: "",
    },
  ];
  d.tasks = [
    {
      id: "t",
      title: "Uppgift",
      goalId: "g",
      done: false,
      estimatedMinutes: 30,
    },
  ];
  d.habits = [];
  d.contacts = [];
  d.careerActions = [];
  d.deadlines = [];
  d.applications = [
    {
      id: "a",
      organization: "Kommunen",
      role: "Utredare",
      status: "sent",
      nextAction: "Arbetsprov",
      nextActionId: "s",
      nextActionKind: "task",
      nextActionOwner: "Jag",
      followUpDate: "2026-11-09",
      deadline: "",
      notes: "Bevara",
    },
  ];
  d.weeks = {
    "2026-11-09": { week: "2026-11-09", generatedAt: "", activities: [] },
  };
  return d;
}
const activity = (id: string): Activity => ({
  id,
  title: id,
  date: "2026-11-09",
  start: 480,
  end: 510,
  estimatedMinutes: 30,
  categoryId: "career",
  status: "skipped",
  source: "manual",
  blockType: "flexible",
  description: "",
  priority: 3,
});
it("samlar originalposter och döljer tom kö, klara uppgifter och framtida bevakningar", () => {
  const d = fixture();
  expect(nextSteps(d, "2026-11-09").map((r) => r.kind)).toEqual([
    "career",
    "plan",
  ]);
  const action = careerActions(d)[0];
  const waiting = resolveCareerTask(d, action.id, {
    kind: "waiting",
    owner: "Kim",
    date: "2026-11-12",
  });
  expect(nextSteps(waiting, "2026-11-09").map((r) => r.kind)).toEqual(["plan"]);
  waiting.tasks[0].done = true;
  expect(nextSteps(waiting, "2026-11-09")).toEqual([]);
  vi.setSystemTime(new Date("2026-11-12T09:00:00Z"));
  expect(nextSteps(waiting, "2026-11-09")).toMatchObject([
    { kind: "career", action: { id: action.id }, followup: true },
  ]);
});
it("ett missat kopplat jobbpass skapar bara ett nästa steg och kan bokas igen", () => {
  const d = fixture(),
    action = careerActions(d)[0];
  d.weeks["2026-11-09"].activities = [
    { ...activity("pass"), status: "planned", careerActionId: action.id },
    { ...activity("task-pass"), taskId: "t" },
  ];
  const rows = nextSteps(d, "2026-11-09");
  expect(rows.filter((r) => r.kind === "career")).toHaveLength(1);
  expect(rows.filter((r) => r.kind === "missed")).toHaveLength(0);
  expect(
    rows.filter((r) => r.kind === "plan" && r.scope.taskId === "t"),
  ).toHaveLength(1);
  const next = resolveCareerTask(d, action.id, {
    kind: "more",
    date: "2026-11-10",
    minutes: 30,
  });
  expect(next.weeks["2026-11-09"].activities[0].status).toBe("skipped");
  expect(careerActions(next).find((a) => a.id === action.id)?.date).toBe(
    "2026-11-10",
  );
  expect(next.tasks).toEqual(d.tasks);
  const booking = bookCareerAction(next, action.id, "2026-11-10", 600, 30);
  expect(booking.errors).toEqual([]);
  expect(booking.activities).toHaveLength(1);
});
it("samma jobbuppgift uppdateras och arkiveras utan att genomförd tid eller anteckningar försvinner", () => {
  const d = fixture(),
    action = careerActions(d)[0];
  d.weeks["2026-11-09"].activities = [
    { ...activity("done"), status: "done", careerActionId: action.id },
  ];
  const waiting = resolveCareerTask(d, action.id, {
    kind: "waiting",
    owner: "Kim",
    date: "2026-11-09",
  });
  expect(waiting.applications![0]).toMatchObject({
    nextActionOwner: "Kim",
    nextActionKind: "waiting",
    notes: "Bevara",
  });
  const done = resolveCareerTask(waiting, action.id, { kind: "done" });
  expect(done.applications![0].nextAction).toBe("");
  expect(done.weeks["2026-11-09"].activities[0].status).toBe("done");
  expect(
    done.careerActions?.some(
      (a) => a.title === action.title && a.status === "done",
    ),
  ).toBe(true);
  expect(() => decodeData(JSON.stringify(done))).not.toThrow();
});

it("tidsatta vanor grupperas, missade pass och deadlinearbete hamnar i samma kö", () => {
  const d = fixture();
  d.tasks = [];
  d.applications = [];
  d.habits = [
    {
      id: "h",
      title: "Rörelse",
      createdOn: "2026-11-09",
      schedule: { kind: "days", days: [0, 1] },
      checks: [],
      minutes: 30,
      categoryId: "health",
    },
  ];
  d.deadlines = [
    {
      id: "deadline",
      title: "Leverans",
      date: "2026-11-13",
      minute: 960,
      categoryId: "career",
      steps: [{ id: "step", title: "Arbeta", minutes: 60 }],
    },
  ];
  d.weeks["2026-11-09"].activities = [activity("missat")];
  const rows = nextSteps(d, "2026-11-09");
  expect(rows.filter((r) => r.kind === "plan")).toMatchObject([
    { scope: { habitId: "h" }, detail: "60 min · saknar kalenderpass" },
  ]);
  expect(rows.filter((r) => r.kind === "missed")).toHaveLength(1);
  expect(rows.filter((r) => r.kind === "deadline")).toHaveLength(1);
});
