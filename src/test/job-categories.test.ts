import { describe, it, expect } from "vitest";
import { createData } from "../lib/defaults";
import { separateJobCategories, changeJobBudget } from "../lib/job-categories";
import { decodeData } from "../lib/storage";
import { generateWeek, categoryMinutes, validatePlan } from "../lib/planner";
import { canFollowUp } from "../lib/follow-up";
const week = "2026-11-02";
describe("jobbsök och nätverkande", () => {
  it("delar endast den gamla gemensamma budgeten och bevarar planer, historiska mål, utfall och kopplingar", () => {
    const d = createData();
    d.categories = d.categories.filter((c) => c.id !== "networking");
    d.categories.find((c) => c.id === "career")!.targetMinutes = 480;
    d.weeks[week] = generateWeek(week, d).plan;
    d.weeks[week].activities[0].status = "done";
    const original = structuredClone(d);
    const migrated = decodeData(JSON.stringify(d));
    expect(
      migrated.categories.find((c) => c.id === "career")?.targetMinutes,
    ).toBe(360);
    expect(
      migrated.categories.find((c) => c.id === "networking")?.targetMinutes,
    ).toBe(120);
    expect(migrated.weeks).toEqual(original.weeks);
    expect(migrated.goals).toEqual(original.goals);
    expect(migrated.tasks).toEqual(original.tasks);
    expect(separateJobCategories(migrated)).toBe(migrated);
    expect(decodeData(JSON.stringify(migrated))).toEqual(migrated);
    expect(d).toEqual(original);
  });
  it("behåller 75/25 när något av tidsmålen redigeras", () => {
    let cats = changeJobBudget(createData().categories, "career", 360);
    expect(cats.find((c) => c.id === "networking")?.targetMinutes).toBe(120);
    cats = changeJobBudget(cats, "networking", 60);
    expect(cats.find((c) => c.id === "career")?.targetMinutes).toBe(180);
  });
  it.each([false, true])(
    "planerar kategorierna var för sig utan krockar, automatisk: %s",
    (autoPlanning) => {
      const d = createData();
      d.settings.autoPlanning = autoPlanning;
      const result = generateWeek(week, d);
      const totals = categoryMinutes(result.plan.activities);
      expect(totals.career).toBeGreaterThan(0);
      expect(totals.networking).toBeGreaterThan(0);
      expect(
        totals.career / (totals.career + totals.networking),
      ).toBeGreaterThanOrEqual(0.7);
      expect(
        totals.career / (totals.career + totals.networking),
      ).toBeLessThanOrEqual(0.8);
      expect(validatePlan(result.plan.activities, d.settings)).toEqual([]);
      const network = result.plan.activities.find(
        (a) => a.categoryId === "networking",
      )!;
      expect(canFollowUp(network)).toBe(true);
    },
  );
  it("fördelar även överskott mellan båda kategorierna", () => {
    const d = createData();
    d.settings.musicMornings = 1;
    const { plan } = generateWeek(week, d);
    const totals = categoryMinutes(plan.activities);
    expect(totals.career + totals.networking).toBeGreaterThan(300);
    expect(
      totals.career / (totals.career + totals.networking),
    ).toBeGreaterThanOrEqual(0.7);
    expect(
      totals.career / (totals.career + totals.networking),
    ).toBeLessThanOrEqual(0.8);
    expect(validatePlan(plan.activities, d.settings)).toEqual([]);
  });
});
