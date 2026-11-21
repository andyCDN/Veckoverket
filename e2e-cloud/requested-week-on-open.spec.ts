import { test, expect } from "@playwright/test";
import { mock, login, row, userA } from "./helpers";
import {
  oldWeeklyPlan,
  expectRequestedMonday,
} from "../e2e/requested-week-helpers";
import { scheduleSlotCount } from "../src/lib/create-personal-schedule";

for (const mode of ["off", "installed"] as const)
  for (const width of [1440, 390])
    test(`vanliga molnplanen visar och sparar rätt måndag utan skaparlänk: ${mode}, ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const data = oldWeeklyPlan(mode);
      const f = await mock(page, row(data));
      await page.clock.setFixedTime(new Date("2026-11-21T09:00:00+01:00"));
      await page.goto("./");
      await login(page);
      await expectRequestedMonday(page, "2026-11-16", width);
      await expect
        .poll(() => f.documents.get(userA)!.data.personalScheduleVersion)
        .toBe(1);
      for (const week of ["2026-11-16", "2026-11-23"])
        expect(
          scheduleSlotCount(f.documents.get(userA)!.data.weeks[week]),
        ).toBe(19);
      expect(f.documents.get(userA)!.data.weeks["2026-11-09"]).toEqual(
        data.weeks["2026-11-09"],
      );
      const writes = f.writes.length;
      await page
        .getByRole("button", { name: "Nästa vecka", exact: true })
        .click();
      await expectRequestedMonday(page, "2026-11-23", width);
      await page.reload();
      await expectRequestedMonday(page, "2026-11-16", width);
      expect(f.writes).toHaveLength(writes);
      expect(f.errors).toEqual([]);
    });
