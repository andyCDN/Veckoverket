import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { followUps, canFollowUp } from "../lib/follow-up";
import { fullDate, initialDay } from "../lib/date";
import { generateWeek } from "../lib/planner";
import { decodeData } from "../lib/storage";
import type { Activity, AppData } from "../lib/types";
const week = "2026-10-26",
  next = "2026-11-02";
function pass(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "missed",
    title: "Jobbsök",
    description: "",
    categoryId: "career",
    date: week,
    start: 510,
    end: 630,
    estimatedMinutes: 120,
    blockType: "flexible",
    priority: 3,
    status: "skipped",
    source: "generated",
    ...overrides,
  };
}
function fixture() {
  const data = createData();
  data.weeks = {
    [week]: { week, activities: [pass()], generatedAt: "" },
    [next]: { week: next, activities: [], generatedAt: "" },
  };
  return data;
}
const replacement = (overrides: Partial<Activity> = {}) =>
  pass({
    id: "replacement",
    date: next,
    status: "planned",
    source: "manual",
    followUpOf: { week, activityId: "missed" },
    ...overrides,
  });
const remaining = (data: AppData) =>
  followUps(data).map((item) => item.remaining);

describe("uppföljning av uttryckligen missade pass", () => {
  it("inkluderar jobb och nätverk men klassificerar aldrig förflutna pass automatiskt", () => {
    const data = fixture();
    data.weeks[week].activities.push(
      pass({ id: "old", date: "2026-10-27", status: "planned" }),
      pass({ id: "music", categoryId: "music" }),
      pass({
        id: "network",
        categoryId: "learning",
        description: "Nätverksmöte",
      }),
    );
    expect(followUps(data).map((item) => item.activity.id)).toEqual([
      "missed",
      "network",
    ]);
    expect(canFollowUp(pass({ categoryId: "music", title: "Musik" }))).toBe(
      false,
    );
  });
  it("räknar verkliga ersättningspass över veckogränser och följer längd, kategori och borttagning", () => {
    const data = fixture();
    data.weeks[next].activities = [replacement()];
    expect(remaining(data)).toEqual([0]);
    data.weeks[next].activities[0].end -= 30;
    expect(remaining(data)).toEqual([30]);
    data.weeks[next].activities[0].categoryId = "health";
    expect(remaining(data)).toEqual([120]);
    data.weeks[next].activities = [];
    expect(remaining(data)).toEqual([120]);
  });
  it("dubbelräknar inte missade ersättningspass och summerar delbokningar", () => {
    const data = fixture();
    data.weeks[next].activities = [replacement({ status: "skipped" })];
    expect(remaining(data)).toEqual([120]);
    data.weeks[next].activities.push(replacement({ id: "partial", end: 570 }));
    expect(remaining(data)).toEqual([60]);
    data.weeks[next].activities.push(
      replacement({ id: "second", start: 630, end: 690, status: "done" }),
    );
    expect(remaining(data)).toEqual([0]);
    data.weeks[week].activities[0].status = "done";
    // The independently missed replacement now remains an explicit missed outcome.
    expect(followUps(data).map((item) => item.activity.id)).toEqual([
      "replacement",
    ]);
  });
  it("behåller missade original och manuella ombokningar vid omplanering och export/import", () => {
    const data = fixture();
    data.weeks[next].activities = [replacement()];
    data.weeks[week] = generateWeek(week, data, data.weeks[week]).plan;
    data.weeks[next] = generateWeek(next, data, data.weeks[next]).plan;
    expect(remaining(data)).toEqual([0]);
    const restored = decodeData(JSON.stringify(data));
    expect(
      restored.weeks[next].activities.find((a) => a.id === "replacement")
        ?.followUpOf,
    ).toEqual({ week, activityId: "missed" });
    expect(remaining(restored)).toEqual([0]);
    const old = fixture();
    expect(decodeData(JSON.stringify(old))).toEqual(old);
  });
});
describe("aktivt datum i svensk kalender", () => {
  const days = [0, 1, 2, 3, 4];
  it("väljer dagens datum i aktuell vecka, måndag i andra veckor och på helger", () => {
    expect(initialDay(week, days, "2026-10-29")).toBe(3);
    expect(initialDay(next, days, "2026-10-29")).toBe(0);
    expect(initialDay(week, days, "2026-10-31")).toBe(0);
    expect(initialDay("2026-12-28", days, "2027-01-01")).toBe(4);
  });
  it("väljer en tillgänglig dag när egna regler saknar måndag eller dagens dag", () => {
    expect(initialDay(week, [1, 4], "2026-10-29")).toBe(1);
    expect(initialDay(next, [2, 4], "2026-10-29")).toBe(2);
    expect(initialDay(week, [], "2026-10-29")).toBe(0);
    expect(fullDate("2026-10-29")).toBe("29 oktober 2026");
  });
});
