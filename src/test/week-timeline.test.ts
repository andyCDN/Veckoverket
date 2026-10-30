import { expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { weekTimeline } from "../lib/week-timeline";
import type { Activity } from "../lib/types";
const settings = createData().settings;
function activity(
  id: string,
  date: string,
  start: number,
  end: number,
): Activity {
  return {
    id,
    date,
    start,
    end,
    title: id,
    description: "",
    categoryId: "career",
    estimatedMinutes: end - start,
    blockType: "locked",
    priority: 3,
    status: "done",
    source: "manual",
  };
}
it("aligns the same clock time across days and makes short bookings readable without mutating plans", () => {
  const entries = [
    activity("a", "2026-10-26", 510, 525),
    activity("b", "2026-10-27", 510, 600),
    activity("c", "2026-10-26", 530, 600),
  ];
  const before = structuredClone(entries);
  const result = weekTimeline(entries, settings);
  expect(result.entries.get("a")!.top).toBe(result.entries.get("b")!.top);
  expect(result.entries.get("a")!.height).toBeGreaterThanOrEqual(38);
  expect(
    result.entries.get("a")!.top + result.entries.get("a")!.height,
  ).toBeLessThan(result.entries.get("c")!.top);
  expect(entries).toEqual(before);
});
it("keeps overlapping imported bookings in separate lanes and reuses lanes once free", () => {
  const entries = [
    activity("a", "2026-10-26", 510, 600),
    activity("b", "2026-10-26", 540, 630),
    activity("c", "2026-10-26", 600, 615),
    activity("d", "2026-10-26", 630, 660),
  ];
  const result = weekTimeline(entries, settings).entries;
  expect(result.get("a")!.count).toBe(2);
  expect(result.get("a")!.lane).not.toBe(result.get("b")!.lane);
  expect(result.get("c")!.lane).toBe(result.get("a")!.lane);
  expect(result.get("d")!.count).toBe(1);
});
it("includes bookings outside work hours, midnight and an empty week", () => {
  const result = weekTimeline(
    [activity("all-day", "2026-10-26", 0, 1440)],
    settings,
  );
  expect(result.ticks[0].minute).toBe(0);
  expect(result.ticks.at(-1)!.minute).toBe(1440);
  expect(result.entries.get("all-day")!.height).toBeGreaterThan(0);
  expect(weekTimeline([], settings).entries.size).toBe(0);
  expect(weekTimeline([], settings).height).toBeGreaterThan(0);
});

it("keeps the reference workday compact while positioning arbitrary clock minutes on the shared axis", () => {
  const result = weekTimeline([], settings);
  expect(result.start).toBe(480);
  expect(result.end).toBe(1020);
  expect(result.height).toBeLessThan(450);
  const nine = result.ticks.find((t) => t.minute === 540)!.top;
  const ten = result.ticks.find((t) => t.minute === 600)!.top;
  expect(result.position(570)).toBeCloseTo((nine + ten) / 2);
});
