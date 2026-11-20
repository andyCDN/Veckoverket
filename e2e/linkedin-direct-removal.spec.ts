import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import {
  linkedInSeriesCounts,
  RETIRED_LINKEDIN_PASS,
} from "../src/lib/activity-exclusions";
import { STORAGE_KEY } from "../src/lib/storage";
import type { Activity } from "../src/lib/types";

test("raderar hela den lokalt sparade LinkedIn-serien på alla datum och behåller andra möten", async ({
  page,
}) => {
  const data = createData();
  const week = "2026-11-16",
    old = "2026-01-05";
  const base: Activity = {
    id: "base",
    title: RETIRED_LINKEDIN_PASS,
    description: "",
    date: week,
    start: 510,
    end: 570,
    estimatedMinutes: 60,
    categoryId: "career",
    blockType: "flexible",
    priority: 3,
    status: "planned",
    source: "recurring",
    recurrenceId: "series",
  };
  data.recurring = [
    { ...base, id: "series", weekdays: [0, 1, 2, 3, 4], startsOn: old },
  ];
  const meeting: Activity = {
    ...base,
    id: "meeting",
    title: "Eget möte",
    recurrenceId: undefined,
    source: "manual",
  };
  data.weeks = {
    [week]: {
      week,
      generatedAt: "",
      activities: [
        ...Array.from({ length: 4 }, (_, i) => ({
          ...base,
          id: `booking-${i}`,
          date: `2026-11-${16 + i}`,
          title: `${RETIRED_LINKEDIN_PASS} (återkommande)`,
        })),
        meeting,
      ],
    },
    [old]: {
      week: old,
      generatedAt: "",
      activities: [
        {
          ...base,
          id: "old",
          date: old,
          status: "done",
          title: "Omdöpt tillfälle",
        },
      ],
    },
  };
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key: STORAGE_KEY, data },
  );
  await page.goto("./rensa-linkedin/");
  const result = page.getByRole("region", { name: "Rensningsresultat" });
  await expect(result).toContainText(
    "5 bokningar och 1 återkommande regel borttagna",
  );
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
  expect(linkedInSeriesCounts(saved)).toEqual({ bookings: 0, rules: 0 });
  expect(saved.weeks[week].activities).toEqual([meeting]);
  await page.reload();
  await expect(result).toContainText(
    "0 bokningar och 0 återkommande regler borttagna",
  );
});

test("skapar inte en ersättningsplan när ingen lokal plan finns", async ({
  page,
}) => {
  await page.goto("./rensa-linkedin/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Ingen sparad plan hittades",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBeNull();
});
