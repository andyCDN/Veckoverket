import { test, expect } from "@playwright/test";
import { STORAGE_KEY } from "../src/lib/storage";
import { scheduleSlotCount } from "../src/lib/create-personal-schedule";
import { oldWeeklyPlan, expectRequestedMonday } from "./requested-week-helpers";
import { weekTimeline } from "../src/lib/week-timeline";

for (const mode of ["off", "active", "installed"] as const)
  for (const width of [1440, 390])
    test(`vanlig veckovy rättar måndagen utan skaparlänk: ${mode}, ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.clock.install({ time: new Date("2026-11-21T09:00:00+01:00") });
      const data = oldWeeklyPlan(mode);
      await page.addInitScript(
        ({ key, data }) => {
          if (!localStorage.getItem(key))
            localStorage.setItem(key, JSON.stringify(data));
        },
        { key: STORAGE_KEY, data },
      );
      await page.goto("./");
      await expectRequestedMonday(page, "2026-11-16", width);
      const stored = () =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)!),
          STORAGE_KEY,
        );
      await expect
        .poll(async () =>
          scheduleSlotCount((await stored()).weeks["2026-11-23"]),
        )
        .toBe(19);
      expect((await stored()).weeks["2026-11-09"]).toEqual(
        data.weeks["2026-11-09"],
      );
      await page
        .getByRole("button", { name: "Nästa vecka", exact: true })
        .click();
      await expectRequestedMonday(page, "2026-11-23", width);
      await page.screenshot({
        path: `test-results/requested-week-${mode}-${width}.png`,
        fullPage: true,
      });

      await page.reload();
      await expectRequestedMonday(page, "2026-11-16", width);
      expect(scheduleSlotCount((await stored()).weeks["2026-11-16"])).toBe(19);
    });

test("kan dra och boka ett eget pass i tisdagens öppna eftermiddag efter den automatiska rättelsen", async ({
  page,
}) => {
  await page.clock.install({
    time: new Date("2026-11-21T09:00:00+01:00"),
  });
  const data = oldWeeklyPlan("off");
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key: STORAGE_KEY, data },
  );
  await page.goto("./");
  await expectRequestedMonday(page, "2026-11-16", 1440);
  await page.getByRole("button", { name: "Nästa vecka", exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
  const plan = saved.weeks["2026-11-23"];
  const axis = weekTimeline(plan.activities, plan.rules);
  const day = page.locator('.day-column[data-date="2026-11-24"]');
  await day.scrollIntoViewIfNeeded();
  const box = (await day.boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + axis.position(780));
  await page.mouse.down();
  await page.mouse.move(x, box.y + axis.position(825), { steps: 8 });
  await expect(day.locator(".calendar-direct-selection")).toHaveText(
    "13:00–13:45",
  );
  await page.mouse.up();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Namn", { exact: true })
    .fill("Eget eftermiddagspass");
  await dialog
    .getByRole("combobox", { name: "Område", exact: true })
    .selectOption("family");
  await dialog.getByRole("button", { name: "Spara pass", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(day).toContainText("Eget eftermiddagspass");
  const updated = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
  expect(scheduleSlotCount(updated.weeks["2026-11-23"])).toBe(19);
  expect(updated.weeks["2026-11-23"].activities).toContainEqual(
    expect.objectContaining({
      title: "Eget eftermiddagspass",
      date: "2026-11-24",
      start: 780,
      end: 825,
    }),
  );
});
