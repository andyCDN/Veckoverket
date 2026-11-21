import { describe, expect, it } from "vitest";
import { initializePersonalSchedule } from "../lib/initialize-personal-schedule";
import { generateWeek, validatePlan } from "../lib/planner";
import { decodeData } from "../lib/storage";
import { previewWeeklyWork } from "../lib/weekly-work";
import { bookCareerActivity } from "../lib/career-planning";
import { previewGoogleImport } from "../lib/google-calendar";
import {
  overfilledWorkspace,
  overfilledWeek as week,
  learningActivity,
} from "./fixtures/overfilled-week";

const boundary = { date: "2026-11-21", minute: 600 };
const learning = (data: ReturnType<typeof overfilledWorkspace>, key = week) =>
  data.weeks[key].activities.filter(
    (a) =>
      a.status === "planned" && a.categoryId === "learning" && a.date === key,
  );
const minutes = (entries: ReturnType<typeof learning>) =>
  entries.reduce((sum, a) => sum + a.end - a.start, 0);

describe("veckoschemat styr även äldre pass, importer och nya bokningar", () => {
  it("behåller ett faktiskt intervjumöte som en fast bokning", () => {
    const data = overfilledWorkspace();
    const interview = learningActivity({
      id: "interview",
      title: "Intervju hos Bolaget",
      categoryId: "career",
      applicationId: "application",
      blockType: "locked",
      start: 630,
      end: 690,
    });
    data.weeks[week].activities.push(interview);
    const fixed = initializePersonalSchedule(data, boundary);
    expect(fixed.weeks[week].activities).toContain(interview);
    expect(minutes(learning(fixed))).toBe(90);
  });
  it("räknar även dubbla importer inom rätt tidsfönster mot dagens gräns", () => {
    const data = initializePersonalSchedule(overfilledWorkspace(), boundary);
    const imported = overfilledWorkspace().weeks[week].activities.find(
      (a) => a.id === "google-learning",
    )!;
    const first = {
      ...imported,
      id: "first",
      categoryId: "learning",
      title: "Kurs A",
      start: 750,
      end: 840,
    };
    const second = { ...first, id: "second", title: "Kurs B" };
    expect(
      validatePlan([first, second], data.settings).some((c) =>
        c.id.startsWith("schedule-budget"),
      ),
    ).toBe(true);
    const renamed = {
      ...imported,
      id: "suffix",
      title: "Kompetensutveckling (återkommande)",
    };
    data.weeks[week].activities.push(renamed);
    const fixed = initializePersonalSchedule(data, boundary);
    expect(fixed.weeks[week].activities.some((a) => a.id === "suffix")).toBe(
      false,
    );
    expect(minutes(learning(fixed))).toBe(90);
  });
  it("ersätter en överfylld måndag med exakt 90 minuter 12.30–14.00 oavsett äldre källor", () => {
    const data = overfilledWorkspace(),
      before = structuredClone(data);
    expect(minutes(learning(data))).toBeGreaterThan(90);
    const fixed = initializePersonalSchedule(data, boundary);
    expect(learning(fixed).map((a) => [a.start, a.end])).toEqual([[750, 840]]);
    expect(
      fixed.weeks[week].activities
        .filter((a) => a.categoryId === "learning" && a.status === "planned")
        .reduce((n, a) => n + a.end - a.start, 0),
    ).toBe(330);
    expect(
      fixed.weeks[week].activities.filter((a) => a.date === week),
    ).toHaveLength(6);
    expect(fixed.weeks[week].replacedActivities?.map((a) => a.id)).toEqual(
      expect.arrayContaining([
        "old-learning-series",
        "manual-extra",
        "google-learning",
        "linked-course",
      ]),
    );
    expect(fixed.tasks.find((t) => t.id === "course-task")?.needsPlanning).toBe(
      true,
    );
    expect(data).toEqual(before);
    const stored = decodeData(JSON.stringify(fixed));
    expect(initializePersonalSchedule(stored, boundary)).toBe(stored);
    expect(
      minutes(
        learning({
          ...fixed,
          weeks: {
            ...fixed.weeks,
            [week]: generateWeek(week, fixed, fixed.weeks[week]).plan,
          },
        }),
      ),
    ).toBe(90);
    const next = "2026-11-30";
    const future = generateWeek(next, fixed).plan;
    expect(
      minutes(learning({ ...fixed, weeks: { [next]: future } }, next)),
    ).toBe(90);
    expect(
      future.activities.some((a) => a.recurrenceId === "learning-series"),
    ).toBe(false);
  });

  it("reparerar även nya extrablock efter version 2 utan att bara lita på en migrationsmarkering", () => {
    const data = initializePersonalSchedule(overfilledWorkspace(), boundary);
    data.weeks[week].activities.push(
      learningActivity({ id: "new-overflow", start: 900, end: 990 }),
    );
    const fixed = initializePersonalSchedule(data, boundary);
    expect(minutes(learning(fixed))).toBe(90);
    expect(
      fixed.weeks[week].replacedActivities?.some(
        (a) => a.id === "new-overflow",
      ),
    ).toBe(true);
    expect(initializePersonalSchedule(fixed, boundary)).toBe(fixed);
  });

  it("låter konkret kursarbete konsumera schemapasset utan att lägga 90 minuter ovanpå", () => {
    const data = initializePersonalSchedule(overfilledWorkspace(), boundary);
    const actual = learningActivity({
      id: "real-work",
      title: "Kursmoment",
      start: 765,
      end: 795,
      taskId: "course-task",
    });
    data.weeks[week].activities.push(actual);
    const fixed = initializePersonalSchedule(data, boundary);
    expect(fixed.weeks[week].activities).toContain(actual);
    expect(learning(fixed).map((a) => [a.start, a.end])).toEqual([
      [750, 765],
      [765, 795],
      [795, 840],
    ]);
    expect(minutes(learning(fixed))).toBe(90);
    expect(validatePlan(fixed.weeks[week].activities, fixed.settings)).toEqual(
      [],
    );
  });

  it("behåller borttaget uppgiftsarbete även om dess gamla id återanvänds av det nya schemapasset", () => {
    const data = overfilledWorkspace();
    const id = `${week}-template-monday-learning`;
    data.weeks[week].activities = data.weeks[week].activities.filter(
      (a) => a.id !== id,
    );
    const work = learningActivity({
      id,
      title: "Gammalt kursarbete",
      taskId: "course-task",
      start: 900,
      end: 990,
    });
    data.weeks[week].activities.push(work);
    const fixed = initializePersonalSchedule(data, boundary);
    expect(fixed.weeks[week].replacedActivities).toContain(work);
    expect(minutes(learning(fixed))).toBe(90);
    expect(fixed.tasks.find((t) => t.id === "course-task")?.needsPlanning).toBe(
      true,
    );
    expect(() => decodeData(JSON.stringify(fixed))).not.toThrow();
  });

  it("stoppar extra lärandebokning i ett öppet hål men tillåter konkret arbete i schemapasset", () => {
    const data = initializePersonalSchedule(overfilledWorkspace(), boundary);
    const outside = learningActivity({
      id: "new",
      title: "Ny kurs",
      start: 900,
      end: 960,
    });
    expect(
      validatePlan([outside], data.settings).some(
        (c) => c.id === "schedule-new",
      ),
    ).toBe(true);
    expect(bookCareerActivity(data, outside).errors).not.toEqual([]);
    const inside = { ...outside, start: 750, end: 780, estimatedMinutes: 30 };
    const result = bookCareerActivity(data, inside);
    expect(result.errors).toEqual([]);
    expect(minutes(learning(result.data))).toBe(90);
  });

  it("lägger inte uppgiften i ledig tid när de 90 lärandeminuterna redan används", () => {
    const data = initializePersonalSchedule(overfilledWorkspace(), boundary);
    const first = previewWeeklyWork(
      data,
      week,
      [{ kind: "task", id: "course-task", date: week, minutes: 60 }],
      boundary,
    );
    expect(first.activities).toHaveLength(1);
    first.data.tasks.push({
      id: "second",
      goalId: "course-goal",
      title: "Mer lärande",
      done: false,
      needsPlanning: true,
    });
    const next = previewWeeklyWork(
      first.data,
      week,
      [{ kind: "task", id: "second", date: week, minutes: 60 }],
      boundary,
    );
    expect(next.activities).toEqual([]);
    expect(next.unplaced.join(" ")).toContain("veckoschemats pass");
    expect(minutes(learning(next.data))).toBe(90);
  });

  it("Google-uppdatering återinför inte gamla kompetenspass, även om ett eget möte ger en krock", () => {
    const data = initializePersonalSchedule(overfilledWorkspace(), boundary);
    const external = overfilledWorkspace().weeks[week].activities.find(
      (a) => a.id === "google-learning",
    )!;
    const ownMeeting = {
      ...external,
      id: "meeting",
      title: "Bokat möte",
      categoryId: "google-calendar",
      start: 780,
      end: 810,
      external: { ...external.external!, eventId: "meeting" },
    };
    let current = data;
    for (let i = 0; i < 3; i++) {
      current = previewGoogleImport(
        current,
        {
          week,
          calendarIds: ["test-calendar"],
          activities: [external, ownMeeting],
          importedAt: "2026-11-21T10:00:00Z",
          deleted: [],
        },
        false,
      ).data;
      expect(minutes(learning(current))).toBe(90);
      expect(
        current.weeks[week].activities.some((a) => a.id === "google-learning"),
      ).toBe(false);
      expect(
        current.weeks[week].activities.some((a) => a.id === "meeting"),
      ).toBe(true);
    }
  });
});
