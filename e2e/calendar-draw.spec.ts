import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import { weekTimeline } from "../src/lib/week-timeline";
import type { Activity } from "../src/lib/types";

test("drar direkt i veckokalenderns tomma yta med korrekt tid på en utvidgad tidsaxel", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-02T07:00:00Z") });
  const data = createData();
  data.settings = {
    ...data.settings,
    autoPlanning: false,
    start: 480,
    end: 1020,
  };
  const booked: Activity = {
    id: "short",
    title: "Kort bokning",
    date: "2026-11-02",
    start: 510,
    end: 525,
    estimatedMinutes: 15,
    categoryId: "career",
    status: "planned",
    blockType: "locked",
    priority: 3,
    description: "",
    source: "manual",
  };
  data.weeks = {
    "2026-11-02": {
      week: "2026-11-02",
      generatedAt: "",
      weeklyRoutinesFrom: "2026-11-02",
      activities: [booked],
      rules: data.settings,
    },
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem("veckoverket.workspace.v1"))
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data));
  }, data);
  await page.goto("./");
  const column = page.locator('.day-column[data-date="2026-11-03"]');
  await expect(column).toBeVisible();
  await column.scrollIntoViewIfNeeded();
  const timeline = weekTimeline([booked], data.settings);
  let box = (await column.boundingBox())!;
  let x = box.x + box.width / 2;
  let y = (minute: number) => box.y + timeline.position(minute);
  await page.mouse.move(x, y(660));
  await page.mouse.down();
  await page.mouse.move(x, y(705), { steps: 8 });
  await expect(column.locator(".calendar-direct-selection")).toHaveText(
    "11:00–11:45",
  );
  await page.screenshot({ path: "test-results/calendar-direct-draw.png" });
  await page.mouse.up();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Datum", { exact: true })).toHaveValue(
    "2026-11-03",
  );
  await expect(dialog.getByLabel("Start", { exact: true })).toHaveValue(
    "11:00",
  );
  await expect(dialog.getByLabel("Slut", { exact: true })).toHaveValue("11:45");
  await dialog.getByLabel("Namn", { exact: true }).fill("Direktmarkerat pass");
  await dialog
    .getByRole("button", { name: "Spara pass", exact: true })
    .click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
  );
  expect(saved.weeks["2026-11-02"].activities).toEqual(
    expect.arrayContaining([
      booked,
      expect.objectContaining({
        title: "Direktmarkerat pass",
        date: "2026-11-03",
        start: 660,
        end: 705,
      }),
    ]),
  );
  const updated = weekTimeline(
    saved.weeks["2026-11-02"].activities,
    data.settings,
  );
  await column.scrollIntoViewIfNeeded();
  box = (await column.boundingBox())!;
  x = box.x + box.width / 2;
  y = (minute: number) => box.y + updated.position(minute);
  await page.mouse.move(x, y(900));
  await page.mouse.down();
  await page.mouse.move(x, y(855), { steps: 8 });
  await expect(column.locator(".calendar-direct-selection")).toHaveText(
    "14:15–15:00",
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
  await page.mouse.move(x, y(900));
  await page.mouse.down();
  await page.mouse.move(x, y(855), { steps: 8 });
  await page.mouse.up();
  await expect(dialog.getByLabel("Start", { exact: true })).toHaveValue(
    "14:15",
  );
  await expect(dialog.getByLabel("Slut", { exact: true })).toHaveValue("15:00");
  await dialog
    .getByRole("button", { name: "Stäng dialog", exact: true })
    .click();
  await page.locator('[data-activity-id="short"] .calendar-block').click();
  await expect(dialog.getByLabel("Namn", { exact: true })).toHaveValue(
    "Kort bokning",
  );
  await dialog
    .getByRole("button", { name: "Stäng dialog", exact: true })
    .click();
  const touchColumn = page.locator('.day-column[data-date="2026-11-05"]');
  await touchColumn.scrollIntoViewIfNeeded();
  const touchBox = (await touchColumn.boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  const touchPoint = (minute: number) => ({
    x: touchBox.x + touchBox.width / 2,
    y: touchBox.y + updated.position(minute),
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint(780)],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touchPoint(810)],
  });
  await expect(touchColumn.locator(".calendar-direct-selection")).toHaveText(
    "13:00–13:30",
  );
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(dialog.getByLabel("Datum", { exact: true })).toHaveValue(
    "2026-11-05",
  );
  await expect(dialog.getByLabel("Start", { exact: true })).toHaveValue(
    "13:00",
  );
  await expect(dialog.getByLabel("Slut", { exact: true })).toHaveValue("13:30");
  await dialog
    .getByRole("button", { name: "Stäng dialog", exact: true })
    .click();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
  );
  expect(after.weeks["2026-11-02"].activities).toEqual(
    saved.weeks["2026-11-02"].activities,
  );
});
