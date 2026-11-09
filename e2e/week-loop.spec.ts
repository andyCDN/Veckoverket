import { openContext } from "./navigation";
import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import type { Activity } from "../src/lib/types";
for (const width of [1440, 390])
  test(`hela veckoloopen: planeringskö, mer tid, bevakning, fredagsval och nästa måndag ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-09T09:00:00Z") });
    const d = createData();
    d.settings = {
      ...d.settings,
      start: 480,
      end: 960,
      autoPlanning: false,
      buffer: 0,
    };
    d.goals = [
      {
        id: "g",
        title: "Veckans leveranser",
        description: "",
        week: "2026-11-09",
        categoryId: "career",
        horizon: "week",
      },
    ];
    d.tasks = [
      {
        id: "m",
        title: "Färdigställ arbetsprovet",
        goalId: "g",
        done: false,
        estimatedMinutes: 30,
      },
      {
        id: "u",
        title: "Kontakta rekryteraren",
        goalId: "g",
        done: false,
        estimatedMinutes: 30,
      },
      { id: "drop", title: "Släpp denna", goalId: "g", done: false },
    ];
    d.habits = [];
    d.applications = [];
    d.contacts = [];
    d.careerActions = [];
    const pass: Activity = {
      id: "p",
      taskId: "m",
      goalId: "g",
      title: "Färdigställ arbetsprovet",
      categoryId: "career",
      date: "2026-11-09",
      start: 540,
      end: 570,
      estimatedMinutes: 30,
      status: "planned",
      blockType: "flexible",
      priority: 3,
      source: "manual",
      description: "",
    };
    d.weeks = {
      "2026-11-09": {
        week: "2026-11-09",
        generatedAt: "",
        rules: d.settings,
        weeklyRoutinesFrom: "2026-11-09",
        activities: [pass],
      },
    };
    await page.addInitScript((d) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(d));
    }, d);
    const stored = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
      );
    await page.goto("./");
    const queue = page.getByRole("region", {
      name: "Nästa steg",
      exact: true,
    });
    await expect(queue).toContainText("Nästa steg");
    if (width >= 951)
      await expect(page.locator(".plan-info")).toHaveJSProperty("open", false);
    await page
      .locator('[data-activity-id="p"]')
      .getByRole("checkbox", { name: /Genomförd:/ })
      .check();
    let dialog = page.getByRole("dialog", {
      name: "Nästa steg efter passet",
      exact: true,
    });
    await dialog.getByRole("button", { name: "Mer tid", exact: true }).click();
    await dialog.getByLabel("Återstående minuter").fill("45");
    await dialog
      .getByRole("button", { name: "Planera återstående arbete", exact: true })
      .click();
    let planner = page.getByRole("dialog", {
      name: "Planera vecka 46",
      exact: true,
    });
    await planner
      .getByRole("button", { name: "Visa planeringsförslag", exact: true })
      .click();
    await expect(planner).toContainText("1 pass kan läggas in");
    await planner
      .getByRole("button", { name: "Lägg in 1 pass i veckan", exact: true })
      .click();
    const after = (await stored()).weeks["2026-11-09"].activities;
    expect(after.find((a: Activity) => a.id === "p").status).toBe("done");
    const nextPass = after.find(
      (a: Activity) => a.taskId === "m" && a.id !== "p",
    );
    expect(nextPass).toBeTruthy();
    await page
      .locator(`[data-activity-id="${nextPass.id}"]`)
      .getByRole("checkbox", { name: /Genomförd:/ })
      .check();
    dialog = page.getByRole("dialog", {
      name: "Nästa steg efter passet",
      exact: true,
    });
    await dialog.getByRole("button", { name: "Väntar", exact: true }).click();
    await dialog.getByLabel("Vem väntar du på?").fill("Kim");
    await dialog.getByLabel("Följ upp datum").fill("2026-11-10");
    await dialog
      .getByRole("button", { name: "Spara bevakning", exact: true })
      .click();
    expect(
      (await stored()).tasks.find((t: { id: string }) => t.id === "m"),
    ).toMatchObject({
      done: false,
      state: "waiting",
      waitingFor: "Kim",
      reviewOn: "2026-11-10",
    });
    await openContext(page);
    await expect(
      page.getByRole("region", {
        name: "Veckans mål i kalendern",
        exact: true,
      }),
    ).toContainText("Väntar på Kim");
    await page.clock.setSystemTime(new Date("2026-11-13T09:00:00Z"));
    await page
      .getByRole("button", { name: "Fredagscheck", exact: true })
      .click();
    const friday = page.getByRole("dialog", {
      name: "Fredagscheck",
      exact: true,
    });
    const review = friday.getByRole("region", {
      name: "Avsluta veckan",
      exact: true,
    });
    const drop = review
      .getByRole("listitem")
      .filter({ hasText: "Släpp denna" });
    await drop.getByText("Fler alternativ", { exact: true }).click();
    await drop
      .getByRole("button", { name: "Släpp uppgiften", exact: true })
      .click();
    await review
      .getByRole("checkbox", { name: /Kontakta rekryteraren/ })
      .check();
    await review
      .getByRole("checkbox", { name: /Färdigställ arbetsprovet/ })
      .check();
    await friday
      .getByLabel(/^Plan inför nästa vecka/)
      .fill("Följ upp Kim och kontakta rekryteraren.");
    await review
      .getByRole("button", { name: "Avsluta veckan", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText("sparad");
    const snapshot = (await stored()).reflections["2026-11-09"].reviewSummary;
    expect(snapshot).toContain("förs vidare till 2026-11-16");
    await page.screenshot({ path: `test-results/friday-flow-${width}.png` });
    await friday
      .getByRole("button", { name: "Öppna nästa vecka", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Måndagscheck", exact: true })
      .click();
    const monday = page.getByRole("dialog", {
      name: "Måndagscheck",
      exact: true,
    });
    await expect(monday).toContainText(
      "Följ upp Kim och kontakta rekryteraren.",
    );
    await monday
      .getByRole("button", {
        name: "3. Boka tid",
        exact: true,
      })
      .click();
    planner = page.getByRole("dialog", {
      name: "Måndagscheck",
      exact: true,
    });
    await planner
      .getByRole("button", { name: "Visa planeringsförslag", exact: true })
      .click();
    await expect(planner).toContainText("1 pass kan läggas in");
    await planner
      .getByRole("button", { name: "Lägg in 1 pass i veckan", exact: true })
      .click();
    const final = await stored();
    expect(final.tasks.map((t: { id: string }) => t.id)).toEqual([
      "m",
      "u",
      "drop",
    ]);
    expect(final.tasks.find((t: { id: string }) => t.id === "drop").state).toBe(
      "dropped",
    );
    expect(
      final.weeks["2026-11-16"].activities.some(
        (a: Activity) => a.taskId === "u",
      ),
    ).toBe(true);
    expect(final.reflections["2026-11-09"].reviewSummary).toBe(snapshot);
    await monday
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/week-loop-${width}.png`,
      fullPage: true,
    });
  });
