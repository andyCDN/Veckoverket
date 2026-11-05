import type { Page } from "@playwright/test";

export async function navigateTo(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Huvudnavigation" });
  const button = nav.getByRole("button", { name, exact: true });
  if (!(await button.isVisible()))
    await nav.getByText("Mer", { exact: true }).click();
  await button.click();
}

export async function openToday(page: Page) {
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .waitFor({ state: "visible" });
  if (await page.locator('[data-mobile-design="studio"]').isVisible())
    await page
      .getByRole("button", { name: "Visa dagplanering", exact: true })
      .click();
}
