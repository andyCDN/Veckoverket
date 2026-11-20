import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import { generateWeek } from "../src/lib/planner";
import { templateSettings } from "../src/lib/week-template";
import type { Activity } from "../src/lib/types";
import { mock, login, status, userA, row } from "./helpers";

for (const width of [1440, 390])
  test(`rättar nästa veckas gamla upplägg i ett redan aktiverat molnkonto vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = createData();
    const current = "2026-11-16",
      next = "2026-11-23";
    data.weeks = {
      [current]: generateWeek(current, data).plan,
      [next]: generateWeek(next, data).plan,
    };
    const legacyNext = structuredClone(data.weeks[next]);
    data.settings = templateSettings(data.settings);
    const expected = generateWeek(next, data).plan;
    const signature = (activities: Activity[]) =>
      activities.map(({ title, date, start, end }) => ({
        title,
        date,
        start,
        end,
      }));
    const f = await mock(page, row(data));
    const saved = async () => {
      if (width === 1440) return status(page, "Sparat i molnet");
      await page
        .getByRole("button", { name: "Konto & molnlagring", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Konto och molnlagring",
      });
      await expect(dialog.getByRole("status")).toContainText("Sparat i molnet");
      await dialog
        .getByRole("button", { name: "Stäng dialog", exact: true })
        .click();
    };
    await page.clock.setFixedTime(new Date("2026-11-20T09:00:00+01:00"));
    await page.goto("./");
    await login(page);
    await expect
      .poll(() => f.documents.get(userA)?.data.weeks[next].templateId)
      .toBe("mon-thu-v1");
    await saved();
    expect(
      signature(f.documents.get(userA)!.data.weeks[next].activities),
    ).toEqual(signature(expected.activities));
    expect(f.documents.get(userA)!.data.weeks[current]).toEqual(
      data.weeks[current],
    );
    expect(f.writes).toHaveLength(1);
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Veckans arbetsflöde" })
        .getByRole("button", { name: "Torsdagscheck", exact: true }),
    ).toBeVisible();
    const monday =
      width === 1440
        ? page.locator('.day-column[data-date="2026-11-23"]')
        : page.getByRole("article", { name: "23 november 2026" });
    await expect(monday).toContainText("09:00–10:30");
    await expect(monday).toContainText("14:00–15:00");
    await page.screenshot({
      path: `test-results/cloud-personal-week-${width}.png`,
      fullPage: true,
    });

    // A later cloud snapshot can restore an old week while keeping the global
    // template setting. It must be repaired too, once, at the correct revision.
    const remote = f.documents.get(userA)!;
    f.documents.set(userA, {
      ...remote,
      revision: remote.revision + 1,
      data: {
        ...remote.data,
        weeks: { ...remote.data.weeks, [next]: legacyNext },
      },
    });
    await page.reload();
    await expect
      .poll(() => f.documents.get(userA)?.data.weeks[next].templateId)
      .toBe("mon-thu-v1");
    await saved();
    expect(
      signature(f.documents.get(userA)!.data.weeks[next].activities),
    ).toEqual(signature(expected.activities));
    expect(f.writes).toHaveLength(2);
    await page.reload();
    await saved();
    expect(f.writes).toHaveLength(2);
    expect(f.errors).toEqual([]);
  });
