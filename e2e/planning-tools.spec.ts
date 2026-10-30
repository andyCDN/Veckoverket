import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import {
  googleEventActivities,
  previewGoogleImport,
  categorizeGoogleEvent,
} from "../src/lib/google-calendar";
import type { Activity, AppData } from "../src/lib/types";
const week = "2026-10-26",
  date = "2026-10-29",
  key = "veckoverket.workspace.v1";
function localActivity(
  id = "local",
  title = "Egen bokning",
  minutes = 60,
): Activity {
  return {
    id,
    title,
    description: "",
    categoryId: "learning",
    date,
    start: 600,
    end: 600 + minutes,
    estimatedMinutes: minutes,
    blockType: "flexible",
    priority: 3,
    status: "planned",
    source: "manual",
  };
}
function base() {
  const data = createData();
  data.weeks[week] = {
    week,
    activities: [localActivity()],
    generatedAt: "",
    weeklyRoutinesFrom: week,
  };
  return data;
}
async function seed(page: Page, data: AppData) {
  await page.clock.install({ time: new Date("2026-10-29T08:00:00+01:00") });
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key, data },
  );
}
const stored = (page: Page): Promise<AppData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name, exact: true })
    .click();

test("regler kategoriserar sparade bokningar på mobil och manuella val kan återgå till automatisk kategori", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const calendar = { id: "calendar@example.test", summary: "Kalender" };
  let data = previewGoogleImport(
    base(),
    {
      week,
      calendarIds: [calendar.id],
      importedAt: "2026-10-29T07:00:00Z",
      activities: googleEventActivities(
        calendar,
        ["one", "two"].map((id) => ({
          id,
          summary: `Intervju ${id}`,
          start: { dateTime: "2026-10-29T13:00:00+01:00" },
          end: { dateTime: "2026-10-29T13:30:00+01:00" },
        })),
        week,
      ),
    },
    false,
  ).data;
  data = categorizeGoogleEvent(
    data,
    data.weeks[week].activities.find((a) => a.external?.eventId === "two")!,
    "learning",
  );
  await seed(page, data);
  await page.goto("./");
  await nav(page, "Inställningar");
  await page
    .getByLabel("Rubriken innehåller", { exact: true })
    .fill("intervju");
  await page
    .getByRole("combobox", { name: "Regelns kategori", exact: true })
    .selectOption("career");
  await page
    .getByRole("button", { name: "Lägg till kategoriregel", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Tillämpa regler på sparade bokningar (1)",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Tillämpa regler på sparade bokningar (1)",
      exact: true,
    })
    .click();
  const changed = await stored(page);
  expect(
    changed.weeks[week].activities.find((a) => a.external?.eventId === "one")
      ?.categoryId,
  ).toBe("career");
  expect(
    changed.weeks[week].activities.find((a) => a.external?.eventId === "two")
      ?.categoryId,
  ).toBe("learning");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Redigera regel: intervju", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Regelns kategori", exact: true })
    .selectOption("health");
  await page
    .getByRole("button", { name: "Spara kategoriregel", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Tillämpa regler på sparade bokningar (1)",
      exact: true,
    })
    .click();
  expect(
    (await stored(page)).weeks[week].activities.find(
      (a) => a.external?.eventId === "one",
    )?.categoryId,
  ).toBe("health");
  await page
    .locator(".toast")
    .getByRole("button", { name: "Ångra senaste ändringen", exact: true })
    .click();
  expect(
    (await stored(page)).weeks[week].activities.find(
      (a) => a.external?.eventId === "one",
    )?.categoryId,
  ).toBe("career");
  await nav(page, "Min vecka");
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Intervju two" })
    .click();
  await page
    .getByRole("combobox", { name: "Kategori", exact: true })
    .selectOption("__calendar_auto__");
  await page
    .getByRole("button", { name: "Spara kategori", exact: true })
    .click();
  expect(
    (await stored(page)).weeks[week].activities.find(
      (a) => a.external?.eventId === "two",
    )?.categoryId,
  ).toBe("health");
  await page.reload();
  await nav(page, "Inställningar");
  await expect(
    page.getByRole("checkbox", {
      name: "Aktivera regel: intervju",
      exact: true,
    }),
  ).toBeChecked();
});

test("ångrar status, redigering och borttagning i ordning utan att fånga textfältets ångra", async ({
  page,
}) => {
  await seed(page, base());
  await page.goto("./");
  const undo = page
    .locator(".workspace-tools")
    .getByRole("button", { name: "Ångra senaste ändringen", exact: true });
  await expect(undo).toBeDisabled();
  const checked = page.getByRole("checkbox", {
    name: /^Genomförd: Egen bokning/,
  });
  await checked.check();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(checked).not.toBeChecked();
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Egen bokning" })
    .click();
  await page.getByLabel("Namn", { exact: true }).fill("Ändrad bokning");
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Ändrad bokning" })
    .click();
  await page.getByRole("button", { name: "Ta bort", exact: true }).click();
  await undo.click();
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Ändrad bokning" }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Egen bokning" }),
  ).toBeVisible();
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Egen bokning" })
    .click();
  await page.getByLabel("Namn", { exact: true }).fill("Osparad text");
  await page.keyboard.press("Control+z");
  expect(
    (await stored(page)).weeks[week].activities.find((a) => a.id === "local")
      ?.title,
  ).toBe("Egen bokning");
  await page.getByRole("button", { name: "Stäng dialog", exact: true }).click();
  await page.reload();
  await expect(undo).toBeDisabled();
});

test("visar fyra och tolv veckors statistik på mobil utan att skapa veckor som saknar data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const data = base();
  data.weeks[week].activities = [
    { ...localActivity("current", "Lärande", 30), status: "done" },
  ];
  data.weeks[week].targets = { learning: 60 };
  data.weeks["2026-10-12"] = {
    week: "2026-10-12",
    generatedAt: "",
    activities: [
      { ...localActivity("old"), date: "2026-10-12", status: "done" },
    ],
    targets: { learning: 90 },
  };
  data.weeks["2026-10-19"] = {
    week: "2026-10-19",
    generatedAt: "",
    activities: [
      { ...localActivity("middle", "Lärande", 120), date: "2026-10-19" },
    ],
    targets: { learning: 120 },
  };
  await seed(page, data);
  await page.goto("./");
  await nav(page, "Veckoreflektion");
  const panel = page.getByRole("region", {
    name: "Uppföljning över flera veckor",
    exact: true,
  });
  await panel
    .getByRole("combobox", { name: "Livsområde i statistiken", exact: true })
    .selectOption("learning");
  await expect(panel).toContainText("3 av 4 veckor har sparad plan");
  await expect(panel.locator(".statistics-totals")).toContainText("3,5 h");
  await expect(panel.locator(".statistics-totals")).toContainText("1,5 h");
  await expect(
    panel.getByRole("row").filter({ hasText: "Lärande" }),
  ).toContainText("4,5 h");
  await panel.getByRole("button", { name: "12 veckor", exact: true }).click();
  await expect(panel).toContainText("3 av 12 veckor har sparad plan");
  await expect(panel.locator(".statistics-chart li")).toHaveCount(12);
  expect(Object.keys((await stored(page)).weeks)).toHaveLength(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: "test-results/statistics-mobile.png" });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((v) => v.id),
  ).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await panel.screenshot({ path: "test-results/statistics-desktop.png" });
  await panel
    .getByRole("button", { name: /Visa uppföljning för vecka 42,/ })
    .click();
  expect(Object.keys((await stored(page)).weeks)).toHaveLength(3);
});
