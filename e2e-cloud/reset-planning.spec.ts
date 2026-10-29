import { test, expect } from "@playwright/test";
import { mock, login, status, plan, row, userA, userB, week } from "./helpers";

async function openReset(page: import("@playwright/test").Page) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Inställningar", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Nollställ planering och statistik",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", {
      name: "Jag vill ta bort sparad planering och statistik.",
      exact: true,
    })
    .check();
}
test("nollställning köas offline, sparas i rätt konto och återläses tom", async ({
  page,
}) => {
  const original = plan("Mitt konto");
  original.settings.musicMornings = 1;
  original.weeks[week].activities[0].status = "done";
  const f = await mock(page, row(original));
  f.documents.set(userB, row(plan("Annat konto")));
  const other = structuredClone(f.documents.get(userB));
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await openReset(page);
  f.offline = true;
  await page.getByRole("button", { name: "Nollställ nu", exact: true }).click();
  await expect(page.locator(".calendar-entry")).toHaveCount(0);
  await status(page, "Molnet har inte bekräftat ändringarna");
  expect(
    f.documents.get(userA)!.data.weeks[week].activities.length,
  ).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await expect(page.locator(".calendar-entry")).toHaveCount(0);
  f.offline = false;
  await page.getByRole("button", { name: "Försök igen", exact: true }).click();
  await status(page, "Sparat i molnet");
  const saved = f.documents.get(userA)!.data;
  expect(saved.weeks[week].activities).toEqual([]);
  expect(saved.goals).toEqual([]);
  expect(saved.tasks).toEqual([]);
  expect(saved.reflections).toEqual({});
  expect(saved.settings).toEqual(original.settings);
  expect(saved.profile).toEqual(original.profile);
  expect(f.documents.get(userB)).toEqual(other);
  await expect(page.locator(".cloud-auth")).not.toBeVisible();
  expect(f.errors).toEqual([]);
});
test("nollställning väntar tills en befintlig versionskonflikt har lösts", async ({
  page,
}) => {
  const f = await mock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  f.documents.set(userA, row(plan("Nyare molnversion"), 3));
  await page
    .locator(".calendar-entry")
    .first()
    .getByRole("checkbox", { name: /^Genomförd:/ })
    .check();
  await status(page, "Olika versioner på enheterna");
  await openReset(page);
  await expect(
    page.getByRole("button", { name: "Nollställ nu", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText(
    "Lös versionskonflikten",
  );
  expect(f.documents.get(userA)!.data.profile.name).toBe("Nyare molnversion");
  expect(f.documents.get(userA)!.revision).toBe(3);
  expect(f.errors).toEqual([]);
});
