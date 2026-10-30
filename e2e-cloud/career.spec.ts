import { test, expect } from "@playwright/test";
import {
  mock,
  login,
  logout,
  status,
  plan,
  row,
  week,
  userA,
  userB,
} from "./helpers";
test("ansökningar och kontaktlogg molnsparas, återläses och hålls åtskilda mellan konton", async ({
  page,
}) => {
  const original = plan("Molnplan");
  original.weeks[week].activities[0].status = "done";
  const f = await mock(page, row(original));
  f.documents.set(userB, row(plan("Andra kontot")));
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  const nav = () =>
    page
      .getByRole("navigation", { name: "Huvudnavigation" })
      .getByRole("button", { name: "Jobb & nätverk", exact: true })
      .click();
  await nav();
  await page.getByRole("button", { name: "Ny ansökan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Organisation", { exact: true }).fill("Bolaget");
  await dialog.getByLabel("Tjänst", { exact: true }).fill("Analytiker");
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(f.documents.get(userA)!.data.applications?.[0].role).toBe(
    "Analytiker",
  );
  await page.getByRole("button", { name: "Kontaktlogg", exact: true }).click();
  await page.getByRole("button", { name: "Ny kontakt", exact: true }).click();
  await dialog.getByLabel("Namn", { exact: true }).fill("Kim");
  await dialog
    .getByRole("button", { name: "Lägg till kontaktanteckning" })
    .click();
  await dialog
    .getByRole("textbox", { name: "Anteckning", exact: true })
    .fill("Samtal om rollen");
  await dialog
    .getByRole("button", { name: "Spara kontakt", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(f.documents.get(userA)!.data.contacts?.[0].entries[0].notes).toBe(
    "Samtal om rollen",
  );
  await page.getByRole("button", { name: "Ansökningar", exact: true }).click();
  await page
    .getByRole("button", { name: "Redigera ansökan", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("interview");
  await dialog
    .getByLabel("Nästa steg", { exact: true })
    .fill("Förbered intervju");
  await dialog.getByLabel("Uppföljningsdatum").fill("2026-10-30");
  await dialog.getByRole("checkbox", { name: "Kim", exact: true }).check();
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(
    f.documents.get(userA)!.data.applications?.[0].history?.map((e) => e.kind),
  ).toEqual(["created", "status", "action"]);
  expect(f.documents.get(userA)!.data.applications?.[0].contactIds).toEqual([
    f.documents.get(userA)!.data.contacts![0].id,
  ]);
  expect(f.documents.get(userA)!.data.weeks).toEqual(original.weeks);
  await page.reload();
  await status(page, "Sparat i molnet");
  await nav();
  await expect(
    page.getByRole("heading", { name: "Analytiker · Bolaget" }),
  ).toBeVisible();
  await logout(page);
  await login(page, "b@example.test");
  await status(page, "Sparat i molnet");
  await nav();
  await expect(
    page.getByRole("heading", { name: "Analytiker · Bolaget" }),
  ).toHaveCount(0);
  expect(f.documents.get(userB)!.data.applications).toBeUndefined();
  expect(f.writes.every((w) => w.user === userA)).toBe(true);
  expect(f.errors).toEqual([]);
});
