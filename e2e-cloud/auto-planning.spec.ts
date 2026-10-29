import { test, expect } from "@playwright/test";
import { mock, login, status, userA, week } from "./helpers";

test("automatisk planering synkar bokningar och bevarar historiken i molnkontot", async ({
  page,
}) => {
  const f = await mock(page);
  const previous = structuredClone(
    f.documents
      .get(userA)!
      .data.weeks[week].activities.filter((a) => a.date < "2026-10-29"),
  );
  await page.goto("./");
  await login(page);
  await page
    .getByRole("button", { name: "Planera veckan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aktivera och använd planen", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(f.documents.get(userA)!.data.settings.autoPlanning).toBe(true);
  await page.getByRole("button", { name: "Ny aktivitet", exact: true }).click();
  await page.getByLabel("Namn", { exact: true }).fill("Bokat fredagsmöte");
  await page.getByLabel("Datum", { exact: true }).fill("2026-10-30");
  await page.getByLabel("Start", { exact: true }).fill("13:00");
  await page.getByLabel("Slut", { exact: true }).fill("13:30");
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await status(page, "Sparat i molnet");
  const saved = f.documents.get(userA)!.data;
  expect(
    saved.weeks[week].activities.filter((a) => a.date < "2026-10-29"),
  ).toEqual(previous);
  const booking = saved.weeks[week].activities.find(
    (a) => a.title === "Bokat fredagsmöte",
  )!;
  expect(
    saved.weeks[week].activities
      .filter((a) => a.id !== booking.id && a.date === booking.date)
      .every((a) => a.end <= booking.start || a.start >= booking.end),
  ).toBe(true);
  await page.reload();
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Bokat fredagsmöte" }),
  ).toBeVisible();
  expect(f.errors).toEqual([]);
});
