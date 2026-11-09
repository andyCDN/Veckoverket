import { test, expect, type Page } from "@playwright/test";
import { openToday } from "./navigation";
import { createData } from "../src/lib/defaults";

async function openPicker(page: Page, mobile = false) {
  await page.clock.install({ time: new Date("2026-11-02T07:00:00Z") });
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const data = createData();
  data.weeks["2026-11-02"] = {
    week: "2026-11-02",
    generatedAt: "2026-11-02T06:00:00Z",
    weeklyRoutinesFrom: "2026-11-02",
    activities: [],
  };
  await page.addInitScript((value) => {
    localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value));
  }, data);
  await page.goto("./");
  if (mobile) await openToday(page);
  if (!mobile)
    await page.getByRole("button", { name: "Dag", exact: true }).click();
  await page.getByText("Markera tid för nytt pass", { exact: true }).click();
  const surface = page.getByRole("group", { name: "Markera tidsperiod" });
  await surface.scrollIntoViewIfNeeded();
  return surface;
}

test("drar ett intervall i dagvyn och sparar ett pass med vald längd", async ({
  page,
}) => {
  const surface = await openPicker(page);
  const box = (await surface.boundingBox())!;
  const y = (minute: number) => box.y + ((minute - 480) / 480) * box.height;
  await page.mouse.move(box.x + box.width / 2, y(660));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y(705), { steps: 8 });
  await expect(surface).toContainText("11:00–11:45");
  await page.mouse.up();
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("11:00");
  await expect(page.getByLabel("Slut", { exact: true })).toHaveValue("11:45");
  await page.getByLabel("Namn", { exact: true }).fill("Markerat pass");
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
  );
  expect(saved.weeks["2026-11-02"].activities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: "Markerat pass",
        date: "2026-11-02",
        start: 660,
        end: 705,
        estimatedMinutes: 45,
      }),
    ]),
  );
});

test("normaliserar drag uppåt och låter Escape avbryta", async ({ page }) => {
  const surface = await openPicker(page);
  const box = (await surface.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = (minute: number) => box.y + ((minute - 480) / 480) * box.height;
  await page.mouse.move(x, y(705));
  await page.mouse.down();
  await page.mouse.move(x, y(660), { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.mouse.move(x, y(705));
  await page.mouse.down();
  await page.mouse.move(x, y(660), { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("11:00");
  await expect(page.getByLabel("Slut", { exact: true })).toHaveValue("11:45");
});

test("mobilen stöder pekdrag och avbryter vid touchcancel", async ({
  page,
}) => {
  const surface = await openPicker(page, true);
  const box = (await surface.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = (minute: number) => box.y + ((minute - 480) / 480) * box.height;
  const session = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
    minute = 660,
  ) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd" || type === "touchCancel"
          ? []
          : [{ x, y: y(minute) }],
    });
  await touch("touchStart");
  await touch("touchMove", 705);
  await touch("touchCancel");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await touch("touchStart");
  await touch("touchMove", 705);
  await touch("touchEnd");
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("11:00");
  await expect(page.getByLabel("Slut", { exact: true })).toHaveValue("11:45");
});

test("tangentbordet väljer ett intervall utan att spara före bekräftelse", async ({
  page,
}) => {
  const surface = await openPicker(page);
  const before = await page.evaluate(() =>
    localStorage.getItem("veckoverket.workspace.v1"),
  );
  await surface.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("08:15");
  await expect(page.getByLabel("Slut", { exact: true })).toHaveValue("08:45");
  await page.getByRole("button", { name: "Stäng dialog", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("veckoverket.workspace.v1")),
  ).toBe(before);
});
