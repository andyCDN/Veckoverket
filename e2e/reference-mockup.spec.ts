import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import type { Activity } from "../src/lib/types";
test("den bifogade mockupen: masthead, kompakt kalender, helg och dagvy bevarar alla sparade aktiviteter", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.install({ time: new Date("2026-10-30T10:00:00+01:00") });
  const data = createData(),
    week = "2026-10-26";
  data.settings = {
    ...data.settings,
    start: 480,
    end: 1020,
    autoPlanning: false,
  };
  const make = (
    day: number,
    title: string,
    start: number,
    end: number,
    categoryId = "career",
    status: Activity["status"] = "done",
  ): Activity => ({
    id: `ref-${day}-${start}`,
    title,
    description: "",
    date: `2026-10-${26 + day}`,
    start,
    end,
    categoryId,
    estimatedMinutes: end - start,
    blockType:
      categoryId === "rest" || categoryId === "family" ? "locked" : "flexible",
    priority: 3,
    status,
    source: "manual",
  });
  const activities = [
    make(0, "Anpassa CV", 510, 600),
    make(0, "Skriv ansökan", 615, 690),
    make(0, "Pythonkurs", 780, 840, "learning"),
    make(0, "Träning", 900, 960, "health"),
    make(1, "Sök tjänster", 510, 600),
    make(1, "Samtal med Kim", 630, 675, "networking"),
    make(1, "Ansökan · analytiker", 780, 870),
    make(2, "Intervjuförberedelse", 510, 600),
    make(2, "Intervju · Bolaget", 630, 690),
    make(2, "Gitarr", 840, 900, "music"),
    make(3, "Följ upp ansökningar", 510, 600),
    make(3, "Nätverkssamtal", 630, 675, "networking"),
    make(3, "Portfölj", 780, 840),
    make(4, "Skicka ansökan", 510, 600, "career", "planned"),
    make(4, "Lärande", 630, 690, "learning", "planned"),
    make(4, "Kontakta rekryterare", 780, 840, "career", "planned"),
    make(4, "Veckogenomgång", 930, 960, "weekly-planning", "planned"),
    ...[0, 1, 2, 3, 4].map((day) =>
      make(day, "Lunch", 720, 780, "rest", day === 4 ? "planned" : "done"),
    ),
    make(5, "Familj", 600, 780, "family", "planned"),
  ];
  data.weeks = {
    [week]: {
      week,
      activities,
      rules: data.settings,
      generatedAt: "",
      weeklyRoutinesFrom: week,
    },
  };
  data.deadlines = [
    {
      id: "unplanned",
      title: "Ansökan",
      date: "2026-10-30",
      minute: 1020,
      categoryId: "career",
      steps: [{ id: "work", title: "Arbetspass", minutes: 45 }],
    },
  ];
  await page.goto("./");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page.evaluate(
    (value) =>
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value)),
    data,
  );
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  const stored = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
  const before = await stored();
  const header = page.locator(".planner-header"),
    summary = page.getByRole("region", { name: "Veckans tidsöversikt" });
  await expect(header.locator(".masthead-week")).toHaveText("Vecka 44");
  const logo = await header.locator(".brand-title").evaluate((el) => ({
    color: getComputedStyle(el).color,
    family: getComputedStyle(el).fontFamily,
  }));
  expect(logo.color).toBe("rgb(255, 247, 226)");
  expect(logo.family).toContain("masthead");
  await expect(page.locator(".day-shell:visible")).toHaveCount(5);
  await expect(page.locator(".weekend-summaries")).toContainText("Familj");
  await expect(page.locator(".week-unplanned")).toContainText(
    "Ansökan · 45 min",
  );
  const toolbar = (await page.locator(".week-toolbar").boundingBox())!,
    stats = (await summary.boundingBox())!;
  expect(stats.y - (toolbar.y + toolbar.height)).toBeLessThan(5);
  const first = page.locator('[data-activity-id="ref-0-510"]'),
    box = (await first.boundingBox())!,
    check = (await first.locator(".calendar-completion").boundingBox())!;
  expect(box.height).toBeLessThan(90);
  expect(check.y - box.y).toBeLessThan(7);
  expect(box.x + box.width - check.x).toBeLessThan(30);
  await page.screenshot({ path: "test-results/reference-mockup-1280.png" });
  await page.getByRole("button", { name: "Visa helgen", exact: true }).click();
  await expect(page.locator(".day-shell:visible")).toHaveCount(6);
  await expect(page.locator('[data-activity-id="ref-5-600"]')).toBeVisible();
  await page.getByRole("button", { name: "Dölj helgen", exact: true }).click();
  await expect(page.locator(".day-shell:visible")).toHaveCount(5);
  await page
    .getByRole("group", { name: "Kalendervy", exact: true })
    .getByRole("button", { name: "Dag", exact: true })
    .click();
  await expect(page.locator(".day-shell:visible")).toHaveCount(1);
  await expect(page.locator(".day-shell:visible")).toHaveClass(/is-today/);
  await page
    .getByRole("group", { name: "Kalendervy", exact: true })
    .getByRole("button", { name: "Vecka", exact: true })
    .click();
  await expect(page.locator(".day-shell:visible")).toHaveCount(5);
  expect(await stored()).toEqual(before);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".calendar-block:visible")).toHaveCount(
    activities.length,
  );
  await expect(page.locator('[data-activity-id="ref-5-600"]')).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".day-shell:visible")).toHaveCount(1);
  await page.screenshot({ path: "test-results/reference-mockup-mobile.png" });
  expect(await stored()).toEqual(before);
});
