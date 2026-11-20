import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import { generateWeek } from "../src/lib/planner";
import { templateSettings } from "../src/lib/week-template";
import { RETIRED_LINKEDIN_PASS } from "../src/lib/activity-exclusions";
import { cacheKey } from "../src/lib/workspace-sync";
import { mock, login, row, userA } from "./helpers";
import { openContext } from "../e2e/navigation";

for (const width of [1440, 390])
  test(`stryker LinkedIn-passet och visar samma vecka i kalender och vanor vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = createData();
    data.settings = templateSettings(data.settings);
    const current = "2026-11-16",
      next = "2026-11-23",
      past = "2026-11-09";
    data.recurring = [
      {
        id: "linkedin",
        title: RETIRED_LINKEDIN_PASS,
        description: "",
        categoryId: "career",
        start: 510,
        end: 570,
        estimatedMinutes: 60,
        blockType: "flexible",
        priority: 3,
        weekdays: [0, 1, 2, 3],
        startsOn: past,
      },
    ];
    data.weeks = {
      [current]: generateWeek(current, data).plan,
      [next]: generateWeek(next, data).plan,
    };
    const oldPass = data.weeks[current].activities.find(
      (a) => a.title === RETIRED_LINKEDIN_PASS,
    )!;
    data.weeks[past] = {
      week: past,
      generatedAt: "",
      activities: [{ ...oldPass, id: "history", date: past, status: "done" }],
    };
    const meeting = {
      ...oldPass,
      id: "own-meeting",
      title: "Eget bokat möte",
      date: "2026-11-25",
      start: 820,
      end: 880,
      estimatedMinutes: 60,
      source: "manual" as const,
    };
    data.weeks[next].activities.push(meeting);
    data.habits = [
      {
        id: "exercise",
        title: "Träna",
        createdOn: past,
        schedule: { kind: "weekly", target: 2 },
        checks: [],
      },
      {
        id: "walk",
        title: "Promenera",
        createdOn: past,
        schedule: { kind: "weekly", target: 3 },
        checks: [],
      },
    ];
    const f = await mock(page, row(data));
    await page.clock.setFixedTime(new Date("2026-11-20T09:00:00+01:00"));
    const saved = () =>
      expect
        .poll(() =>
          page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.dirty,
            cacheKey(userA),
          ),
        )
        .toBe(false);
    await page.goto("./");
    await login(page);
    await expect
      .poll(() => f.documents.get(userA)?.data.settings.excludedActivityTitles)
      .toEqual([RETIRED_LINKEDIN_PASS]);
    await saved();
    for (const week of [current, next])
      expect(
        f.documents
          .get(userA)!
          .data.weeks[week].activities.some(
            (a) => a.title === RETIRED_LINKEDIN_PASS,
          ),
      ).toBe(false);
    expect(f.documents.get(userA)!.data.weeks[past]).toEqual(data.weeks[past]);
    expect(f.documents.get(userA)!.data.weeks[next].activities).toContainEqual(
      meeting,
    );
    await openContext(page);
    const tracker = page.getByRole("region", { name: "Vanor", exact: true });
    await expect(tracker).toContainText("V.47");
    await tracker
      .getByRole("button", {
        name: "Nästa vecka för kalender och vanor",
        exact: true,
      })
      .click();
    await expect(tracker).toContainText("V.48");
    if (width === 1440) {
      await expect(
        page.getByRole("button", {
          name: "Visa måndag 23 november 2026",
          exact: true,
        }),
      ).toBeVisible();
      const monday = page.locator('.day-column[data-date="2026-11-23"]');
      await expect(monday).toContainText("08:30–09:00");
      await expect(monday).toContainText("09:00–10:30");
    } else {
      await expect(page.locator(".studio-dateband")).toContainText("V.48");
      const monday = page.getByRole("article", { name: "23 november 2026" });
      await expect(monday).toContainText("08:30–09:00");
      await expect(monday).toContainText("09:00–10:30");
    }
    await expect(
      page
        .getByRole("region", { name: "Veckans arbetsflöde" })
        .getByRole("button", { name: "Torsdagscheck", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/linkedin-removed-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Föregående vecka", exact: true })
      .click();
    await openContext(page);
    await expect(tracker).toContainText("V.47");
    if (width === 1440)
      await expect(
        page.getByRole("button", {
          name: "Visa måndag 16 november 2026",
          exact: true,
        }),
      ).toBeVisible();
    else await expect(page.locator(".studio-dateband")).toContainText("V.47");
    await saved();
    await page.reload();
    await saved();
    expect(f.writes).toHaveLength(1);
    expect(f.errors).toEqual([]);
  });
