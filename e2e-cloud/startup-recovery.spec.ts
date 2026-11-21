import { test, expect } from "@playwright/test";
import { mock, row, userA, login } from "./helpers";
import { startupFailureWorkspace } from "../src/test/fixtures/startup-failure";

test("inloggad huvudsida kan återhämtas via fristående import utan automatisk överskrivning", async ({
  page,
}) => {
  const original = startupFailureWorkspace();
  const f = await mock(page, row(original));
  await page.clock.setFixedTime(new Date("2026-11-21T10:00:00+01:00"));
  await page.goto("./");
  await login(page);
  const alert = page.getByRole("alert", {
    name: "Veckoplanens uppdatering stoppades",
  });
  await expect(alert).toBeVisible();
  expect(f.writes).toHaveLength(0);
  expect(f.documents.get(userA)!.data).toEqual(original);
  await alert
    .getByRole("link", { name: "Öppna schemaimporten", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Importera veckoschema",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect(f.writes).toHaveLength(0);
  await expect(
    page.getByRole("region", { name: "Veckans arbetsflöde" }),
  ).toHaveCount(0);
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
  await dialog
    .getByRole("button", {
      name: "Ersätt planeringen och importera",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Importresultat" }),
  ).toContainText("Sparat och kontrollerat i molnet");
  expect(f.writes).toHaveLength(1);
  await dialog
    .getByRole("button", { name: "Visa den importerade veckan", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Veckans arbetsflöde" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert", { name: "Veckoplanens uppdatering stoppades" }),
  ).toHaveCount(0);
  expect(
    f.documents.get(userA)!.data.weeks["2026-11-23"].activities,
  ).toHaveLength(19);
  expect(f.documents.get(userA)!.data.weeks["2026-11-24"]).toEqual(
    original.weeks["2026-11-24"],
  );
  expect(f.errors).toEqual([]);
});
