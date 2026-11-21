import { test, expect } from "@playwright/test";
import {
  overfilledWorkspace,
  overfilledWeek as week,
} from "../src/test/fixtures/overfilled-week";
import { STORAGE_KEY } from "../src/lib/storage";
import { expectRequestedMonday } from "./requested-week-helpers";
import { addItem } from "./navigation";

for (const width of [1440, 390])
  test(`veckoschemat tar bort extra kompetenstimmar och blockerar nya vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-21T09:00:00+01:00") });
    const data = overfilledWorkspace();
    await page.addInitScript(
      ({ key, data }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(data));
      },
      { key: STORAGE_KEY, data },
    );
    await page.goto("./");
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    await expectRequestedMonday(page, week, width);
    const stored = () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!),
        STORAGE_KEY,
      );
    const learningMinutes = (saved: typeof data) =>
      saved.weeks[week].activities
        .filter(
          (a) =>
            a.date === week &&
            a.status === "planned" &&
            a.categoryId === "learning",
        )
        .reduce((n, a) => n + a.end - a.start, 0);
    expect(learningMinutes(await stored())).toBe(90);
    await expect(
      page.getByText("Pass utanför veckoschemat", { exact: true }),
    ).toBeVisible();
    await addItem(page, "Pass");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Namn", { exact: true }).fill("Extra lärande");
    await dialog
      .getByRole("combobox", { name: "Område", exact: true })
      .selectOption("learning");
    await dialog.getByLabel("Start", { exact: true }).fill("15:00");
    await dialog.getByLabel("Slut", { exact: true }).fill("15:30");
    await dialog
      .getByRole("button", { name: "Spara pass", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("12:30–14:00");
    expect(learningMinutes(await stored())).toBe(90);
    await page.screenshot({
      path: `test-results/fixed-week-booking-blocked-${width}.png`,
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    await expectRequestedMonday(page, week, width);
    expect(learningMinutes(await stored())).toBe(90);
    await page.screenshot({
      path: `test-results/fixed-week-calendar-${width}.png`,
      fullPage: true,
    });
  });
