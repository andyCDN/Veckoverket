import { expect, it } from "vitest";
import { studioWeek } from "../lib/studio-week";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";
import type { Activity } from "../lib/types";

it("derives professional counts from real bookings and tasks without rewriting personal history", () => {
  const data = createData();
  data.goals = [
    {
      id: "g",
      title: "Sprintleverans",
      week: "2024-10-21",
      categoryId: "career",
      horizon: "week",
      description: "",
    },
  ];
  data.tasks = [
    { id: "t", title: "Klart", done: true, goalId: "g", date: "2024-10-24" },
    { id: "u", title: "Återstår", done: false, goalId: "g" },
  ];
  const booking = (
    id: string,
    categoryId: string,
    blockType: Activity["blockType"],
  ): Activity => ({
    id,
    categoryId,
    blockType,
    date: "2024-10-24",
    start: 540,
    end: 660,
    title: id,
    description: "",
    priority: 3,
    status: "planned",
    source: "manual",
    estimatedMinutes: 120,
  });
  const bookings = [
    booking("fokus", "career", "flexible"),
    booking("möte", "career", "locked"),
    booking("Familj", "family", "locked"),
    booking("Lunch", "rest", "locked"),
  ];
  const model = studioWeek(data, "2024-10-21", bookings, "2024-10-24");
  expect(model).toMatchObject({
    meetings: 1,
    focus: 1,
    focusMinutes: 120,
    completed: 1,
    percent: 50,
  });
  expect(model.activities.map((activity) => activity.id)).not.toContain(
    "Familj",
  );
  expect(bookings).toHaveLength(4);
});

it("dated tasks follow their date even when linked to an older goal, and survive local/cloud decoding", () => {
  const data = createData();
  data.tasks[0].date = "2026-11-12";
  const restored = decodeData(JSON.stringify(data));
  expect(restored.tasks[0].date).toBe("2026-11-12");
  expect(
    studioWeek(restored, "2026-11-09", [], "2026-11-12").tasks.map(
      (task) => task.id,
    ),
  ).toContain(data.tasks[0].id);
  expect(() =>
    decodeData(
      JSON.stringify({
        ...data,
        tasks: [{ ...data.tasks[0], date: "2026-02-31" }],
      }),
    ),
  ).toThrow();
});
