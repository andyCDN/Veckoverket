import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import {
  linkedInSeriesCounts,
  RETIRED_LINKEDIN_PASS,
} from "../src/lib/activity-exclusions";
import { cacheKey } from "../src/lib/workspace-sync";
import type { Activity } from "../src/lib/types";
import { mock, login, row, userA, status } from "./helpers";

function fixture() {
  const data = createData();
  data.settings.excludedActivityTitles = [];
  const week = "2026-11-16",
    past = "2026-01-05";
  const base: Activity = {
    id: "base",
    title: RETIRED_LINKEDIN_PASS,
    description: "",
    date: week,
    start: 510,
    end: 570,
    estimatedMinutes: 60,
    categoryId: "career",
    blockType: "flexible",
    priority: 3,
    status: "planned",
    source: "recurring",
    recurrenceId: "linkedin",
  };
  data.recurring = [
    { ...base, id: "linkedin", startsOn: past, weekdays: [0, 1, 2, 3, 4] },
  ];
  data.weeks = {
    [week]: {
      week,
      generatedAt: "",
      weeklyRoutinesFrom: week,
      activities: [
        { ...base, id: "planned" },
        {
          ...base,
          id: "renamed",
          title: "Dagens ansökningstid",
          status: "done",
        },
        {
          ...base,
          id: "meeting",
          title: "Eget möte",
          recurrenceId: undefined,
          source: "manual",
        },
      ],
    },
    [past]: {
      week: past,
      generatedAt: "",
      weeklyRoutinesFrom: past,
      activities: [{ ...base, id: "old", date: past, status: "skipped" }],
    },
  };
  return data;
}

for (const width of [1440, 390])
  test(`direkt rensning läser och verifierar hela molnplanen vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const data = fixture();
    const f = await mock(page, row(data));
    await page.goto("./rensa-linkedin/");
    await login(page);
    const result = page.getByRole("region", { name: "Rensningsresultat" });
    await expect(result).toContainText(
      "3 bokningar och 1 återkommande regel borttagna",
    );
    await expect(result).toContainText(
      "0 LinkedIn-bokningar och 0 återkommande regler kvar",
    );
    expect(linkedInSeriesCounts(f.documents.get(userA)!.data)).toEqual({
      bookings: 0,
      rules: 0,
    });
    expect(f.documents.get(userA)!.data.weeks["2026-11-16"].activities).toEqual(
      [data.weeks["2026-11-16"].activities[2]],
    );
    expect(f.writes).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/direct-linkedin-removal-${width}.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(result).toContainText(
      "0 bokningar och 0 återkommande regler borttagna",
    );
    expect(f.writes).toHaveLength(1);
    expect(f.errors).toEqual([]);
  });

test("rensar också en äldre kontokopia när molnläsningen misslyckas och sparar när anslutningen återkommer", async ({
  page,
}) => {
  const data = fixture();
  const f = await mock(page, row(data));
  f.failLoad = true;
  await page.addInitScript(
    ({ key, data, userId }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ userId, revision: 1, data, dirty: false }),
      );
    },
    { key: cacheKey(userA), data, userId: userA },
  );
  await page.goto("./");
  await login(page);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).data.recurring.length,
        cacheKey(userA),
      ),
    )
    .toBe(0);
  const cached = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    cacheKey(userA),
  );
  expect(linkedInSeriesCounts(cached.data)).toEqual({ bookings: 0, rules: 0 });
  expect(cached.dirty).toBe(true);
  expect(f.writes).toHaveLength(0);
  f.failLoad = false;
  await page
    .getByRole("button", { name: "Konto & molnlagring", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Synkronisera nu", exact: true })
    .click();
  await expect
    .poll(() => linkedInSeriesCounts(f.documents.get(userA)!.data))
    .toEqual({ bookings: 0, rules: 0 });
  await page.getByRole("button", { name: "Stäng dialog", exact: true }).click();
  await status(page, "Sparat i molnet");
  expect(f.errors).toEqual([]);
});
