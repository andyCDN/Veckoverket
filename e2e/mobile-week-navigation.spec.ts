import { test, expect } from "@playwright/test";

test("mobilvyn visar veckopilar utan att öppna verktygsmenyn", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date("2026-10-30T10:00:00+01:00") });
  await page.goto("./");
  const controls = page.locator(".studio-dateband");
  const next = page.getByRole("button", { name: "Nästa vecka", exact: true });
  const previous = page.getByRole("button", {
    name: "Föregående vecka",
    exact: true,
  });
  await expect(controls).toContainText("V.44");
  await expect(next).toBeVisible();
  await expect(previous).toBeVisible();
  await next.click();
  await expect(controls).toContainText("V.45");
  await previous.click();
  await expect(controls).toContainText("V.44");
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(next).toBeInViewport();
  await expect(previous).toBeInViewport();
  await next.click();
  await expect(controls).toContainText("V.45");
});
