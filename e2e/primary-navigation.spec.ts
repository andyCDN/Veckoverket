import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const mobile of [false, true]) {
  test(`veckovy, jobb och nätverk är separata ingångar ${mobile ? "på mobil" : "på dator"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("./");
    const nav = page.getByRole("navigation", { name: "Huvudnavigation" });
    for (const label of ["Vecka", "Jobb", "Nätverk"]) {
      const button = nav.getByRole("button", { name: label, exact: true });
      await expect(button).toBeInViewport();
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await nav.getByRole("button", { name: "Jobb", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Jobb", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ny ansökan", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Visa jobböversikt" })
        .getByRole("button"),
    ).toHaveCount(2);
    await expect(
      page
        .getByRole("group", { name: "Visa jobböversikt" })
        .getByRole("button", { name: "Kontakter", exact: true }),
    ).toHaveCount(0);
    await expect(
      nav.getByRole("button", { name: "Jobb", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await nav.getByRole("button", { name: "Nätverk", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Nätverk", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ny kontakt", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Visa jobböversikt" })
        .getByRole("button", { name: "Ansökningar", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Uppföljningar", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Nätverk", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Jobb", exact: true }).click();
    await expect(
      nav.getByRole("button", { name: "Jobb", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Nätverk", exact: true }).click();
    await expect(
      nav.getByRole("button", { name: "Nätverk", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await nav.getByRole("button", { name: "Vecka", exact: true }).click();
    await expect(
      page.locator(mobile ? ".studio-week" : ".calendar-grid"),
    ).toBeVisible();
    await expect(page.locator(".week-balance-bar")).toHaveCount(0);
    await expect(
      nav.getByRole("button", { name: "Vecka", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("button", { name: "Min vecka", exact: true }),
    ).toHaveCount(0);
    await expect(
      nav.getByRole("button", { name: "Inställningar", exact: true }),
    ).not.toBeVisible();
    await nav.getByText("Mer", { exact: true }).click();
    await nav
      .getByRole("button", { name: "Inställningar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tillgänglighet och tidsmål" }),
    ).toBeVisible();
    await (
      mobile
        ? page.locator(".studio-appbar a")
        : page.getByRole("link", { name: "Veckoverket – till startsidan" })
    ).click();
    await expect(
      page.locator(mobile ? ".studio-week" : ".calendar-grid"),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Vecka", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/primary-navigation-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .include(".workspace-navigation")
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}
