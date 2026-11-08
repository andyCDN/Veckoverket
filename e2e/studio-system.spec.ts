import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { navigateTo } from "./navigation";

test("desktop och mobil delar tryckpalett, navigation och kort utan att ändra innehållet", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-05T09:00:00Z") });
  await page.goto("./");
  await expect(
    page.getByRole("navigation", { name: "Huvudnavigation" }),
  ).toBeVisible();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const root = page.locator(".mockup-workspace");
    if (width <= 390)
      await expect(root).toHaveAttribute("data-mobile-design", "studio");
    else await expect(page.locator(".calendar-grid")).toBeVisible();
    const palette = await root.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        paper: s.backgroundColor,
        ink: s.color,
        blue: s.getPropertyValue("--blue").trim(),
        lime: s.getPropertyValue("--yellow").trim(),
      };
    });
    expect(palette).toEqual({
      paper: "rgb(250, 247, 242)",
      ink: "rgb(18, 30, 66)",
      blue: "#1633a6",
      lime: "#d4e84b",
    });
    const nav = page.getByRole("navigation", { name: "Huvudnavigation" });
    expect(
      await nav
        .getByRole("button", { name: "Vecka", exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(22, 51, 166)");
    for (const name of ["Jobb", "Nätverk"]) {
      const button = nav.getByRole("button", { name, exact: true });
      expect(
        await button.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe("rgb(250, 247, 242)");
      await expect(button).toBeInViewport();
    }
    const logo =
      width <= 390
        ? page.locator(".studio-appbar strong")
        : page.locator(".brand-title");
    expect(await logo.evaluate((el) => getComputedStyle(el).color)).toBe(
      "rgb(18, 30, 66)",
    );
    if (width > 390)
      expect(await logo.evaluate((el) => getComputedStyle(el).maskImage)).toBe(
        "none",
      );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/shared-studio-week-${width}.png`,
      fullPage: false,
    });
    await navigateTo(page, "Nätverk");
    const add = page.getByRole("button", { name: "Ny kontakt", exact: true });
    expect(
      await add.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(22, 51, 166)");
    await page.screenshot({
      path: `test-results/shared-studio-network-${width}.png`,
      fullPage: false,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await navigateTo(page, "Vecka");
  }
});
