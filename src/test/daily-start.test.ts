import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createData } from "../lib/defaults";
import {
  dailyStart,
  previewGentleDay,
  gentleChoices,
} from "../lib/daily-start";
import { generateWeek } from "../lib/planner";
import { replanAfterBookings, canReplanActivity } from "../lib/auto-planning";
import { decodeData } from "../lib/storage";
import type { Activity } from "../lib/types";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T07:00:00Z"));
});
afterEach(() => vi.useRealTimers());
const pass = (id: string, patch: Partial<Activity> = {}): Activity => ({
  id,
  title: id,
  date: "2026-11-09",
  start: 540,
  end: 600,
  categoryId: "career",
  source: "manual",
  status: "planned",
  blockType: "flexible",
  estimatedMinutes: 60,
  priority: 3,
  description: "",
  ...patch,
});
function fixture() {
  const d = createData();
  d.goals = [
    {
      id: "g",
      title: "Leverans",
      week: "2026-11-09",
      horizon: "week",
      categoryId: "career",
      description: "",
    },
  ];
  d.tasks = [
    {
      id: "t",
      title: "Skriv utkast",
      goalId: "g",
      done: false,
      estimatedMinutes: 60,
    },
    {
      id: "u",
      title: "Skicka ansökan",
      goalId: "g",
      done: false,
      estimatedMinutes: 30,
    },
  ];
  d.habits = [];
  d.applications = [];
  d.contacts = [];
  d.careerActions = [];
  d.deadlines = [];
  d.recurring = [];
  d.settings = {
    ...d.settings,
    autoPlanning: false,
    start: 480,
    end: 960,
    days: [0, 1, 2, 3, 4],
    buffer: 0,
  };
  d.weeks = {
    "2026-11-09": {
      week: "2026-11-09",
      generatedAt: "",
      rules: d.settings,
      weeklyRoutinesFrom: "2026-11-09",
      activities: [
        pass("focus", { taskId: "t", goalId: "g" }),
        pass("other", {
          taskId: "u",
          goalId: "g",
          start: 600,
          end: 630,
          estimatedMinutes: 30,
        }),
        pass("fixed", { blockType: "locked", start: 660, end: 690 }),
        pass("budget", { source: "generated", start: 780, end: 840 }),
      ],
    },
  };
  return d;
}
it("rekommenderar en uppgift och nästa pass utan att föreslå väntande eller avklarat arbete", () => {
  const d = fixture();
  expect(dailyStart(d).recommendation?.title).toBe("focus");
  expect(dailyStart(d).next?.id).toBe("focus");
  d.tasks[0].done = true;
  d.tasks[1].state = "waiting";
  expect(dailyStart(d).recommendation?.activity?.id).toBe("budget");
});
it("förhandsvisar en liten insats, flyttar återstående uppgiftsarbete och bevarar mål och identiteter", () => {
  const d = fixture(),
    before = structuredClone(d),
    p = previewGentleDay(d, "pass:focus", 15);
  expect(d).toEqual(before);
  expect(p.errors).toEqual([]);
  expect(p.focus).toMatchObject({
    id: "focus",
    start: 540,
    end: 555,
    taskId: "t",
  });
  expect(p.changes.filter((c) => c.kind === "move")).toHaveLength(2);
  expect(p.changes.find((c) => c.from.id === "focus")?.minutes).toBe(45);
  expect(p.changes.find((c) => c.from.id === "other")?.to?.id).toBe("other");
  expect(p.data.tasks.map((t) => t.id)).toEqual(["t", "u"]);
  expect(p.data.tasks.every((t) => !t.done)).toBe(true);
  expect(() => decodeData(JSON.stringify(p.data))).not.toThrow();
});
it("flyttar inte påbörjat arbete, möten, skyddad tid, vanor eller kopplade åtaganden", () => {
  const d = fixture();
  const held = [
    pass("started", { start: 450, end: 510 }),
    pass("meeting", { start: 510, end: 540 }),
    pass("protected", { blockType: "protected", start: 840, end: 870 }),
    pass("habit", { habitId: "h", start: 870, end: 900 }),
    pass("linked", { careerActionId: "step", start: 900, end: 930 }),
    pass("external", {
      source: "external",
      external: {
        provider: "google-calendar",
        calendarId: "c",
        eventId: "e",
        allDay: false,
        busy: true,
        originalStart: "2026-11-09T14:00:00Z",
        originalEnd: "2026-11-09T14:30:00Z",
      },
      start: 930,
      end: 960,
    }),
  ];
  d.weeks["2026-11-09"].activities.push(...held);
  const p = previewGentleDay(d, "pass:focus", 15);
  for (const a of held)
    expect(p.data.weeks["2026-11-09"].activities).toContainEqual(a);
  expect(previewGentleDay(d, "pass:started", 15).errors).not.toEqual([]);
});
it("full vecka behåller uppgifter för senare planering och väljer en tillåten framtida dag", () => {
  const d = fixture();
  for (let i = 1; i < 5; i++)
    d.weeks["2026-11-09"].activities.push(
      pass(`busy${i}`, {
        date: `2026-11-${9 + i}`,
        start: 480,
        end: 960,
        blockType: "locked",
      }),
    );
  const p = previewGentleDay(d, "pass:focus", 15);
  expect(p.changes.filter((c) => c.kind === "queue")).toHaveLength(2);
  expect(p.data.tasks.find((t) => t.id === "u")).toMatchObject({
    date: "2026-11-10",
    needsPlanning: true,
    done: false,
  });
  expect(p.data.tasks[0].estimatedMinutes).toBe(45);
  const f = fixture();
  f.weeks["2026-11-09"].activities = f.weeks["2026-11-09"].activities.map(
    (a) => ({ ...a, date: "2026-11-13" }),
  );
  expect(
    previewGentleDay(f, "", 15, { date: "2026-11-13", minute: 480 }).data
      .tasks[1].date,
  ).toBe("2026-11-16");
});
it("bokar obokad liten uppgift med rätt planeringsstatus och nekar tid som inte ryms", () => {
  const d = fixture();
  d.weeks["2026-11-09"].activities = [];
  d.tasks[1].needsPlanning = true;
  const p = previewGentleDay(d, "task:u", 15);
  expect(p.focus).toMatchObject({ taskId: "u", start: 480, end: 495 });
  expect(p.data.tasks[1].needsPlanning).toBe(false);
  d.weeks["2026-11-09"].activities = [
    pass("full", { blockType: "locked", start: 480, end: 960 }),
  ];
  expect(previewGentleDay(d, "task:u", 15).errors).not.toEqual([]);
  expect(gentleChoices(d)).toHaveLength(2);
});
it("automatisk planering återfyller inte den anpassade dagen eller lägger till nya checkpass", () => {
  const d = fixture();
  d.settings.autoPlanning = true;
  d.weeks["2026-11-09"].rules = { ...d.settings };
  const p = previewGentleDay(d, "pass:focus", 15);
  const held = p.data.weeks["2026-11-09"].activities.filter(
    (a) => a.date === "2026-11-09",
  );
  const generated = generateWeek(
    "2026-11-09",
    p.data,
    p.data.weeks["2026-11-09"],
    { notBefore: { date: "2026-11-09", minute: 480 } },
  ).plan;
  expect(generated.activities.filter((a) => a.date === "2026-11-09")).toEqual(
    held,
  );
  expect(generated.gentleDays).toEqual(["2026-11-09"]);
  expect(generated.gentleFocus).toEqual({ "2026-11-09": "focus" });
  expect(
    replanAfterBookings(p.data, ["2026-11-09"]).weeks["2026-11-09"].gentleDays,
  ).toEqual(["2026-11-09"]);
  expect(canReplanActivity(pass("held", { source: "generated" }), p.data)).toBe(
    false,
  );
});
it("avvisar trasiga datum och bevarar äldre säkerhetskopior", () => {
  const d = fixture();
  expect(() => decodeData(JSON.stringify(d))).not.toThrow();
  d.weeks["2026-11-09"].gentleDays = ["2026-11-20"];
  expect(() => decodeData(JSON.stringify(d))).toThrow();
});
it("en genomförd liten insats leder inte till ett nytt krav i dagstarten", () => {
  const p = previewGentleDay(fixture(), "pass:focus", 15);
  p.data.tasks.push({
    id: "extra",
    title: "Ännu ett jobb",
    goalId: "g",
    done: false,
    estimatedMinutes: 60,
  });
  p.data.weeks["2026-11-09"].activities.find((a) => a.id === "focus")!.status =
    "done";
  expect(dailyStart(p.data).recommendation).toBeUndefined();
  expect(dailyStart(p.data).gentleDone).toBe(true);
});
