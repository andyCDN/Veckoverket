import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { STORAGE_KEY } from "../src/lib/storage";
import {
  overfilledWorkspace,
  overfilledWeek as week,
} from "../src/test/fixtures/overfilled-week";
import { navigateTo } from "./navigation";

for (const width of [1440, 390])
  test(`importera, granska och ersätt schemat i användarvyn vid ${width}px`, async ({
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
    await page.goto("./importera-schema/");
    const dialog = page.getByRole("dialog", {
      name: "Importera veckoschema",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const stored = () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!),
        STORAGE_KEY,
      );
    expect((await stored()).weeks[week].activities).toHaveLength(23);
    await dialog
      .getByLabel("Klistra in ditt veckoschema", { exact: true })
      .fill(
        "Måndag\n11.00–12.00 Kompetensutveckling\nTorsdag\n14.00–14.20 Stänga veckan",
      );
    await dialog
      .getByRole("button", { name: "Granska schema", exact: true })
      .click();
    await expect(
      dialog.getByRole("region", { name: "Granska importerade tider" }),
    ).toBeVisible();
    await dialog
      .getByRole("combobox", { name: "Antal veckor", exact: true })
      .selectOption("1");
    await dialog
      .getByRole("checkbox", {
        name: "Behåll bokningar från Google Kalender/iCal",
        exact: true,
      })
      .uncheck();
    await expect(
      dialog.getByRole("region", { name: "Så ändras planeringen" }),
    ).toContainText("23 tidigare planerade pass ersätts");
    expect((await stored()).weeks[week].activities).toHaveLength(23);
    await page.screenshot({
      path: `test-results/schedule-import-preview-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await dialog
      .getByRole("button", {
        name: "Ersätt planeringen och importera",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByRole("region", { name: "Importresultat" }),
    ).toContainText(
      "Sparat och kontrollerat på den här enheten: 1 vecka med 2 schematider per vecka",
    );
    const saved = await stored();
    expect(
      saved.weeks[week].activities.map((a: { start: number; end: number }) => [
        a.start,
        a.end,
      ]),
    ).toEqual([
      [660, 720],
      [840, 860],
    ]);
    await dialog
      .getByRole("button", { name: "Visa den importerade veckan", exact: true })
      .click();
    await expect(page).toHaveURL(/week=2026-11-23/);
    if (width === 1440) {
      const monday = page.locator(`.day-column[data-date="${week}"]`);
      await expect(monday.locator(".block-time")).toHaveText(["11:00–12:00"]);
    } else
      await expect(
        page.getByRole("article", { name: "23 november 2026", exact: true }),
      ).toContainText("11:00–12:00");
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    await expect
      .poll(async () =>
        (await stored()).weeks["2026-11-30"]?.activities.map(
          (a: { start: number; end: number }) => [a.start, a.end],
        ),
      )
      .toEqual([
        [660, 720],
        [840, 860],
      ]);
    await page
      .getByRole("region", { name: "Veckans arbetsflöde" })
      .getByRole("button", { name: "Torsdagscheck", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Torsdagscheck", exact: true }),
    ).toContainText("14:00–14:20");
    await page
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    await navigateTo(page, "Inställningar");
    await expect(
      page.getByRole("checkbox", { name: /Importerat veckoschema/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Importera veckoschema", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByLabel("Klistra in ditt veckoschema", { exact: true }),
    ).toHaveValue(/11:00–12:00/);
  });

test("CSV-fil kan läsas och felaktiga rader stoppas före sparandet", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-21T09:00:00+01:00") });
  await page.goto("./importera-schema/");
  const dialog = page.getByRole("dialog", {
    name: "Importera veckoschema",
    exact: true,
  });
  await dialog.getByLabel("Schemafil", { exact: true }).setInputFiles({
    name: "schema.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Dag;Start;Slut;Aktivitet;Område\nMån;10:00;11:00;Kurs UX;learning",
    ),
  });
  await dialog
    .getByRole("button", { name: "Granska schema", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Granska importerade tider" }),
  ).toContainText("Kurs UX");
  await dialog
    .getByRole("button", { name: "Tillbaka till texten", exact: true })
    .click();
  await dialog
    .getByLabel("Klistra in ditt veckoschema", { exact: true })
    .fill("Måndag\n99.00 Kompetensutveckling");
  await dialog
    .getByRole("button", { name: "Granska schema", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Rad 2");
  await expect(
    dialog.getByRole("button", {
      name: "Ersätt planeringen och importera",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("det tidigare angivna schemat ersätter överplaneringen med exakt sex måndagspass", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-21T09:00:00+01:00") });
  await page.addInitScript(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: STORAGE_KEY, data: overfilledWorkspace() },
  );
  await page.goto("./importera-schema/");
  const dialog = page.getByRole("dialog", {
    name: "Importera veckoschema",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Granska schema", exact: true })
    .click();
  await expect(
    dialog
      .getByRole("region", { name: "Granska importerade tider" })
      .getByRole("region", { name: "Måndag", exact: true })
      .locator("summary"),
  ).toHaveText([
    "08:30–09:00Veckoincheck",
    "09:00–10:30Söka jobb",
    "10:30–11:30Träna",
    "11:30–12:30Lunch",
    "12:30–14:00Kompetensutveckling",
    "14:00–15:00Nätverksförfrågningar",
  ]);
  await dialog
    .getByRole("checkbox", {
      name: "Behåll bokningar från Google Kalender/iCal",
      exact: true,
    })
    .uncheck();
  await dialog
    .getByRole("button", {
      name: "Ersätt planeringen och importera",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Importresultat" }),
  ).toContainText("4 veckor med 19 schematider per vecka");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
  for (const target of ["2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"])
    expect(
      saved.weeks[target].activities
        .filter((a: { date: string }) => a.date === target)
        .map((a: { start: number; end: number }) => [a.start, a.end]),
    ).toEqual([
      [510, 540],
      [540, 630],
      [630, 690],
      [690, 750],
      [750, 840],
      [840, 900],
    ]);
});
