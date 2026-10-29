import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { time } from "../src/lib/date";

test("automatisk mobilplanering flyttar förslag runt bokningar, sparas och kan pausas", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-02T08:00:00+01:00") });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { get: () => true }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("./");
  const stored = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
  const open = async () => {
    await page.locator(".calendar-tools-menu > summary").click();
    await page
      .getByRole("button", { name: "Planera veckan", exact: true })
      .click();
  };
  await open();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("Automatisk veckoplanering");
  await expect(
    dialog.getByRole("checkbox", { name: /^Automatisk planering/ }),
  ).toBeChecked();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations.map((v) => v.id)).toEqual([]);
  await page
    .getByRole("button", { name: "Aktivera och använd planen", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const before = await stored();
  const week = "2026-11-02";
  expect(before.settings.autoPlanning).toBe(true);
  const focus = before.weeks[week].activities.filter(
    (a: { date: string; categoryId: string; start: number }) =>
      a.date === week &&
      a.start < 720 &&
      ["career", "learning"].includes(a.categoryId),
  );
  expect(
    new Set(focus.map((a: { categoryId: string }) => a.categoryId)).size,
  ).toBe(2);
  const slot = focus.find(
    (a: { categoryId: string }) => a.categoryId === "learning",
  );
  await page.getByRole("button", { name: "Ny aktivitet", exact: true }).click();
  await page.getByLabel("Namn", { exact: true }).fill("Bokat intervjumöte");
  await page.getByLabel("Datum", { exact: true }).fill(slot.date);
  await page.getByLabel("Start", { exact: true }).fill(time(slot.start));
  await page.getByLabel("Slut", { exact: true }).fill(time(slot.end));
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const after = await stored();
  const booking = after.weeks[week].activities.find(
    (a: { title: string }) => a.title === "Bokat intervjumöte",
  );
  expect(booking.source).toBe("manual");
  expect(
    after.weeks[week].activities
      .filter(
        (a: { id: string; date: string; start: number; end: number }) =>
          a.id !== booking.id && a.date === booking.date,
      )
      .every(
        (a: { start: number; end: number }) =>
          a.end <= booking.start || a.start >= booking.end,
      ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Bokat intervjumöte" }),
  ).toBeVisible();
  expect((await stored()).settings.autoPlanning).toBe(true);
  await open();
  await page
    .getByRole("button", { name: "Pausa automatisk planering", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const paused = await stored();
  expect(paused.settings.autoPlanning).toBe(false);
  expect(paused.weeks[week]).toEqual(after.weeks[week]);
});
