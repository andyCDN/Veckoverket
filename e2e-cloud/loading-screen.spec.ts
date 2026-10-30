import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mock, login, status } from "./helpers";

test("RISO-laddning visas under hämtning, fungerar på små skärmar och lämnar över till planen", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { get: () => true }),
  );
  const f = await mock(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "http://127.0.0.1:54321/rest/v1/workspaces**",
    async (route) => {
      await pending;
      await route.fallback();
    },
  );
  try {
    await page.goto("./");
    await login(page);
    const screen = page.getByRole("main", { name: /veckoverket/i });
    await expect(screen).toBeVisible();
    await expect(screen.getByRole("status")).toHaveText("Hämtar molnplanen…");
    await expect(page.locator(".calendar-grid")).toHaveCount(0);
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [320, 740],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/loading-riso-${width}.png`,
        fullPage: true,
      });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await screen.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.failureSummary),
      })),
    ).toEqual([]);
    release();
    await expect(screen).not.toBeVisible();
    await expect(page.locator(".calendar-grid")).toBeVisible();
    await status(page, "Sparat i molnet");
    expect(f.errors).toEqual([]);
  } finally {
    release();
  }
});
