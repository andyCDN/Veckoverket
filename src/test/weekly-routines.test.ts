import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import {
  generateWeek,
  assessWeek,
  validatePlan,
  categoryMinutes,
} from "../lib/planner";
import {
  addWeeklyRoutines,
  upgradeWeeklyRoutines,
  ROUTINE_CATEGORY,
} from "../lib/weekly-routines";
import { decodeData } from "../lib/storage";
import { resetPlanning } from "../lib/reset-planning";
import type { Activity } from "../lib/types";

const week = "2026-11-02";
const booking = (overrides: Partial<Activity> = {}): Activity => ({
  id: "booking",
  title: "Bokad tid",
  description: "",
  categoryId: "career",
  date: week,
  start: 510,
  end: 930,
  estimatedMinutes: 420,
  source: "manual",
  blockType: "locked",
  status: "planned",
  priority: 5,
  ...overrides,
});
describe("veckostart och veckoavstämning", () => {
  it("bokar kort måndagsstart och fredagsövning utan överlappning och visar deras verkliga kostnad", () => {
    const data = createData();
    const { plan, conflicts } = generateWeek(week, data);
    const routines = plan.activities.filter((a) => a.routine);
    expect(routines.map((a) => [a.routine, a.date, a.end - a.start])).toEqual([
      ["week-start", week, 15],
      ["week-review", "2026-11-06", 30],
    ]);
    expect(routines[0].start).toBe(data.settings.start);
    expect(routines[1].end).toBe(data.settings.familyStart);
    expect(categoryMinutes(plan.activities)[ROUTINE_CATEGORY.id]).toBe(45);
    expect(categoryMinutes(plan.activities).health).toBe(180);
    expect(validatePlan(plan.activities, data.settings)).toEqual([]);
    expect(conflicts).toContainEqual(
      expect.objectContaining({
        id: "budget-career",
        message: expect.stringContaining("15 minuter"),
      }),
    );
    expect(conflicts).toContainEqual(
      expect.objectContaining({
        id: "budget-learning",
        message: expect.stringContaining("30 minuter"),
      }),
    );
  });
  it("bevarar genomförda rutiner och skapar inga dubbletter vid ny generering", () => {
    const data = createData();
    const plan = generateWeek(week, data).plan;
    const start = plan.activities.find((a) => a.routine === "week-start")!;
    start.status = "done";
    const next = generateWeek(week, data, plan).plan;
    expect(next.activities.filter((a) => a.routine)).toHaveLength(2);
    expect(next.activities).toContainEqual(start);
    expect(new Set(next.activities.map((a) => a.id)).size).toBe(
      next.activities.length,
    );
  });
  it("ger en förklaring när egna bokningar fyller dagen utan att flytta dem", () => {
    const data = createData();
    const original = booking();
    const plan = addWeeklyRoutines(
      { week, activities: [original], generatedAt: "" },
      data.settings,
      data.categories,
    );
    expect(plan.activities).toContainEqual(original);
    expect(plan.activities.some((a) => a.routine === "week-start")).toBe(false);
    expect(assessWeek(plan, data)).toContainEqual(
      expect.objectContaining({ id: "routine-week-start" }),
    );
    expect(
      validatePlan(plan.activities, data.settings).filter((c) =>
        c.id.startsWith("overlap"),
      ),
    ).toEqual([]);
  });
  it.each(["manual", "recurring", "external"] as const)(
    "trimmar inte %s, genomförda eller skyddade aktiviteter",
    (source) => {
      const data = createData();
      const protectedBookings = [
        booking({ source, blockType: "flexible" }),
        booking({
          id: "friday",
          date: "2026-11-06",
          source: "generated",
          status: "done",
          blockType: "flexible",
        }),
      ];
      const plan = addWeeklyRoutines(
        { week, activities: protectedBookings, generatedAt: "" },
        data.settings,
        data.categories,
      );
      expect(plan.activities).toEqual(protectedBookings);
    },
  );
  it("respekterar buffert och minsta blocklängd när genererade förslag kortas", () => {
    const data = createData();
    data.settings.buffer = 10;
    const donor = booking({ source: "generated", blockType: "flexible" });
    const plan = addWeeklyRoutines(
      { week, activities: [donor], generatedAt: "" },
      data.settings,
      data.categories,
    );
    const start = plan.activities.find((a) => a.routine === "week-start")!;
    const remainder = plan.activities.find((a) => a.id === donor.id)!;
    expect(remainder.start - start.end).toBe(10);
    expect(remainder.end - remainder.start).toBeGreaterThanOrEqual(30);
    expect(validatePlan(plan.activities, data.settings)).toEqual([]);
  });
  it("lägger bara in rutiner på valda vardagar och visar datum korrekt vid årsskiftet", () => {
    const data = createData();
    data.settings.days = [4];
    const plan = generateWeek("2026-12-28", data).plan;
    expect(plan.activities.filter((a) => a.routine).map((a) => a.date)).toEqual(
      ["2027-01-01"],
    );
  });
  it("uppgraderar befintliga veckor en gång och bevarar förflutna datum och nollställda veckor", () => {
    const data = createData();
    data.categories = data.categories.filter(
      (c) => c.id !== ROUTINE_CATEGORY.id,
    );
    for (const w of ["2026-10-19", "2026-10-26", week])
      data.weeks[w] = generateWeek(w, data).plan;
    const before = structuredClone(data);
    const upgraded = upgradeWeeklyRoutines(data, "2026-10-29");
    expect(upgraded.weeks["2026-10-19"]).toEqual(before.weeks["2026-10-19"]);
    expect(
      upgraded.weeks["2026-10-26"].activities.filter(
        (a) => a.date < "2026-10-29",
      ),
    ).toEqual(
      before.weeks["2026-10-26"].activities.filter(
        (a) => a.date < "2026-10-29",
      ),
    );
    expect(
      upgraded.weeks[week].activities.filter((a) => a.routine),
    ).toHaveLength(2);
    expect(upgradeWeeklyRoutines(upgraded, "2026-10-29")).toBe(upgraded);
    const empty = resetPlanning(upgraded, week);
    expect(upgradeWeeklyRoutines(empty, week)).toBe(empty);
  });
  it("bevarar övningar och anteckningar i säkerhetskopior och avvisar felaktiga extrafält", () => {
    const data = createData();
    data.weeks[week] = generateWeek(week, data).plan;
    data.reflections[week] = {
      week,
      good: "Sammanfattning",
      unfinished: "",
      balance: "",
      next: "Nästa veckas bokningar",
      startPlan: "Prioriteringar",
      goalReview: "Ett mål klart",
      updatedAt: "",
    };
    expect(decodeData(JSON.stringify(data))).toEqual(data);
    const invalid = structuredClone(data);
    invalid.reflections[week].startPlan = 123 as unknown as string;
    expect(() => decodeData(JSON.stringify(invalid))).toThrow();
  });
});
