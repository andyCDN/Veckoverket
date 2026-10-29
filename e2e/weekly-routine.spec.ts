import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("måndagsplanering och fredagsövning sparas, följer rätt vecka och går att bocka av i mobilappen", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-26T08:00:00+01:00") });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { get: () => true }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("./");
  const start = page
    .locator(".calendar-entry")
    .filter({ hasText: "Veckostart" });
  await start.locator(".calendar-block").click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Veckostart");
  await page
    .getByLabel(/^Veckans startplan/)
    .fill("Två ansökningar på måndag och projektarbete på onsdag.");
  await page
    .getByRole("button", { name: "Markera som genomförd", exact: true })
    .click();
  await expect(
    start.getByRole("checkbox", { name: /^Genomförd:/ }),
  ).toBeChecked();
  await page.reload();
  await start.locator(".calendar-block").click();
  await expect(page.getByLabel(/^Veckans startplan/)).toHaveValue(
    "Två ansökningar på måndag och projektarbete på onsdag.",
  );
  await page.getByRole("button", { name: "Stäng dialog", exact: true }).click();
  await page.getByRole("button", { name: /^Visa fredag/ }).click();
  const review = page
    .locator(".calendar-entry")
    .filter({ hasText: "Veckoavstämning" });
  await review.locator(".calendar-block").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("Veckoavstämning");
  await page
    .getByLabel(/^Sammanfattning av veckan/)
    .fill("Utbildningsmodulerna klara.");
  await page.getByLabel(/^Det som återstår/).fill("En ansökan återstår.");
  await dialog
    .getByLabel("Skicka två genomarbetade ansökningar", { exact: true })
    .check();
  await expect(
    page.getByRole("region", { name: "Måluppfyllelse" }),
  ).toContainText("1 av 3 uppgifter · 33 %");
  await page
    .getByLabel(/^Bedömning av måluppfyllelse/)
    .fill("Jobbmålet delvis uppnått.");
  await page
    .getByLabel(/^Plan inför nästa vecka/)
    .fill("Boka in den återstående ansökan på tisdag.");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/friday-exercise-320.png" });
  await page
    .getByRole("button", { name: "Markera som genomförd", exact: true })
    .click();
  await expect(
    review.getByRole("checkbox", { name: /^Genomförd:/ }),
  ).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: /^Visa fredag/ }).click();
  await review.locator(".calendar-block").click();
  await expect(page.getByLabel(/^Bedömning av måluppfyllelse/)).toHaveValue(
    "Jobbmålet delvis uppnått.",
  );
  await page
    .getByRole("button", { name: "Öppna nästa vecka", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
  );
  expect(
    stored.weeks["2026-11-02"].activities.filter(
      (a: { routine?: string }) => a.routine,
    ),
  ).toHaveLength(2);
  expect(stored.reflections["2026-10-26"].next).toBe(
    "Boka in den återstående ansökan på tisdag.",
  );
  expect(stored.reflections["2026-11-02"]).toBeUndefined();
});
