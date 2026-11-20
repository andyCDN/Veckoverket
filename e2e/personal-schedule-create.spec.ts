import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import { generateWeek } from "../src/lib/planner";
import { scheduleSlotCount } from "../src/lib/create-personal-schedule";
import { STORAGE_KEY } from "../src/lib/storage";

for (const width of [1440, 390])
  test(`skapar det exakta schemat och öppnar den sparade veckan vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-20T09:00:00+01:00") });
    const data = createData(),
      week = "2026-11-23";
    data.weeks = { "2026-11-16": generateWeek("2026-11-16", data).plan };
    await page.addInitScript(
      ({ key, data }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(data));
      },
      { key: STORAGE_KEY, data },
    );
    await page.goto("./veckoschema/");
    const result = page.getByRole("region", { name: "Sparat veckoschema" });
    await expect(result).toContainText(
      "19 av 19 schemapass finns på dina tider",
    );
    await expect(result).toContainText("Inga tidskrockar");
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      STORAGE_KEY,
    );
    expect(scheduleSlotCount(stored.weeks[week])).toBe(19);
    expect(stored.weeks["2026-11-16"]).toEqual(data.weeks["2026-11-16"]);
    await page.screenshot({
      path: `test-results/personal-schedule-create-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.reload();
    await expect(result).toContainText("19 av 19");
    const again = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      STORAGE_KEY,
    );
    expect(again).toEqual(stored);
    await page
      .getByRole("link", { name: "Öppna vecka 48 i kalendern" })
      .click();
    await expect(page).toHaveURL(/week=2026-11-23/);
    await expect(page.getByRole("banner")).toContainText(
      width === 1440 ? "Vecka 48" : "V.48",
    );
    if (width < 700) await page.locator(".week-context > summary").click();
    await expect(
      page
        .getByRole("region", { name: "Vanor" })
        .locator(".habit-week-controls"),
    ).toContainText("V.48");
    if (width === 1440) {
      await expect(page.locator(".day-heading:visible").first()).toContainText(
        "23",
      );
    } else {
      await expect(
        page.getByRole("article", { name: "23 november 2026" }),
      ).toContainText("09:00–10:30");
    }
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    await expect(page.getByRole("banner")).toContainText(
      width === 1440 ? "Vecka 49" : "V.49",
    );
    await expect
      .poll(async () => {
        const saved = await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)!),
          STORAGE_KEY,
        );
        return (
          saved.weeks["2026-11-30"] &&
          scheduleSlotCount(saved.weeks["2026-11-30"])
        );
      })
      .toBe(19);
  });

test("skapar inte en ersättningsplan eller ändrar historik när plan saknas eller veckolänken är fel", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-20T09:00:00+01:00") });
  await page.goto("./veckoschema/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Ingen sparad plan",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBeNull();
  await page.goto("./veckoschema/?week=2026-11-16");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Tidigare veckor ändras inte",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBeNull();
});
