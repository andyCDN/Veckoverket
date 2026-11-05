import type { Page } from "@playwright/test";

export async function navigateTo(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Huvudnavigation" });
  const button = nav.getByRole("button", { name, exact: true });
  if (await button.isVisible()) return button.click();
  const profile = page.getByLabel("Profil och fler vyer", { exact: true });
  if (await profile.isVisible()) {
    if (name === "Inställningar")
      return page.getByRole("button", { name, exact: true }).click();
    if (name === "Mål & aktiviteter") {
      await nav.getByRole("button", { name: "Uppgifter", exact: true }).click();
      return page.getByText("Mål och prioriteringar", { exact: true }).click();
    }
    await profile.click();
    return page
      .getByRole("navigation", { name: "Fler vyer" })
      .getByRole("button", { name, exact: true })
      .click();
  }
  await nav.getByText("Mer", { exact: true }).click();
  await button.click();
}

export async function openToday(page: Page) {
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .waitFor({ state: "visible" });
  const today = page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Idag", exact: true });
  if (await today.isVisible()) await today.click();
}
