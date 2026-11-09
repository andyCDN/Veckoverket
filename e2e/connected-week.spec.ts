import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import type { Activity } from "../src/lib/types";
for (const width of [1440, 390])
  test(`måndagscheck realiserar separata jobbmål och vanor i samma kalender vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-09T07:00:00Z") });
    const data = createData();
    data.settings = {
      ...data.settings,
      start: 480,
      end: 960,
      days: [0, 1, 2, 3, 4],
      autoPlanning: false,
      buffer: 0,
    };
    data.goals = [
      {
        id: "g1",
        week: "2026-11-09",
        title: "Ansökningar A",
        description: "",
        categoryId: "career",
        horizon: "week",
      },
      {
        id: "g2",
        week: "2026-11-09",
        title: "Arbetsprov B",
        description: "",
        categoryId: "career",
        horizon: "week",
      },
    ];
    data.tasks = [
      {
        id: "t1",
        goalId: "g1",
        title: "Anpassa ansökan A",
        done: false,
        estimatedMinutes: 60,
      },
      {
        id: "t2",
        goalId: "g2",
        title: "Skicka arbetsprov B",
        done: false,
        estimatedMinutes: 45,
      },
    ];
    data.habits = [
      {
        id: "h",
        title: "Rörelse",
        createdOn: "2026-11-09",
        schedule: { kind: "days", days: [0] },
        checks: [],
        minutes: 30,
        categoryId: "health",
      },
    ];
    const slot: Activity = {
      id: "generic",
      title: "Generellt jobbsök",
      goalId: "g1",
      categoryId: "career",
      date: "2026-11-09",
      start: 540,
      end: 660,
      estimatedMinutes: 120,
      source: "generated",
      status: "planned",
      priority: 3,
      description: "",
      blockType: "flexible",
    };
    data.weeks = {
      "2026-11-09": {
        week: "2026-11-09",
        generatedAt: "",
        rules: data.settings,
        weeklyRoutinesFrom: "2026-11-09",
        activities: [
          slot,
          {
            ...slot,
            id: "fixed",
            title: "Bokat möte",
            goalId: undefined,
            source: "manual",
            blockType: "locked",
            start: 660,
            end: 720,
          },
        ],
      },
    };
    data.applications = [];
    data.contacts = [];
    data.careerActions = [];
    await page.addInitScript((data) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data));
    }, data);
    const stored = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
      );
    await page.goto("./");
    await page
      .getByRole("button", { name: "Måndagscheck", exact: true })
      .click();
    const check = page.getByRole("dialog", {
      name: "Måndagscheck",
      exact: true,
    });
    await check
      .getByLabel(/^Veckans startplan/)
      .fill("Två jobbleveranser och rörelse på måndag.");
    await check
      .getByRole("button", {
        name: "Planera veckans mål och vanor",
        exact: true,
      })
      .click();
    const planner = page.getByRole("dialog", {
      name: "Planera vecka 46",
      exact: true,
    });
    const before = await stored();
    await planner
      .getByRole("button", { name: "Visa planeringsförslag", exact: true })
      .click();
    await expect(
      planner.getByRole("heading", {
        name: "3 pass kan läggas in",
        exact: true,
      }),
    ).toBeVisible();
    expect((await stored()).weeks).toEqual(before.weeks);
    await planner
      .getByRole("region", { name: "Planeringsförslag" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/weekly-work-preview-${width}.png`,
    });

    expect(
      (await new AxeBuilder({ page }).include(".weekly-work-planner").analyze())
        .violations,
    ).toEqual([]);
    await planner
      .getByRole("button", { name: "Lägg in 3 pass i veckan", exact: true })
      .click();
    await expect(check).toBeVisible();
    await expect(check.getByLabel(/^Veckans startplan/)).toHaveValue(
      "Två jobbleveranser och rörelse på måndag.",
    );
    await check.getByRole("button", { name: "Klar", exact: true }).click();
    const saved = await stored();
    const passes = saved.weeks["2026-11-09"].activities;
    expect(passes.find((a: Activity) => a.taskId === "t1")).toMatchObject({
      goalId: "g1",
      start: 540,
      end: 600,
    });
    expect(passes.find((a: Activity) => a.taskId === "t2")).toMatchObject({
      goalId: "g2",
      start: 600,
      end: 645,
    });
    expect(passes.find((a: Activity) => a.id === "fixed")).toEqual(
      before.weeks["2026-11-09"].activities.find(
        (a: Activity) => a.id === "fixed",
      ),
    );
    const habitPass = passes.find((a: Activity) => a.habitId === "h");
    const habitBooking = page.locator(`[data-activity-id="${habitPass.id}"]`);
    const habit = page.getByRole("region", { name: "Vanor", exact: true });
    const habitCheck = habit.getByRole("checkbox", {
      name: "Rörelse, 9 november 2026",
      exact: true,
    });
    await habitBooking.getByRole("checkbox", { name: /Genomförd:/ }).check();
    const derived = habit.getByRole("button", {
      name: /Rörelse avklarad via kalendern/,
    });
    await expect(derived).toBeVisible();
    await expect(habitCheck).toHaveCount(0);
    await expect(habit).toContainText("1 av 1 dagar klara");
    await derived.click();
    const passEditor = page.getByRole("dialog");
    await expect(passEditor.locator(".activity-work-source")).toContainText(
      "Rörelse",
    );
    await passEditor
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    expect((await stored()).habits[0].checks).toEqual([]);
    await habitBooking.getByRole("checkbox", { name: /Genomförd:/ }).uncheck();
    await expect(habitCheck).not.toBeChecked();
    await habitCheck.check();
    await habitBooking.getByRole("checkbox", { name: /Genomförd:/ }).check();
    await habitBooking.getByRole("checkbox", { name: /Genomförd:/ }).uncheck();
    await expect(habitCheck).toBeChecked();
    const taskPass = passes.find((a: Activity) => a.taskId === "t1");
    await page
      .locator(`[data-activity-id="${taskPass.id}"]`)
      .getByRole("checkbox", { name: /Genomförd:/ })
      .check();
    expect(
      (await stored()).tasks.find((t: { id: string }) => t.id === "t1").done,
    ).toBe(false);
    const goals = page.getByRole("region", {
      name: "Veckans mål i kalendern",
      exact: true,
    });
    await page
      .getByRole("dialog", { name: "Nästa steg efter passet", exact: true })
      .getByRole("button", { name: "Uppgiften är klar", exact: true })
      .click();
    expect(
      (await stored()).tasks.find((t: { id: string }) => t.id === "t1").done,
    ).toBe(true);
    await page
      .getByRole("button", { name: "Måndagscheck", exact: true })
      .click();
    await check
      .getByRole("button", {
        name: "Planera veckans mål och vanor",
        exact: true,
      })
      .click();
    await expect(planner).toContainText(
      "Inga obokade uppgifter eller vanotillfällen",
    );
    await planner
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    await check.getByRole("button", { name: "Klar", exact: true }).click();
    expect((await stored()).weeks["2026-11-09"].activities).toHaveLength(
      passes.length,
    );
    await page.reload();
    await expect(habitCheck).toBeChecked();
    await expect(goals).toContainText("1 av 1 uppgifter klara");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/connected-week-${width}.png`,
      fullPage: true,
    });
  });

test("nytt veckomål, konkreta uppgifter och en tidsatt vana skapas utan att lämna veckovyn", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-09T07:00:00Z") });
  const data = createData();
  data.goals = [];
  data.tasks = [];
  data.habits = [];
  data.contacts = [];
  data.applications = [];
  data.careerActions = [];
  data.settings = {
    ...data.settings,
    autoPlanning: false,
    start: 480,
    end: 960,
  };
  data.weeks = {
    "2026-11-09": {
      week: "2026-11-09",
      generatedAt: "",
      weeklyRoutinesFrom: "2026-11-09",
      rules: data.settings,
      activities: [],
    },
  };
  await page.addInitScript(
    (data) =>
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data)),
    data,
  );
  await page.goto("./");
  const goals = page.getByRole("region", {
    name: "Veckans mål i kalendern",
    exact: true,
  });
  await goals
    .getByRole("button", { name: "Nytt veckomål", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Mål", { exact: true }).fill("Skicka en bra ansökan");
  await dialog.getByRole("button", { name: "Skapa mål", exact: true }).click();
  await goals
    .getByRole("textbox", {
      name: "Ny uppgift för Skicka en bra ansökan",
      exact: true,
    })
    .fill("Anpassa CV till rollen");
  await goals.getByRole("button", { name: "Lägg till", exact: true }).click();
  const habits = page.getByRole("region", { name: "Vanor", exact: true });
  await habits.getByRole("button", { name: "Ny vana", exact: true }).click();
  await dialog.getByLabel("Vad vill du göra regelbundet?").fill("Promenad");
  await dialog
    .getByRole("combobox", { name: "Veckomål", exact: true })
    .selectOption("weekly");
  await dialog.getByLabel("Antal dagar per vecka").fill("1");
  await dialog.getByLabel("Avsätt tid i kalendern").check();
  await dialog.getByLabel("Minuter per tillfälle").fill("30");
  await dialog.getByRole("button", { name: "Spara vana", exact: true }).click();
  await habits
    .getByRole("button", { name: "Redigera vana: Promenad", exact: true })
    .click();
  await expect(dialog.getByLabel("Avsätt tid i kalendern")).toBeChecked();
  await expect(dialog.getByLabel("Minuter per tillfälle")).toHaveValue("30");
  await dialog
    .getByRole("button", { name: "Stäng dialog", exact: true })
    .click();
  await goals
    .getByRole("button", { name: "Planera veckans arbete", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Visa planeringsförslag", exact: true })
    .click();
  await expect(dialog).toContainText("2 pass kan läggas in");
  await dialog
    .getByRole("button", { name: "Lägg in 2 pass i veckan", exact: true })
    .click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
  );
  expect(
    saved.weeks["2026-11-09"].activities.filter((a: Activity) => a.taskId),
  ).toHaveLength(1);
  expect(
    saved.weeks["2026-11-09"].activities.filter((a: Activity) => a.habitId),
  ).toHaveLength(1);
  expect(saved.habits[0].minutes).toBe(30);
});
