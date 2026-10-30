import { test, expect } from "@playwright/test";
import { mock, plan, row, login, status, userA, week } from "./helpers";
import type { Activity } from "../src/lib/types";
test("platsbyte sparas som en molnändring utan att automatisk planering skriver om andra pass", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-30T10:00:00+01:00") });
  const original = plan("Molnplan");
  original.settings.autoPlanning = true;
  const make = (
    id: string,
    date: string,
    start: number,
    extra: Partial<Activity> = {},
  ): Activity => ({
    id,
    title: id,
    description: "Anteckning",
    categoryId: "career",
    date,
    start,
    end: start + 60,
    estimatedMinutes: 60,
    blockType: "flexible",
    priority: 3,
    status: "planned",
    source: "manual",
    ...extra,
  });
  original.weeks[week].activities = [
    make("Ansökan", week, 510),
    make("Kurs", "2026-10-27", 630, { categoryId: "learning" }),
    make("Avklarat", "2026-10-28", 510, { status: "done" }),
    make("Bokat möte", "2026-10-29", 630, { blockType: "locked" }),
  ];
  const f = await mock(page, row(original));
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await page.locator('[data-activity-id="Ansökan"] .calendar-block').click();
  await page
    .getByRole("combobox", { name: "Byt plats med", exact: true })
    .selectOption("Kurs");
  await page.getByRole("button", { name: "Byt plats", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  await status(page, "Sparat i molnet");
  const after = f.documents.get(userA)!.data;
  expect(after.weeks[week].activities).toEqual([
    {
      ...original.weeks[week].activities[0],
      date: "2026-10-27",
      start: 630,
      end: 690,
    },
    { ...original.weeks[week].activities[1], date: week, start: 510, end: 570 },
    ...original.weeks[week].activities.slice(2),
  ]);
  await page.reload();
  await status(page, "Sparat i molnet");
  expect(f.documents.get(userA)!.data).toEqual(after);
  expect(f.errors).toEqual([]);
});
