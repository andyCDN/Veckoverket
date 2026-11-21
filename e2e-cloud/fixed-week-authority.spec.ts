import { test, expect } from "@playwright/test";
import { mock, row, userA, login } from "./helpers";
import {
  overfilledWorkspace,
  overfilledWeek as week,
} from "../src/test/fixtures/overfilled-week";
import { expectRequestedMonday } from "../e2e/requested-week-helpers";

for (const width of [1440, 390])
  test(`molnplanen ersätter gamla kompetenspass med 90 minuter och behåller anteckningarna vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const f = await mock(page, row(overfilledWorkspace()));
    await page.clock.setFixedTime(new Date("2026-11-21T09:00:00+01:00"));
    await page.goto("./");
    await login(page);
    await expect
      .poll(() => f.documents.get(userA)!.data.personalScheduleVersion)
      .toBe(2);
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    await expectRequestedMonday(page, week, width);
    const saved = () => f.documents.get(userA)!.data;
    const learning = () =>
      saved().weeks[week].activities.filter(
        (a) =>
          a.date === week &&
          a.status === "planned" &&
          a.categoryId === "learning",
      );
    expect(learning().map((a) => [a.start, a.end])).toEqual([[750, 840]]);
    expect(saved().weeks[week].replacedActivities?.map((a) => a.id)).toEqual(
      expect.arrayContaining([
        "manual-extra",
        "old-learning-series",
        "google-learning",
        "linked-course",
      ]),
    );
    expect(
      saved().tasks.find((t) => t.id === "course-task")?.needsPlanning,
    ).toBe(true);
    const writes = f.writes.length;
    await page.reload();
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    await expectRequestedMonday(page, week, width);
    expect(f.writes).toHaveLength(writes);
    expect(f.errors).toEqual([]);
  });
