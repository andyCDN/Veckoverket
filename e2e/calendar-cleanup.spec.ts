import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import type { Activity } from "../src/lib/types";

for (const mobile of [false, true]) {
  test(`visningsstädning bevarar planer och statistik ${mobile ? "på mobil" : "på dator"}`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-11-04T09:00:00Z") });
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const data = createData();
    const activity = (
      id: string,
      date: string,
      start: number,
      end: number,
      status: Activity["status"] = "planned",
    ): Activity => ({
      id,
      title: id,
      date,
      start,
      end,
      status,
      description: "",
      categoryId: "career",
      estimatedMinutes: end - start,
      blockType: "flexible",
      priority: 3,
      source: "manual",
    });
    data.weeks["2026-11-02"] = {
      week: "2026-11-02",
      generatedAt: "2026-11-02T06:00:00Z",
      weeklyRoutinesFrom: "2026-11-02",
      activities: [
        activity("Tidigare dag", "2026-11-02", 660, 720),
        activity("Passerat idag", "2026-11-04", 480, 540),
        activity("Pågår nu", "2026-11-04", 570, 630),
        activity("Kommande", "2026-11-04", 660, 720),
        activity("Avklarat", "2026-11-04", 780, 840, "done"),
        activity("Framtida dag", "2026-11-05", 660, 720),
      ],
    };
    await page.addInitScript(
      (value) =>
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value)),
      data,
    );
    await page.goto("./");
    const filter = page.getByRole("checkbox", {
      name: "Dölj avklarade och passerade pass",
    });
    await expect(filter).toBeVisible();
    const stored = () =>
      page.evaluate(() => localStorage.getItem("veckoverket.workspace.v1"));
    const before = await stored();
    const summary = page.getByRole("region", { name: "Veckans tidsöversikt" });
    const summaryText = mobile ? null : await summary.textContent();
    await filter.check();
    for (const id of ["Tidigare dag", "Passerat idag", "Avklarat"])
      await expect(page.locator(`[data-activity-id="${id}"]`)).toHaveCount(0);
    for (const id of ["Pågår nu", "Kommande", "Framtida dag"])
      await expect(page.locator(`[data-activity-id="${id}"]`)).toHaveCount(1);
    await expect(
      page.getByRole("status").filter({ hasText: "3 pass dolda" }),
    ).toBeVisible();
    if (!mobile) expect(await summary.textContent()).toBe(summaryText);
    expect(await stored()).toBe(before);
    await filter.uncheck();
    await expect(page.locator('[data-activity-id="Avklarat"]')).toHaveCount(1);
    await expect(page.locator('[data-activity-id="Tidigare dag"]')).toHaveCount(
      1,
    );
    expect(await stored()).toBe(before);
  });
}
