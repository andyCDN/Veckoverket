import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import type { Activity } from "../src/lib/types";

test("veckovyn visar bokad fördelning och gemensam tid utan att ändra planer eller avklarade pass", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-30T10:00:00+01:00") });
  const week = "2026-10-26",
    data = createData();
  const make = (
    id: string,
    date: string,
    start: number,
    end: number,
    extra: Partial<Activity> = {},
  ): Activity => ({
    id,
    title: id,
    description: "",
    categoryId: "career",
    date,
    start,
    end,
    estimatedMinutes: end - start,
    blockType: "flexible",
    priority: 3,
    status: "planned",
    source: "manual",
    ...extra,
  });
  data.weeks = {
    [week]: {
      week,
      generatedAt: "2026-10-26T06:00:00Z",
      weeklyRoutinesFrom: week,
      activities: [
        make("Anpassa CV", week, 510, 600, { status: "done" }),
        make("Skriv ansökan", "2026-10-27", 510, 600),
        make("Intervju", "2026-10-29", 510, 600),
        make("Kalendermöte", "2026-10-29", 540, 630, {
          categoryId: "rest",
          blockType: "locked",
        }),
        make("Nätverkssamtal", "2026-10-30", 630, 720, {
          categoryId: "networking",
        }),
      ],
    },
  };
  await page.goto("./");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page.evaluate(
    (value) =>
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value)),
    data,
  );
  await page.reload();
  const overview = page.getByRole("region", { name: "Veckans tidsöversikt" });
  await expect(overview).toContainText("Jobbsök 4,5 h · 75 %");
  await expect(overview).toContainText("Nätverkande 1,5 h · 25 %");
  await expect(overview.locator("dl")).toContainText(
    "Planerat7,5 hGenomfört1,5 hÅterstår6 h",
  );
  const stored = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
  const before = await stored();
  const entry = (id: string) => page.locator(`[data-activity-id="${id}"]`);
  const first = (await entry("Anpassa CV").boundingBox())!;
  const second = (await entry("Skriv ansökan").boundingBox())!;
  expect(Math.abs(first.y - second.y)).toBeLessThan(1);
  const interview = (await entry("Intervju").boundingBox())!,
    meeting = (await entry("Kalendermöte").boundingBox())!;
  expect(interview.x + interview.width).toBeLessThanOrEqual(meeting.x);
  const widths = await page
    .locator(".day-heading")
    .evaluateAll((days) =>
      days.map((day) => day.getBoundingClientRect().width),
    );
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
  await expect(
    entry("Anpassa CV").getByRole("checkbox", { name: /^Genomförd:/ }),
  ).toBeChecked();
  await page.screenshot({
    path: "test-results/week-overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Visa måndag/ }).click();
  expect(await stored()).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".day-shell:visible")).toHaveCount(1);
  await expect(
    entry("Anpassa CV").getByRole("checkbox", { name: /^Genomförd:/ }),
  ).toBeChecked();
  await page.screenshot({
    path: "test-results/week-overview-mobile.png",
    fullPage: true,
  });
  await page.reload();
  expect(await stored()).toEqual(before);
});
