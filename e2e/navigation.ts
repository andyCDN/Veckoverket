import type { Page } from "@playwright/test";

export async function navigateTo(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Huvudnavigation" });
  const button = nav.getByRole("button", { name, exact: true });
  if (!(await button.isVisible()))
    await nav.getByText("Mer", { exact: true }).click();
  await button.click();
}
