import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import { generateWeek } from "../src/lib/planner";
import { scheduleSlotCount } from "../src/lib/create-personal-schedule";
import { navigateTo } from "./navigation";

for (const width of [1440, 390, 320])
  test(`fyradagarsmallen, torsdagens check och fredagen i helgen vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-20T09:00:00+01:00") });
    const data = createData();
    delete data.settings.weekTemplate;
    const current = "2026-11-16",
      next = "2026-11-23";
    data.weeks = {
      [current]: generateWeek(current, data).plan,
      [next]: generateWeek(next, data).plan,
    };
    data.weeks[next].activities.push({
      id: "friday-booking",
      title: "Fredagens egen bokning",
      description: "",
      date: "2026-11-27",
      start: 570,
      end: 600,
      estimatedMinutes: 30,
      categoryId: "family",
      status: "planned",
      source: "manual",
      blockType: "locked",
      priority: 5,
    });
    await page.addInitScript((data) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data));
    }, data);
    await page.goto("./");
    const stored = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
      );
    await expect
      .poll(async () => (await stored()).weeks[next].templateId)
      .toBe("mon-thu-v1");
    expect(scheduleSlotCount((await stored()).weeks[current])).toBe(19);
    const currentPlan = (await stored()).weeks[current];
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    const shortcuts = page.getByRole("region", { name: "Veckans arbetsflöde" });
    await expect(
      shortcuts.getByRole("button", { name: "Torsdagscheck", exact: true }),
    ).toBeVisible();
    if (width === 1440) {
      await expect(page.locator(".day-heading:visible")).toHaveCount(4);
      const weekend = page.getByRole("region", { name: "Helgens pass" });
      await expect(weekend).toContainText("Fre 27");
      await expect(
        weekend.getByRole("button", { name: /Fredagens egen bokning/ }),
      ).toBeVisible();
      await weekend.getByRole("button", { name: "Visa helgen" }).click();
      await expect(page.locator(".day-heading:visible")).toHaveCount(5);
      await weekend.getByRole("button", { name: "Dölj helgen" }).click();
    } else {
      await expect(page.locator(".studio-days > .studio-day")).toHaveCount(4);
      const weekend = page.getByRole("region", {
        name: "Helg och återhämtning",
      });
      await expect(weekend).toContainText("Fre 27 · Lör 28 · Sön 29");
      await expect(
        weekend.getByRole("button", { name: /Fredagens egen bokning/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("article", { name: "23 november 2026" }),
      ).toContainText("14:00–15:00");
      await expect(
        page.getByRole("article", { name: "25 november 2026" }),
      ).toContainText("Hämta");
    }
    await shortcuts
      .getByRole("button", { name: "Torsdagscheck", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Torsdagscheck",
      exact: true,
    });
    await expect(dialog).toContainText("26 november 2026 · 13:00–13:30");
    await dialog
      .getByLabel(/^Sammanfattning av veckan/)
      .fill("Avslutar på torsdag.");
    await dialog
      .getByRole("button", { name: "Stäng checken", exact: true })
      .click();
    await page.screenshot({
      path: `test-results/personal-week-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await navigateTo(page, "Inställningar");
    await expect(
      page.getByRole("checkbox", { name: /Fyradagarsvecka/ }),
    ).toBeChecked();
    const overview = page.locator(".personal-week-overview");
    await expect(overview).toContainText("Fredag–söndag är helg");
    await expect(overview).toContainText("13.30–15.00: öppet.");
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.failureSummary),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    expect((await stored()).weeks[current]).toEqual(currentPlan);
    expect((await stored()).reflections[next].good).toBe(
      "Avslutar på torsdag.",
    );
    expect(
      (await stored()).weeks[next].activities.filter(
        (a: { date: string; source: string }) =>
          a.date >= "2026-11-27" && a.source === "generated",
      ),
    ).toEqual([]);
  });
