import { expect, type Page } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import { generateWeek } from "../src/lib/planner";
import { createPersonalSchedule } from "../src/lib/create-personal-schedule";
import { templateSettings } from "../src/lib/week-template";

export function oldWeeklyPlan(mode: "off" | "active" | "installed") {
  let data = createData();
  for (const week of ["2026-11-09", "2026-11-16", "2026-11-23"])
    data.weeks[week] = generateWeek(week, data).plan;
  if (mode === "active") data.settings = templateSettings(data.settings);
  if (mode === "installed")
    data = createPersonalSchedule(data, "2026-11-23").data;
  return data;
}

export async function expectRequestedMonday(
  page: Page,
  date: string,
  width: number,
) {
  const day = page.locator(
    width >= 700 ? `.day-column[data-date="${date}"]` : `#studio-day-${date}`,
  );
  await expect(day).toBeVisible();
  const titles = [
    "Veckoincheck",
    "Söka jobb",
    "Träna",
    "Lunch",
    "Kompetensutveckling",
    "Nätverksförfrågningar",
  ];
  const times = [
    "08:30–09:00",
    "09:00–10:30",
    "10:30–11:30",
    "11:30–12:30",
    "12:30–14:00",
    "14:00–15:00",
  ];
  await expect(
    day.locator(width >= 700 ? ".block-title" : ".studio-entries strong"),
  ).toHaveText(titles);
  if (width >= 700) await expect(day.locator(".block-time")).toHaveText(times);
  else
    for (let i = 0; i < times.length; i++)
      await expect(day.locator(".studio-entries small").nth(i)).toContainText(
        times[i],
      );
}
