import { test, expect } from "@playwright/test";
import { mock, row, userA, login } from "./helpers";
import {
  overfilledWorkspace,
  overfilledWeek as week,
} from "../src/test/fixtures/overfilled-week";

for (const width of [1440, 390])
  test(`importen väntar på användarens val och verifierar kontots sparade schema vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const f = await mock(page, row(overfilledWorkspace()));
    await page.clock.setFixedTime(new Date("2026-11-21T09:00:00+01:00"));
    await page.goto("./importera-schema/");
    await login(page);
    const dialog = page.getByRole("dialog", {
      name: "Importera veckoschema",
      exact: true,
    });
    await dialog
      .getByLabel("Klistra in ditt veckoschema", { exact: true })
      .fill("Måndag\n11.00–12.00 Kompetensutveckling");
    await dialog
      .getByRole("button", { name: "Granska schema", exact: true })
      .click();
    await dialog
      .getByRole("combobox", { name: "Antal veckor", exact: true })
      .selectOption("1");
    await dialog
      .getByRole("checkbox", {
        name: "Behåll bokningar från Google Kalender/iCal",
        exact: true,
      })
      .uncheck();
    expect(f.writes).toHaveLength(0);
    expect(f.documents.get(userA)!.data.weeks[week].activities).toHaveLength(
      23,
    );
    await dialog
      .getByRole("button", {
        name: "Ersätt planeringen och importera",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByRole("region", { name: "Importresultat" }),
    ).toContainText(
      "Sparat och kontrollerat i molnet: 1 vecka med 1 schematid per vecka",
    );
    expect(
      f.documents
        .get(userA)!
        .data.weeks[week].activities.map((a) => [a.start, a.end]),
    ).toEqual([[660, 720]]);
    expect(f.writes).toHaveLength(1);
    await dialog
      .getByRole("button", { name: "Visa den importerade veckan", exact: true })
      .click();
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (width === 1440)
      await expect(
        page.locator(`.day-column[data-date="${week}"] .block-time`),
      ).toHaveText(["11:00–12:00"]);
    else
      await expect(
        page.getByRole("article", { name: "23 november 2026", exact: true }),
      ).toContainText("11:00–12:00");
    expect(f.writes).toHaveLength(1);
    expect(f.errors).toEqual([]);
  });

test("visar inte sparat när servern inte har lagrat importen", async ({
  page,
}) => {
  const original = overfilledWorkspace();
  await mock(page, row(original));
  await page.clock.setFixedTime(new Date("2026-11-21T09:00:00+01:00"));
  await page.route("**/rest/v1/rpc/save_workspace", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(row(original)),
    }),
  );
  await page.goto("./importera-schema/");
  await login(page);
  const dialog = page.getByRole("dialog", {
    name: "Importera veckoschema",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Granska schema", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Antal veckor", exact: true })
    .selectOption("1");
  await dialog
    .getByRole("button", {
      name: "Ersätt planeringen och importera",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Importresultat" }).getByRole("alert"),
  ).toContainText("verifieras");
  await expect(
    dialog.getByText(/Sparat och kontrollerat i molnet/),
  ).toHaveCount(0);
});
