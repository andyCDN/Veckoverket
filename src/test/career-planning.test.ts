import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import type { Activity, Deadline } from "../lib/types";
import {
  bookCareerActivity,
  planDeadline,
  replanDay,
} from "../lib/career-planning";
import { decodeData } from "../lib/storage";
import { googleEventActivities } from "../lib/google-calendar";
import { generateWeek, validatePlan } from "../lib/planner";
import { monday } from "../lib/date";
const date = "2026-10-29",
  week = monday(date),
  boundary = { date, minute: 600 };
function activity(
  id: string,
  start: number,
  end: number,
  extra: Partial<Activity> = {},
): Activity {
  return {
    id,
    title: id,
    description: "",
    categoryId: "career",
    date,
    start,
    end,
    estimatedMinutes: end - start,
    blockType: "flexible",
    priority: 3,
    status: "planned",
    source: "manual",
    ...extra,
  };
}
function fixture() {
  const d = createData();
  d.settings = {
    ...d.settings,
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
  d.weeks = {
    [week]: { week, activities: [], generatedAt: "", weeklyRoutinesFrom: week },
  };
  return d;
}
const deadline = (): Deadline => ({
  id: "deadline",
  title: "Ansökan",
  date,
  minute: 1020,
  categoryId: "career",
  steps: [
    { id: "cv", title: "CV", minutes: 60 },
    { id: "send", title: "Skicka", minutes: 30 },
  ],
});
function external() {
  return googleEventActivities(
    { id: "calendar", summary: "Bokningar" },
    [
      {
        id: "meeting",
        summary: "Intervju",
        start: { dateTime: `${date}T14:00:00+01:00` },
        end: { dateTime: `${date}T15:00:00+01:00` },
      },
    ],
    week,
  );
}

describe("resten av dagen", () => {
  it("bevarar historia, genomförda, påbörjade, skyddade, låsta, återkommande och importerade pass", () => {
    const d = fixture();
    const held = [
      activity("done", 480, 510, { status: "done" }),
      activity("started", 590, 610),
      activity("locked", 660, 690, { blockType: "locked" }),
      activity("protected", 800, 830, { blockType: "protected" }),
      activity("recurring", 930, 950, { recurrenceId: "r" }),
      activity("skipped", 620, 640, { status: "skipped" }),
      activity("yesterday", 480, 540, { date: "2026-10-28" }),
      ...external(),
    ];
    d.categories.push({
      id: "google-calendar",
      name: "Kalender",
      color: "#123456",
      targetMinutes: 0,
      priority: 5,
      minBlock: 5,
      allowSplit: false,
      movable: false,
    });
    d.weeks[week].activities = [...held, activity("move", 970, 1000)];
    const original = structuredClone(d);
    const result = replanDay(d, boundary);
    expect(result.errors).toEqual([]);
    expect(result.activities[0]).toMatchObject({ id: "move", start: 960 }); // First free 30-minute slot is 960 after buffers.
    expect(d).toEqual(original);
    for (const a of held)
      expect(
        result.data.weeks[week].activities.find((x) => x.id === a.id),
      ).toEqual(a);
  });
  it("prioriterar utan att tappa längd eller ändra andra dagar och kan inte delvis skriva en plan", () => {
    const d = fixture();
    d.weeks[week].activities = [
      activity("low", 900, 930),
      activity("high", 950, 980, { priority: 5 }),
    ];
    const r = replanDay(d, boundary);
    expect(r.errors).toEqual([]);
    expect(
      r.data.weeks[week].activities.find((a) => a.id === "high")?.start,
    ).toBe(600);
    expect(
      r.data.weeks[week].activities.find((a) => a.id === "low")?.start,
    ).toBe(640);
    expect(validatePlan(r.data.weeks[week].activities, d.settings)).toEqual([]);
    const failed = replanDay(d, { date, minute: 970 });
    expect(failed.data).toBe(d); // Started passes are held.
  });
  it("behåller originalet om alla flyttbara pass inte ryms", () => {
    const d = fixture();
    d.weeks[week].activities = [activity("long", 900, 1200)];
    const r = replanDay(d, boundary);
    expect(r.errors).toHaveLength(1);
    expect(r.data).toBe(d);
  });
});

describe("bakåtplanering", () => {
  it("placerar delsteg i ordning före deadline och runt kalenderimport, lunch och buffert", () => {
    const d = fixture();
    d.weeks[week].activities = external();
    const original = structuredClone(d);
    const r = planDeadline(d, deadline(), boundary);
    expect(r.errors).toEqual([]);
    expect(r.activities).toHaveLength(2);
    expect(r.activities[0].end + 10).toBeLessThanOrEqual(r.activities[1].start);
    expect(r.activities.at(-1)?.end).toBe(1010);
    expect(r.activities.every((a) => a.start >= 600 && a.date === date)).toBe(
      true,
    );
    expect(validatePlan(r.data.weeks[week].activities, d.settings)).toEqual([]);
    expect(d).toEqual(original);
    expect(r.data.weeks[week].activities[0]).toEqual(
      d.weeks[week].activities[0],
    );
    expect(planDeadline(r.data, deadline(), boundary).errors[0]).toContain(
      "redan kalenderpass",
    );
  });
  it("söker över veckogräns och bevarar redan sparade veckor, uppgifter och utfall", () => {
    const d = fixture(),
      dl = deadline();
    dl.date = "2026-11-02";
    dl.minute = 525;
    dl.steps = [
      { id: "prepare", title: "Förbered", minutes: 120 },
      { id: "send", title: "Skicka", minutes: 20 },
    ];
    const done = activity("done", 480, 540, { status: "done" });
    d.weeks[week].activities = [done];
    const r = planDeadline(d, dl, boundary);
    expect(r.errors).toEqual([]);
    expect(r.activities[0].date).toBe("2026-10-30");
    expect(r.activities[1].date).toBe("2026-11-02");
    expect(r.data.weeks[week].activities).toContainEqual(done);
    expect(r.data.goals).toBe(d.goals);
    expect(r.data.tasks).toBe(d.tasks);
  });
  it("avvisar kapacitetsbrist och ogiltiga deadlines atomiskt", () => {
    const d = fixture(),
      dl = deadline();
    dl.minute = 610;
    const r = planDeadline(d, dl, boundary);
    expect(r.errors).toHaveLength(1);
    expect(r.data).toBe(d);
    expect(r.activities).toEqual([]);
    for (const date of ["2026-02-30", "2026-10-28", "2028-01-01"])
      expect(planDeadline(d, { ...dl, date }, boundary).errors).toHaveLength(1);
  });
  it("bevarar deadlinepass vid befintlig automatisk veckoplanering", () => {
    const d = fixture();
    const r = planDeadline(d, deadline(), boundary);
    const generated = generateWeek(
      week,
      { ...r.data, settings: { ...d.settings, autoPlanning: true } },
      r.data.weeks[week],
      { notBefore: boundary },
    );
    for (const a of r.activities)
      expect(generated.plan.activities).toContainEqual(a);
  });
});

describe("jobbdata och kalenderbokning", () => {
  it("läser gamla säkerhetskopior och rundreser ansökningar, loggar, deadlines och kalenderkopplingar", () => {
    const d = fixture();
    expect(decodeData(JSON.stringify(d)).applications).toBeUndefined();
    d.applications = [
      {
        id: "a",
        organization: "Bolag",
        role: "Utvecklare",
        status: "sent",
        deadline: date,
        nextAction: "Följ upp",
        followUpDate: date,
        notes: "Anteckning",
      },
    ];
    d.contacts = [
      {
        id: "c",
        name: "Kim",
        organization: "Bolag",
        nextAction: "Ring",
        followUpDate: date,
        entries: [{ id: "e", date, channel: "E-post", notes: "Om tjänsten" }],
      },
    ];
    d.deadlines = [{ ...deadline(), applicationId: "a" }];
    const r = bookCareerActivity(
      d,
      activity("followup", 600, 630, { applicationId: "a", contactId: "c" }),
    );
    expect(r.errors).toEqual([]);
    const restored = decodeData(JSON.stringify(r.data));
    expect(restored.applications).toEqual(d.applications);
    expect(restored.contacts).toEqual(d.contacts);
    expect(restored.deadlines).toEqual(d.deadlines);
    expect(restored.weeks[week].activities[0]).toMatchObject({
      applicationId: "a",
      contactId: "c",
    });
    expect(bookCareerActivity(r.data, activity("overlap", 610, 640)).data).toBe(
      r.data,
    );
    expect(
      bookCareerActivity(d, activity("lunch", 730, 760)).errors,
    ).toHaveLength(1);
  });
  it("avvisar korrupta nya data utan att migrera eller radera äldre planer", () => {
    const d = fixture();
    for (const extra of [
      { applications: {} },
      {
        contacts: [
          {
            id: "x",
            name: "Kim",
            organization: "",
            nextAction: "",
            followUpDate: "2026-02-30",
            entries: [],
          },
        ],
      },
      {
        deadlines: [
          { ...deadline(), steps: [{ id: "s", title: "Steg", minutes: -10 }] },
        ],
      },
    ]) {
      expect(() => decodeData(JSON.stringify({ ...d, ...extra }))).toThrow();
    }
  });
});
