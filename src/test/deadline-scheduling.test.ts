import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import {
  bookDeadlineWork,
  deadlineTiming,
  deadlineWork,
  upcomingDeadlineWork,
} from "../lib/deadline-scheduling";
import { decodeData } from "../lib/storage";
import type { Activity } from "../lib/types";
const date = "2026-10-30",
  week = "2026-10-26",
  boundary = { date, minute: 600 };
function fixture() {
  const data = createData();
  data.settings = {
    ...data.settings,
    start: 480,
    end: 1020,
    lunchStart: 720,
    lunchEnd: 780,
    familyStart: 1020,
    familyEnd: 1080,
    buffer: 10,
    musicMornings: 0,
    trainingSessions: 0,
  };
  data.weeks = {
    [week]: { week, generatedAt: "", activities: [], weeklyRoutinesFrom: week },
  };
  data.applications = [
    {
      id: "a",
      role: "Analytiker",
      organization: "Bolaget",
      status: "draft",
      deadline: date,
      nextAction: "Behåll",
      followUpDate: "",
      notes: "Egna anteckningar",
    },
  ];
  return data;
}
function activity(
  id: string,
  start: number,
  end: number,
  extra: Partial<Activity> = {},
): Activity {
  return {
    id,
    title: "Jobbsök",
    description: "",
    categoryId: "career",
    date,
    start,
    end,
    estimatedMinutes: end - start,
    blockType: "flexible",
    status: "planned",
    source: "generated",
    priority: 3,
    ...extra,
  };
}
const key = "application-deadline-a";
describe("deadlines i dagsplanen", () => {
  it("bokar ett 60-minuterspass för ett utkast och bevarar arbetsyta och avklarat innehåll", () => {
    const d = fixture();
    const done = activity("done", 480, 540, { status: "done" });
    const manual = activity("manual", 840, 900, {
      source: "manual",
      title: "Eget pass",
    });
    d.weeks[week].activities = [done, manual];
    const original = structuredClone(d);
    const r = bookDeadlineWork(d, key, boundary);
    expect(r.errors).toEqual([]);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0]).toMatchObject({
      date,
      start: 950,
      end: 1010,
      applicationId: "a",
      deadlineId: key,
    });
    expect(d).toEqual(original);
    expect(r.data.weeks[week].activities).toContain(done);
    expect(r.data.weeks[week].activities).toContain(manual);
    expect(r.data.applications).toBe(d.applications);
    expect(r.data.tasks).toBe(d.tasks);
    expect(decodeData(JSON.stringify(r.data))).toEqual(r.data);
    expect(bookDeadlineWork(r.data, key, boundary).data).toBe(r.data);
  });
  it("behåller giltiga importer med långa ansöknings-id:n läsbara efter bokning", () => {
    const d = fixture();
    d.applications![0].id = "a".repeat(200);
    const work = deadlineWork(d)[0];
    expect(work.deadline.id.length).toBeLessThanOrEqual(200);
    const result = bookDeadlineWork(d, work.deadline.id, boundary);
    expect(result.errors).toEqual([]);
    expect(decodeData(JSON.stringify(result.data))).toEqual(result.data);
  });
  it("ger ett befintligt automatiskt pass den konkreta uppgiften med bibehållen tid, längd och målkoppling", () => {
    const d = fixture();
    const pass = activity("slot", 900, 990, {
      goalId: "goal",
      description: "Befintligt underlag",
    });
    const held = [
      activity("started", 590, 650),
      activity("done", 660, 710, { status: "done" }),
      activity("manual", 800, 860, { source: "manual" }),
    ];
    d.weeks[week].activities = [...held, pass];
    const original = structuredClone(d);
    const r = bookDeadlineWork(d, key, boundary);
    expect(r.errors).toEqual([]);
    expect(r.data.weeks[week].activities).toHaveLength(4);
    expect(r.activities[0]).toMatchObject({
      id: "slot",
      start: pass.start,
      end: pass.end,
      estimatedMinutes: 90,
      categoryId: "career",
      goalId: "goal",
      source: "manual",
      status: "planned",
    });
    expect(r.activities[0].description).toContain("Befintligt underlag");
    expect(r.activities[0].description).toContain("Tidigare pass: Jobbsök");
    for (const a of held) expect(r.data.weeks[week].activities).toContain(a);
    expect(d).toEqual(original);
  });
  it("använder delstegen i stället för ett extra standardpass för samma ansökan", () => {
    const d = fixture();
    d.deadlines = [
      {
        id: "d",
        title: "Ansökan",
        date,
        minute: 1020,
        categoryId: "career",
        applicationId: "a",
        steps: [
          { id: "cv", title: "CV", minutes: 30 },
          { id: "send", title: "Skicka", minutes: 15 },
        ],
      },
    ];
    expect(deadlineWork(d).map((w) => w.deadline.id)).toEqual(["d"]);
    const r = bookDeadlineWork(d, "d", boundary);
    expect(r.errors).toEqual([]);
    expect(r.activities).toHaveLength(2);
    expect(r.activities[0].end + 10).toBeLessThanOrEqual(r.activities[1].start);
    expect(r.activities.at(-1)!.end).toBeLessThanOrEqual(1020);
  });
  it("använder den tidigare standardbokningen när egna delsteg läggs till", () => {
    const d = fixture();
    const initial = bookDeadlineWork(d, key, boundary).data;
    const pass = initial.weeks[week].activities.find(
      (a) => a.deadlineId === key,
    )!;
    const next = {
      ...initial,
      deadlines: [
        {
          id: "d",
          title: "Ansökan",
          date,
          minute: 1020,
          categoryId: "career",
          applicationId: "a",
          steps: [
            { id: "cv", title: "CV", minutes: 30 },
            { id: "send", title: "Skicka", minutes: 30 },
          ],
        },
      ],
    };
    const r = bookDeadlineWork(next, "d", boundary);
    expect(r.errors).toEqual([]);
    expect(r.data.weeks[week].activities).toHaveLength(2);
    expect(
      r.data.weeks[week].activities.find((a) => a.id === pass.id),
    ).toMatchObject({ start: pass.start, end: pass.end, deadlineId: "d" });
    expect(
      r.data.weeks[week].activities.some((a) => a.deadlineId === key),
    ).toBe(false);
    expect(deadlineWork(r.data)).toHaveLength(1);
  });
  it("kan inte delvis ändra ett befintligt pass när hela följden inte ryms", () => {
    const d = fixture();
    d.weeks[week].activities = [activity("slot", 900, 990)];
    d.deadlines = [
      {
        id: "d",
        title: "Stor uppgift",
        date,
        minute: 1020,
        categoryId: "career",
        steps: [
          { id: "large", title: "Stort", minutes: 480 },
          { id: "small", title: "Litet", minutes: 60 },
        ],
      },
    ];
    const old = structuredClone(d);
    const r = bookDeadlineWork(d, "d", boundary);
    expect(r.errors).toHaveLength(1);
    expect(r.data).toBe(d);
    expect(d).toEqual(old);
  });
  it("bokar tillagda delsteg utan att göra om eller flytta genomfört arbete", () => {
    const d = fixture();
    d.deadlines = [
      {
        id: "d",
        title: "Ansökan",
        date,
        minute: 1020,
        categoryId: "career",
        steps: [
          { id: "cv", title: "CV", minutes: 30 },
          { id: "send", title: "Skicka", minutes: 30 },
        ],
      },
    ];
    const completed = activity("old", 480, 510, {
      source: "manual",
      status: "done",
      deadlineId: "d",
      deadlineStepId: "cv",
    });
    d.weeks[week].activities = [completed];
    const r = bookDeadlineWork(d, "d", boundary);
    expect(r.errors).toEqual([]);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0].deadlineStepId).toBe("send");
    expect(r.data.weeks[week].activities).toContain(completed);
    expect(bookDeadlineWork(r.data, "d", boundary).data).toBe(r.data);
  });
  it("bokar inte arbete för redan skickade ansökningar, i förfluten tid eller efter arbetsdagens gräns", () => {
    const d = fixture();
    d.applications![0].status = "sent";
    expect(deadlineWork(d)).toEqual([]);
    d.applications![0].status = "draft";
    const r = bookDeadlineWork(d, key, { date, minute: 1015 });
    expect(r.errors).toHaveLength(1);
    expect(r.data).toBe(d);
    expect(r.activities).toEqual([]);
    d.applications![0].deadline = "2026-10-29";
    expect(bookDeadlineWork(d, key, boundary).errors).toHaveLength(1);
  });
  it("visar datum och arbetstid i dagsöversikten och upptäcker missade eller för sent bokade pass", () => {
    const d = fixture();
    expect(upcomingDeadlineWork(d, "2026-10-29")).toHaveLength(1);
    const work = deadlineWork(d)[0];
    expect(deadlineTiming(work, boundary)).toContain("saknar bokning");
    expect(
      deadlineTiming(
        { ...work, activities: [activity("late", 1000, 1100)] },
        boundary,
      ),
    ).toContain("efter deadline");
    expect(
      deadlineTiming(
        {
          ...work,
          activities: [activity("missed", 800, 860, { status: "skipped" })],
        },
        boundary,
      ),
    ).toContain("följas upp");
    expect(
      deadlineTiming(
        {
          ...work,
          activities: [
            activity("done", 800, 860, {
              status: "done",
              deadlineStepId: "work",
            }),
          ],
        },
        boundary,
      ),
    ).toContain("genomförda");
  });
});
