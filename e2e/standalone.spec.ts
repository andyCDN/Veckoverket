import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const platform of ["ios", "chromium"] as const) {
  test(`installerad mobilvy: ${platform}, navigation, skärmkanter och tangentbord`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.clock.install({ time: new Date("2026-10-29T10:00:00+01:00") });
    await page.addInitScript((mode) => {
      if (mode === "ios")
        Object.defineProperty(navigator, "standalone", { get: () => true });
      else {
        const media = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
          const result = media(query);
          if (query === "(display-mode: standalone)")
            Object.defineProperty(result, "matches", { value: true });
          return result;
        };
      }
    }, platform);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute(
      "data-app-mode",
      "standalone",
    );
    const nav = page.getByRole("navigation", { name: "Huvudnavigation" });
    for (const [width, height] of [
      [320, 740],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((landscape) => {
        const style = document.documentElement.style;
        style.setProperty("--app-safe-top", landscape ? "0px" : "24px");
        style.setProperty("--app-safe-bottom", "24px");
        style.setProperty("--app-safe-left", landscape ? "30px" : "0px");
        style.setProperty("--app-safe-right", landscape ? "30px" : "0px");
      }, width > height);
      await expect(page.locator("html")).toHaveAttribute(
        "data-layout",
        "daily",
      );
      await nav.getByRole("button", { name: "Idag", exact: true }).click();
      await expect(page.locator(".day-shell:visible")).toHaveCount(1);
      const bar = (await page.locator(".navigation-bar").boundingBox())!;
      expect(Math.abs(bar.y + bar.height - height)).toBeLessThan(2);
      for (const button of await nav.getByRole("button").all()) {
        const box = (await button.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator(".calendar-viewport")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      const first = (await page
        .locator(".day-shell.is-selected .calendar-entry")
        .first()
        .boundingBox())!;
      expect(first.y).toBeLessThan(bar.y);
      if (width > height) {
        const check = (await page
          .locator(".day-shell.is-selected .calendar-entry")
          .first()
          .getByRole("checkbox", { name: /^Genomförd:/ })
          .boundingBox())!;
        expect(check.y + check.height).toBeLessThanOrEqual(bar.y);
      }
      await page.screenshot({
        path: `test-results/installed-${platform}-${width}.png`,
      });
      const add = page.getByRole("button", {
        name: /^Lägg till aktivitet torsdag/,
      });
      await add.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const target = (await add.boundingBox())!;
      expect(target.y + target.height).toBeLessThanOrEqual(bar.y + 1);
      await nav
        .getByRole("button", { name: "Inställningar", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Tillgänglighet och tidsmål" }),
      ).toBeVisible();
      expect(await page.evaluate(() => scrollY)).toBe(0);
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        scan.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.failureSummary),
        })),
      ).toEqual([]);
    }
    await nav.getByRole("button", { name: "Idag", exact: true }).click();
    for (let i = 0; i < 3; i++)
      await page
        .getByRole("button", { name: "Välj föregående dag", exact: true })
        .click();
    await nav.getByRole("button", { name: "Idag", exact: true }).click();
    await expect(page.locator(".day-focus-name")).toContainText(
      "Torsdag29 oktober 2026",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      const style = document.documentElement.style;
      style.setProperty("--app-safe-top", "24px");
      style.setProperty("--app-safe-left", "0px");
      style.setProperty("--app-safe-right", "0px");
    });
    const entry = page
      .locator(".day-shell.is-selected .calendar-entry")
      .first();
    const id = await entry.getAttribute("data-activity-id");
    await entry.getByRole("checkbox", { name: /^Genomförd:/ }).check();
    await entry.locator(".calendar-block").click();
    const name = page.getByLabel("Namn", { exact: true });
    await name.fill("Installerad mobilplan");
    expect(
      await name.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    await page.setViewportSize({ width: 390, height: 430 });
    await expect
      .poll(() =>
        page.evaluate(() =>
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--app-visible-height",
            ),
          ),
        ),
      )
      .toBe(430);
    const dialog = (await page.getByRole("dialog").boundingBox())!;
    expect(dialog.y).toBeGreaterThanOrEqual(24);
    expect(dialog.y + dialog.height).toBeLessThanOrEqual(407);
    await expect(name).toHaveValue("Installerad mobilplan");
    await page
      .getByRole("button", { name: "Spara aktivitet", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.reload();
    const saved = page.locator(`[data-activity-id="${id}"]`);
    await expect(saved).toContainText("Installerad mobilplan");
    await expect(
      saved.getByRole("checkbox", { name: /^Genomförd:/ }),
    ).toBeChecked();
  });
}
