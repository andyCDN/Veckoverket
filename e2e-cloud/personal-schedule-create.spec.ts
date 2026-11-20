import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import { generateWeek } from "../src/lib/planner";
import { scheduleSlotCount } from "../src/lib/create-personal-schedule";
import { cacheKey } from "../src/lib/workspace-sync";
import { mock, login, row, userA } from "./helpers";

const week = "2026-11-23";
for (const width of [1440, 390])
  test(`skapar och verifierar kontots 19 pass trots ett eget överlappande möte vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = createData();
    data.weeks = { [week]: generateWeek(week, data).plan };
    const meeting = {
      id: "meeting",
      title: "Återmontering Kommod",
      description: "Egen bokning",
      date: week,
      start: 720,
      end: 825,
      estimatedMinutes: 105,
      categoryId: "family",
      source: "manual" as const,
      status: "planned" as const,
      priority: 5,
      blockType: "locked" as const,
    };
    data.weeks[week].activities.push(meeting);
    const f = await mock(page, row(data));
    await page.clock.setFixedTime(new Date("2026-11-20T09:00:00+01:00"));
    await page.goto("./veckoschema/?week=2026-11-23");
    await login(page);
    const result = page.getByRole("region", { name: "Sparat veckoschema" });
    await expect(result).toContainText("Kontrollerat i molnplanen: 19 av 19");
    await expect(result).toContainText("Krockar med egna bokningar");
    await expect(result.getByRole("listitem")).toHaveCount(2);
    const saved = f.documents.get(userA)!.data;
    expect(scheduleSlotCount(saved.weeks[week])).toBe(19);
    expect(saved.weeks[week].activities).toContainEqual(meeting);
    expect(f.writes).toHaveLength(1);
    await page.reload();
    await expect(result).toContainText("19 av 19");
    expect(f.writes).toHaveLength(1);
    await page
      .getByRole("link", { name: "Öppna vecka 48 i kalendern" })
      .click();
    await expect(page.getByRole("banner")).toContainText(
      width === 1440 ? "Vecka 48" : "V.48",
    );
    if (width < 700) await page.locator(".week-context > summary").click();
    await expect(
      page
        .getByRole("region", { name: "Vanor" })
        .locator(".habit-week-controls"),
    ).toContainText("V.48");
    expect(scheduleSlotCount(f.documents.get(userA)!.data.weeks[week])).toBe(
      19,
    );
    expect(f.errors).toEqual([]);
  });

test("skriver inte över kontot om den här enheten har osparade ändringar", async ({
  page,
}) => {
  const data = createData();
  const f = await mock(page, row(data));
  await page.clock.setFixedTime(new Date("2026-11-20T09:00:00+01:00"));
  await page.addInitScript(
    ({ key, data, userId }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ data, userId, revision: 1, dirty: true }),
      );
    },
    { key: cacheKey(userA), data, userId: userA },
  );
  await page.goto("./veckoschema/");
  await login(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "osparade ändringar",
  );
  expect(f.writes).toHaveLength(0);
});
