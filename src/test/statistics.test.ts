import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { periodStatistics } from "../lib/statistics";
import { googleEventActivities } from "../lib/google-calendar";
import { resetPlanning } from "../lib/reset-planning";
import type { Activity, AppData } from "../lib/types";
const current = "2026-10-29",
  week = "2026-10-26";
function activity(
  date: string,
  minutes: number,
  status: Activity["status"] = "planned",
): Activity {
  return {
    id: date + status,
    title: "Lärande",
    description: "",
    date,
    start: 540,
    end: 540 + minutes,
    estimatedMinutes: minutes,
    categoryId: "learning",
    blockType: "flexible",
    priority: 3,
    status,
    source: "manual",
  };
}
function plan(
  data: AppData,
  key: string,
  activities: Activity[],
  target = 120,
) {
  data.weeks[key] = {
    week: key,
    activities,
    generatedAt: "",
    rules: structuredClone(data.settings),
    targets: { learning: target },
  };
}
describe("uppföljning över flera veckor", () => {
  it("summerar sparade veckor och historiska tidsmål utan att skapa saknade veckor", () => {
    const data = createData();
    plan(data, "2026-10-12", [activity("2026-10-12", 60, "done")], 60);
    plan(
      data,
      week,
      [activity(week, 120), activity("2026-10-27", 30, "done")],
      180,
    );
    data.categories.find((c) => c.id === "learning")!.targetMinutes = 999;
    const before = structuredClone(data),
      stats = periodStatistics(data, week, 4, "learning", current);
    expect(stats).toMatchObject({
      planned: 210,
      done: 90,
      savedWeeks: 2,
      completion: 43,
    });
    expect(stats.rows[0].target).toBe(240);
    expect(
      periodStatistics(data, week, 4, "health", current).rows[0].target,
    ).toBe(0);
    expect(stats.weeks.filter((w) => !w.saved)).toHaveLength(2);
    expect(data).toEqual(before);
  });
  it("skiljer tom plan, ingen data och pågående vecka samt utesluter framtida veckor", () => {
    const data = createData();
    plan(data, week, []);
    plan(data, "2026-11-02", [activity("2026-11-02", 120, "done")]);
    const stats = periodStatistics(data, "2026-11-02", 12, "all", current);
    expect(stats.end).toBe(week);
    expect(stats.savedWeeks).toBe(1);
    expect(stats.completion).toBeNull();
    expect(stats.weeks.at(-1)).toMatchObject({
      saved: true,
      ongoing: true,
      planned: 0,
      done: 0,
    });
    expect(stats.weeks).toHaveLength(12);
  });
  it("räknar genomförda bokningar och överhoppad planerad tid men undantar lediga och heldagsposter", () => {
    const data = createData(),
      external = googleEventActivities(
        { id: "calendar", summary: "Kalender" },
        [
          {
            id: "busy",
            start: { dateTime: "2026-10-26T09:00:00+01:00" },
            end: { dateTime: "2026-10-26T10:00:00+01:00" },
          },
          {
            id: "free",
            transparency: "transparent",
            start: { dateTime: "2026-10-26T10:00:00+01:00" },
            end: { dateTime: "2026-10-26T11:00:00+01:00" },
          },
          {
            id: "all-day",
            start: { date: "2026-10-26" },
            end: { date: "2026-10-27" },
          },
        ],
        week,
      ).map((a) => ({ ...a, categoryId: "learning", status: "done" as const }));
    plan(data, week, [...external, activity("2026-10-27", 30, "skipped")]);
    expect(periodStatistics(data, week, 4, "learning", current)).toMatchObject({
      planned: 90,
      done: 60,
      completion: 67,
    });
    expect(periodStatistics(data, week, 4, "health", current)).toMatchObject({
      planned: 0,
      done: 0,
      completion: null,
    });
  });
  it("använder sparade regler för äldre veckor utan målsnapshot och hanterar årsskifte och nollställning", () => {
    const data = createData();
    plan(data, week, [activity(week, 60)]);
    delete data.weeks[week].targets;
    data.weeks[week].rules!.trainingSessions = 3;
    data.weeks[week].rules!.trainingMinutes = 30;
    data.settings.trainingSessions = 2;
    data.settings.trainingMinutes = 60;
    expect(
      periodStatistics(data, week, 4, "health", current).rows[0].target,
    ).toBe(90);
    const year = periodStatistics(data, "2027-01-04", 4, "all", "2027-01-06");
    expect(year.weeks.map((w) => w.week)).toEqual([
      "2026-12-14",
      "2026-12-21",
      "2026-12-28",
      "2027-01-04",
    ]);
    expect(
      periodStatistics(resetPlanning(data, week), week, 4, "all", current),
    ).toMatchObject({ planned: 0, done: 0, savedWeeks: 1 });
  });
});
