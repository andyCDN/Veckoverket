import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import type { Activity } from "../src/lib/types";
import { openToday } from "./navigation";
function fixture() {
  const d = createData();
  d.settings = {
    ...d.settings,
    autoPlanning: true,
    buffer: 0,
    start: 480,
    end: 960,
    musicMornings: 0,
    trainingSessions: 0,
  };
  d.goals = [
    {
      id: "g",
      title: "Veckans leverans",
      week: "2026-11-09",
      horizon: "week",
      categoryId: "career",
      description: "",
    },
  ];
  d.tasks = [
    {
      id: "t",
      title: "Skriv utkast",
      goalId: "g",
      done: false,
      estimatedMinutes: 60,
    },
    {
      id: "u",
      title: "Skicka ansökan",
      goalId: "g",
      done: false,
      estimatedMinutes: 30,
    },
  ];
  d.contacts = [];
  d.applications = [];
  d.careerActions = [];
  d.deadlines = [];
  d.habits = [];
  d.recurring = [];
  const pass = (id: string, patch: Partial<Activity> = {}): Activity => ({
    id,
    title: id,
    date: "2026-11-09",
    start: 540,
    end: 600,
    categoryId: "career",
    estimatedMinutes: 60,
    source: "manual",
    status: "planned",
    blockType: "flexible",
    priority: 3,
    description: "",
    ...patch,
  });
  d.weeks = {
    "2026-11-09": {
      week: "2026-11-09",
      generatedAt: "",
      rules: d.settings,
      weeklyRoutinesFrom: "2026-11-09",
      activities: [
        pass("focus", { title: "Skriv utkast", taskId: "t", goalId: "g" }),
        pass("other", {
          title: "Skicka ansökan",
          taskId: "u",
          goalId: "g",
          start: 600,
          end: 630,
          estimatedMinutes: 30,
        }),
        pass("meeting", {
          title: "Bokat möte",
          start: 660,
          end: 690,
          blockType: "locked",
          estimatedMinutes: 30,
        }),
        pass("budget", {
          title: "Generellt jobbsök",
          start: 780,
          end: 840,
          source: "generated",
        }),
      ],
    },
  };
  return d;
}
for (const width of [1440, 390])
  test(`dagstart, lättare dag, ångra och återöppning ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-09T07:00:00Z") });
    const data = fixture();
    await page.addInitScript((d) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(d));
    }, data);
    const read = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
      );
    await page.goto("./");
    const daily = page.getByRole("region", { name: "Din dagstart" });
    await expect(daily).toContainText("Skriv utkast");
    await daily
      .getByRole("button", { name: "Öppna pass", exact: true })
      .click();
    await expect(page.getByLabel("Namn", { exact: true })).toHaveValue(
      "Skriv utkast",
    );
    await page
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    const before = await read();
    const preview = async () => {
      await daily
        .getByRole("button", { name: "Låg ork idag", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "En lättare plan för idag",
      });
      await dialog
        .getByRole("combobox", {
          name: "Vad vill du behålla idag?",
          exact: true,
        })
        .selectOption("pass:focus");
      await dialog
        .getByRole("button", { name: "Visa förslag för idag", exact: true })
        .click();
      await expect(
        dialog.getByRole("region", { name: "Förslag för en lättare dag" }),
      ).toContainText("09:00–09:15");
      await expect(dialog).toContainText("Flyttas till 10 november 2026");
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      return dialog;
    };
    let dialog = await preview();
    expect((await read()).weeks).toEqual(before.weeks);
    await dialog
      .getByRole("button", { name: "Behåll planen som den är", exact: true })
      .click();
    expect((await read()).weeks).toEqual(before.weeks);
    dialog = await preview();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: `test-results/gentle-preview-${width}.png` });
    await dialog
      .getByRole("button", { name: "Godkänn dagens plan", exact: true })
      .click();
    await expect(daily).toContainText("Dagen är anpassad");
    let current = await read();
    expect(current.weeks["2026-11-09"].gentleDays).toEqual(["2026-11-09"]);
    expect(
      current.weeks["2026-11-09"].activities.find(
        (a: Activity) => a.id === "focus",
      ),
    ).toMatchObject({ start: 540, end: 555 });
    expect(
      current.weeks["2026-11-09"].activities.find(
        (a: Activity) => a.id === "other",
      )?.date,
    ).toBe("2026-11-10");
    expect(current.tasks.map((t: { id: string }) => t.id)).toEqual(["t", "u"]);
    expect(
      current.weeks["2026-11-09"].activities.find(
        (a: Activity) => a.id === "meeting",
      ),
    ).toEqual(
      before.weeks["2026-11-09"].activities.find(
        (a: Activity) => a.id === "meeting",
      ),
    );
    await daily.getByRole("heading", { name: "Börja här idag" }).click();
    await page.keyboard.press("Control+z");
    await expect(daily).not.toContainText("Dagen är anpassad");
    expect((await read()).weeks).toEqual(before.weeks);
    dialog = await preview();
    await dialog
      .getByRole("button", { name: "Godkänn dagens plan", exact: true })
      .click();
    await page.reload();
    await expect(daily).toContainText("Dagen är anpassad");
    await openToday(page);
    await page.locator('[data-activity-id="meeting"] .calendar-block').click();
    await page
      .getByLabel("Namn", { exact: true })
      .fill("Bokat möte – samma tid");
    await page.getByRole("button", { name: "Spara pass", exact: true }).click();
    current = await read();
    expect(
      current.weeks["2026-11-09"].activities.filter(
        (a: Activity) => a.date === "2026-11-09",
      ),
    ).toHaveLength(2);
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .first()
      .click();
    await expect(daily).toHaveCount(0);
    await page.reload();
    await expect(daily).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/daily-start-${width}.png`,
      fullPage: true,
    });
    await openToday(page);
    await page
      .locator('[data-activity-id="focus"]')
      .getByRole("checkbox", { name: /^Genomförd:/ })
      .check();
    await page
      .getByRole("dialog", { name: "Nästa steg efter passet" })
      .getByRole("button", { name: "Mer tid", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Du har redan tid för nästa steg",
    );
    await page
      .getByRole("button", { name: "Behåll nästa bokade pass", exact: true })
      .click();
    await expect(daily).toContainText("Dagens lilla insats är genomförd");
    await expect(
      daily.getByRole("button", { name: "Boka tid", exact: true }),
    ).toHaveCount(0);
    expect((await read()).tasks[0].done).toBe(false);
    await daily.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/daily-finished-${width}.png` });
  });
test("dagstart öppnar rätt check och stoppar förslag efter att tid eller datum ändrats", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-09T07:00:00Z") });
  const data = fixture();
  data.goals = [];
  data.tasks = [];
  data.settings.autoPlanning = false;
  data.weeks["2026-11-09"].rules = data.settings;
  data.weeks["2026-11-09"].activities = [
    {
      ...data.weeks["2026-11-09"].activities[0],
      id: "work",
      title: "Eget arbete",
      taskId: undefined,
      goalId: undefined,
      source: "generated",
    },
    {
      ...data.weeks["2026-11-09"].activities[2],
      id: "check",
      title: "Veckostart",
      routine: "week-start",
      categoryId: "weekly-planning",
      start: 510,
      end: 525,
      estimatedMinutes: 15,
    },
  ];
  await page.addInitScript((d) => {
    if (!localStorage.getItem("veckoverket.workspace.v1"))
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(d));
  }, data);
  await page.goto("./");
  await page
    .getByRole("region", { name: "Din dagstart" })
    .getByRole("button", { name: "Veckostart", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Måndagscheck");
  await page.getByRole("button", { name: "Stäng dialog", exact: true }).click();
  await page.getByRole("button", { name: "Låg ork idag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "En lättare plan för idag" });
  await dialog
    .getByRole("button", { name: "Visa förslag för idag", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Godkänn dagens plan", exact: true }),
  ).toBeVisible();
  await page.clock.setSystemTime(new Date("2026-11-09T08:05:00Z"));
  await dialog
    .getByRole("button", { name: "Godkänn dagens plan", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Tiden har gått");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!).weeks[
          "2026-11-09"
        ].gentleDays,
    ),
  ).toBeUndefined();
  await page.clock.setSystemTime(new Date("2026-11-10T07:00:00Z"));
  await dialog
    .getByRole("button", { name: "Visa förslag för idag", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Dagen har ändrats");
  await expect(
    dialog.getByRole("button", { name: "Godkänn dagens plan", exact: true }),
  ).toHaveCount(0);
});
