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

export async function addItem(
  page: Page,
  name: "Pass" | "Uppgift" | "Mål" | "Vana",
) {
  const menu = page.locator(".add-menu");
  if (!(await menu.evaluate((el) => el.hasAttribute("open"))))
    await menu.locator("summary").click();
  await menu.getByRole("button", { name, exact: true }).click();
}
export async function openContext(page: Page) {
  const context = page.locator(".week-context");
  if (!(await context.evaluate((el) => el.hasAttribute("open"))))
    await context.locator(":scope > summary").click();
}
