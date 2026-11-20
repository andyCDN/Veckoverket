import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { addDays } from "../lib/date";
import { upgradePersonalWeek } from "../lib/personal-week";
import {
  assessWeek,
  budgetRemaining,
  capacity,
  categoryMinutes,
  generateWeek,
  validatePlan,
} from "../lib/planner";
import { replanAfterBookings } from "../lib/auto-planning";
import { previewWeeklyWork } from "../lib/weekly-work";
import {
  actionBookingSuggestions,
  bookCareerAction,
} from "../lib/career-actions";
import { bookCareerActivity } from "../lib/career-planning";
import { decodeData } from "../lib/storage";
import { templateSettings, weekendDays } from "../lib/week-template";
import type { Activity } from "../lib/types";

const week = "2026-11-23";
const boundary = { date: "2026-11-20", minute: 600 };
function fixture() {
  const data = createData();
  data.settings = templateSettings(data.settings);
  data.weeks = { [week]: generateWeek(week, data).plan };
  return data;
}
function booking(patch: Partial<Activity> = {}): Activity {
  return {
    id: "meeting",
    title: "Bokat möte",
    description: "Bevara",
    date: week,
    start: 570,
    end: 600,
    estimatedMinutes: 30,
    categoryId: "career",
    source: "manual",
    status: "planned",
    priority: 5,
    blockType: "locked",
    ...patch,
  };
}

describe("personlig fyradagarsvecka", () => {
  it.each(["old-rules", "missing-rules", "active-rules"])(
    "rättar en gammal framtidsvecka när mallen redan är aktiv: %s",
    (snapshot) => {
      const data = createData();
      const current = "2026-11-16";
      data.weeks = {
        [current]: generateWeek(current, data).plan,
        [week]: generateWeek(week, data).plan,
      };
      data.settings = templateSettings(data.settings);
      data.settings.autoPlanning = false;
      if (snapshot === "missing-rules") delete data.weeks[week].rules;
      if (snapshot === "active-rules")
        data.weeks[week].rules = structuredClone(data.settings);
      const original = structuredClone(data);
      const corrected = upgradePersonalWeek(data, boundary);
      const signature = (activities: Activity[]) =>
        activities.map(({ title, date, start, end }) => ({
          title,
          date,
          start,
          end,
        }));
      expect(signature(corrected.weeks[week].activities)).toEqual(
        signature(
          generateWeek(week, {
            ...data,
            settings: templateSettings(data.settings),
          }).plan.activities,
        ),
      );
      expect(corrected.settings.autoPlanning).toBe(false);
      expect(corrected.weeks[week].templateId).toBe("mon-thu-v1");
      expect(corrected.weeks[current]).toBe(data.weeks[current]);
      expect(data).toEqual(original);
      expect(upgradePersonalWeek(corrected, boundary)).toBe(corrected);
    },
  );

  it("behåller egna ändringar i en vecka som redan har uppdaterats", () => {
    const data = fixture();
    data.weeks[week].activities = data.weeks[week].activities.filter(
      (a) => a.categoryId !== "networking",
    );
    expect(upgradePersonalWeek(data, boundary)).toBe(data);
    expect(decodeData(JSON.stringify(data)).weeks[week].templateId).toBe(
      "mon-thu-v1",
    );
  });

  it("följer de angivna tiderna, lämnar luckor öppna och ger fredag–söndag helg", () => {
    const data = fixture();
    const plan = data.weeks[week];
    const days = Array.from({ length: 7 }, (_, day) =>
      plan.activities
        .filter((a) => a.date === addDays(week, day))
        .map((a) => [a.title, a.start, a.end]),
    );
    expect(days).toEqual([
      [
        ["Veckoincheck", 510, 540],
        ["Söka jobb", 540, 630],
        ["Träna", 630, 690],
        ["Lunch", 690, 750],
        ["Kompetensutveckling", 750, 840],
        ["Nätverksförfrågningar", 840, 900],
      ],
      [
        ["Söka jobb", 510, 600],
        ["Kompetensutveckling", 600, 690],
        ["Lunch", 690, 750],
      ],
      [
        ["Söka jobb", 510, 600],
        ["Kompetensutveckling", 600, 690],
        ["Lunch", 690, 750],
        ["Träna", 750, 810],
        ["Hämta", 900, 930],
      ],
      [
        ["Söka jobb", 510, 600],
        ["Träna", 600, 660],
        ["Kompetensutveckling", 660, 720],
        ["Lunch", 720, 780],
        ["Stänga veckan", 780, 810],
      ],
      [],
      [],
      [],
    ]);
    expect(weekendDays(data.settings)).toEqual([4, 5, 6]);
    expect(capacity(data.settings)).toBe(1260);
    expect(budgetRemaining(data.categories, data.settings)).toBe(270);
    expect(categoryMinutes(plan.activities)).toMatchObject({
      career: 360,
      networking: 60,
      learning: 330,
      health: 180,
      "weekly-planning": 60,
    });
    expect(assessWeek(plan, data)).toEqual([]);
    expect(decodeData(JSON.stringify(data)).settings).toEqual(data.settings);
    const repeated = generateWeek(week, data, plan);
    expect(repeated.plan.activities).toEqual(plan.activities);
    expect(repeated.conflicts).toEqual([]);
  });

  it("bevarar en krockande bokning och förklarar varför mallpasset saknas", () => {
    const data = fixture();
    const meeting = booking();
    data.weeks[week].activities.push(meeting);
    const result = generateWeek(week, data, data.weeks[week]);
    expect(result.plan.activities).toContain(meeting);
    expect(
      result.plan.activities.filter(
        (a) => a.date === week && a.categoryId === "career",
      ),
    ).toEqual([meeting]);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("malltiden upptas"),
      }),
    );
    expect(validatePlan(result.plan.activities, data.settings)).toEqual([]);
  });

  it.each(["career", "learning"])(
    "kopplar konkreta %s-uppgifter till passet och behåller återstående minuter vid omplanering",
    (categoryId) => {
      const data = fixture();
      data.goals = [
        {
          id: "goal",
          title: "Veckomål",
          description: "",
          categoryId,
          horizon: "week",
          week,
        },
      ];
      data.tasks = [
        {
          id: "task",
          goalId: "goal",
          title: "Ett konkret förstasteg",
          done: false,
        },
      ];
      const preview = previewWeeklyWork(
        data,
        week,
        [{ kind: "task", id: "task", minutes: 60 }],
        boundary,
      );
      expect(preview.reused).toBe(1);
      expect(preview.unplaced).toEqual([]);
      const task = preview.activities[0];
      const next = replanAfterBookings(preview.data, [week], boundary);
      const withinSlot = next.weeks[week].activities.filter(
        (a) => a.date === task.date && a.categoryId === categoryId,
      );
      expect(withinSlot).toContain(task);
      expect(withinSlot.reduce((sum, a) => sum + a.end - a.start, 0)).toBe(90);
      expect(
        withinSlot.some(
          (a) => a.source === "generated" && a.end - a.start === 30,
        ),
      ).toBe(true);
      expect(validatePlan(next.weeks[week].activities, data.settings)).toEqual(
        [],
      );
      expect(
        replanAfterBookings(next, [week], boundary).weeks[week].activities,
      ).toEqual(next.weeks[week].activities);
      expect(new Set(next.weeks[week].activities.map((a) => a.id)).size).toBe(
        next.weeks[week].activities.length,
      );
    },
  );

  it("kan flytta ett kopplat delpass till en öppen lucka utan att skapa dubbla id:n", () => {
    const data = fixture();
    data.goals = [
      {
        id: "goal",
        title: "Veckomål",
        description: "",
        categoryId: "career",
        horizon: "week",
        week,
      },
    ];
    data.tasks = [
      { id: "task", goalId: "goal", title: "Anpassa CV", done: false },
    ];
    const preview = previewWeeklyWork(
      data,
      week,
      [{ kind: "task", id: "task", minutes: 60 }],
      boundary,
    );
    const moved = {
      ...preview.activities[0],
      date: "2026-11-24",
      start: 750,
      end: 810,
    };
    preview.data.weeks[week].activities = preview.data.weeks[
      week
    ].activities.map((a) => (a.id === moved.id ? moved : a));
    const next = replanAfterBookings(preview.data, [week], boundary);
    const activities = next.weeks[week].activities;
    expect(activities).toContain(moved);
    expect(
      activities.find((a) => a.date === week && a.categoryId === "career"),
    ).toMatchObject({ start: 540, end: 630 });
    expect(new Set(activities.map((a) => a.id)).size).toBe(activities.length);
    expect(validatePlan(activities, data.settings)).toEqual([]);
    expect(
      replanAfterBookings(next, [week], boundary).weeks[week].activities,
    ).toEqual(activities);
  });

  it("bokar ansökans nästa steg inom jobbsökspasset även i en ännu osparad vecka", () => {
    const data = fixture();
    data.weeks = {};
    data.applications = [
      {
        id: "app",
        organization: "Bolaget",
        role: "Analytiker",
        status: "draft",
        deadline: "",
        nextAction: "",
        followUpDate: "",
        notes: "",
      },
    ];
    data.careerActions = [
      {
        id: "action",
        title: "Anpassa CV",
        date: week,
        owner: "Jag",
        reason: "Nästa steg",
        status: "open",
        applicationId: "app",
      },
    ];
    expect(
      actionBookingSuggestions(data, "action", 30, {
        date: week,
        minute: 500,
      })[0],
    ).toEqual({ date: week, start: 540, end: 570 });
    const result = bookCareerAction(data, "action", week, 570, 30, boundary);
    expect(result.errors).toEqual([]);
    expect(result.data.weeks[week].activities).toHaveLength(21);
    const next = replanAfterBookings(result.data, [week], boundary);
    expect(next.weeks[week].activities).toContain(result.activities[0]);
    expect(categoryMinutes(next.weeks[week].activities).career).toBe(360);
    expect(validatePlan(next.weeks[week].activities, data.settings)).toEqual(
      [],
    );
  });

  it("respekterar torsdagens senare lunch, veckostängning och arbetsdagens slut", () => {
    const data = fixture();
    const thursday = "2026-11-26";
    data.weeks[week].activities = [];
    const candidate = (start: number, end: number) =>
      booking({ date: thursday, start, end, estimatedMinutes: end - start });
    expect(bookCareerActivity(data, candidate(690, 720)).errors).toEqual([]);
    expect(bookCareerActivity(data, candidate(720, 750)).errors).not.toEqual(
      [],
    );
    data.weeks[week] = generateWeek(week, data).plan;
    expect(bookCareerActivity(data, candidate(780, 810)).errors).not.toEqual(
      [],
    );
    expect(bookCareerActivity(data, candidate(810, 840)).errors).not.toEqual(
      [],
    );
    expect(
      bookCareerActivity(data, booking({ date: "2026-11-27" })).errors,
    ).not.toEqual([]);
  });

  it.each([false, true])(
    "bevarar historik, utfall och egna bokningar när mallen redan är aktiv: %s",
    (alreadyActive) => {
      const data = createData();
      delete data.settings.weekTemplate;
      const current = "2026-11-16",
        past = "2026-11-09",
        empty = "2026-11-30";
      for (const key of [past, current, week])
        data.weeks[key] = generateWeek(key, data).plan;
      const done = data.weeks[week].activities.find(
        (a) => a.categoryId === "learning",
      )!;
      done.status = "done";
      const friday = booking({ id: "friday", date: "2026-11-27" });
      data.weeks[week].activities.push(friday);
      data.weeks[empty] = { ...generateWeek(empty, data).plan, activities: [] };
      if (alreadyActive) data.settings = templateSettings(data.settings);
      const before = structuredClone(data);
      const next = upgradePersonalWeek(data, boundary);
      expect(data).toEqual(before);
      expect(next.weeks[current]).toBe(data.weeks[current]);
      expect(next.weeks[past]).toBe(data.weeks[past]);
      expect(next.weeks[week].activities).toContain(done);
      expect(next.weeks[week].activities).toContain(friday);
      expect(validatePlan([friday], next.settings)).toEqual([]);
      expect(
        next.weeks[week].activities.filter(
          (a) => a.date >= "2026-11-27" && a.source === "generated",
        ),
      ).toEqual([]);
      expect(next.weeks[empty].activities).toEqual([]);
      expect(next.weeks[empty].rules?.weekTemplate).toBe("mon-thu-v1");
      expect(next.weeks[empty].targets).toMatchObject({
        career: 360,
        learning: 330,
        music: 0,
      });
      expect(upgradePersonalWeek(next, boundary)).toBe(next);
      expect(decodeData(JSON.stringify(next)).weeks).toEqual(next.weeks);
    },
  );

  it("fryser äldre veckors regler när säkerhetskopian saknar regelsnapshot och respekterar avstängd mall", () => {
    const data = createData();
    expect(upgradePersonalWeek(data, boundary)).toBe(data);
    delete data.settings.weekTemplate;
    const current = "2026-11-16";
    data.weeks[current] = {
      week: current,
      generatedAt: "",
      activities: [booking({ date: "2026-11-20" })],
    };
    const next = upgradePersonalWeek(data, boundary);
    expect(next.weeks[current].rules).toEqual(data.settings);
    expect(next.weeks[current].activities).toBe(data.weeks[current].activities);
    expect(next.settings.weekTemplate).toBe("mon-thu-v1");
  });

  it("återskapar inte passerade eller påbörjade pass mitt på dagen", () => {
    const data = fixture();
    const plan = data.weeks[week];
    const now = { date: week, minute: 600 };
    const earlier = plan.activities.filter(
      (a) => a.date === week && a.start < 600,
    );
    const next = generateWeek(week, data, plan, { notBefore: now });
    for (const activity of earlier)
      expect(next.plan.activities).toContain(activity);
    expect(next.plan.activities).toHaveLength(19);
    const empty = generateWeek(week, data, undefined, { notBefore: now });
    expect(
      empty.plan.activities
        .filter((a) => a.date === week)
        .every((a) => a.start >= 600),
    ).toBe(true);
  });
});
