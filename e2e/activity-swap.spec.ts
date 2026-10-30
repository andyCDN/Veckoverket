import { test, expect, type Page } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import type { Activity } from "../src/lib/types";
const week = "2026-11-02";
async function setup(page: Page) {
  await page.clock.install({ time: new Date("2026-11-02T08:00:00+01:00") });
  const data = createData();
  const make = (
    id: string,
    date: string,
    start: number,
    end: number,
    extra: Partial<Activity> = {},
  ): Activity => ({
    id,
    date,
    start,
    end,
    title: id,
    description: "Anteckning",
    categoryId: "career",
    estimatedMinutes: end - start,
    blockType: "flexible",
    priority: 3,
    status: "planned",
    source: "manual",
    ...extra,
  });
  data.settings.autoPlanning = false;
  data.weeks = {
    [week]: {
      week,
      generatedAt: "",
      weeklyRoutinesFrom: week,
      activities: [
        make("Ansökan", week, 510, 570, { applicationId: "application" }),
        make("Kurs", "2026-11-03", 630, 690, { categoryId: "learning" }),
        make("Avklarat", "2026-11-04", 510, 570, { status: "done" }),
        make("Låst möte", "2026-11-03", 700, 760, { blockType: "locked" }),
        make("Långt pass", "2026-11-05", 510, 630),
      ],
    },
  };
  await page.goto("./");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page.evaluate(
    (data) =>
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data)),
    data,
  );
  await page.reload();
  await expect(page.locator('[data-activity-id="Ansökan"]')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
  );
}
const entry = (page: Page, id: string) =>
  page.locator(`[data-activity-id="${id}"]`);
async function drag(page: Page, first: string, second: string) {
  const from = (await entry(page, first).boundingBox())!,
    to = (await entry(page, second).boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + 25);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y + 25, { steps: 20 });
  await page.mouse.up();
}
test("drag swaps both exact slots, persists links, protects history and can be undone", async ({
  page,
}) => {
  await setup(page);
  const before = await stored(page),
    [first, second] = before.weeks[week].activities;
  await drag(page, first.id, second.id);
  await expect(page.locator(".toast")).toContainText("Passen har bytt plats");
  const after = await stored(page);
  expect(after.weeks[week].activities).toEqual([
    { ...first, date: second.date, start: second.start, end: second.end },
    { ...second, date: first.date, start: first.start, end: first.end },
    ...before.weeks[week].activities.slice(2),
  ]);
  await page
    .getByRole("button", { name: /^Ångra/ })
    .first()
    .click();
  expect((await stored(page)).weeks[week]).toEqual(before.weeks[week]);
  await drag(page, first.id, second.id);
  await page.reload();
  expect((await stored(page)).weeks[week]).toEqual(after.weeks[week]);
  await drag(page, first.id, "Avklarat");
  await expect(page.locator(".toast")).toContainText("avklarade pass");
  expect((await stored(page)).weeks[week]).toEqual(after.weeks[week]);
});
test("mobile editor swaps two saved passes and rejects a conflicting unequal duration atomically", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const before = await stored(page);
  await entry(page, "Ansökan").locator(".calendar-block").click();
  await page
    .getByRole("combobox", { name: "Byt plats med", exact: true })
    .selectOption("Kurs");
  await page.getByRole("button", { name: "Byt plats", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await stored(page)).weeks[week].activities[0].date).toBe(
    "2026-11-03",
  );
  await page.getByRole("button", { name: /^Visa torsdag/ }).click();
  await entry(page, "Långt pass").locator(".calendar-block").click();
  await page
    .getByRole("combobox", { name: "Byt plats med", exact: true })
    .selectOption("Ansökan");
  const swapped = await stored(page);
  await page.getByRole("button", { name: "Byt plats", exact: true }).click();
  await expect(page.locator(".inline-error")).toContainText("överlappar");
  expect(await stored(page)).toEqual(swapped);
  expect(swapped.weeks[week].activities[2]).toEqual(
    before.weeks[week].activities[2],
  );
});
