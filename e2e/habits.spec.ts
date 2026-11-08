import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";

for (const width of [1440, 390, 320])
  test(`vanor skapas, bockas av, pausas och sparas vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-05T09:00:00Z") });
    const data = createData();
    data.contacts = [];
    data.applications = [];
    data.careerActions = [];
    await page.addInitScript((data) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data));
    }, data);
    await page.goto("./");
    const tracker = page.getByRole("region", { name: "Vanor", exact: true });
    await expect(tracker).toBeVisible();
    const read = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
      );
    const before = await read();
    await tracker.getByRole("button", { name: "Ny vana", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Vad vill du göra regelbundet?")
      .fill("Fokusarbete");
    await dialog.getByLabel("Startdatum", { exact: true }).fill("2026-11-02");
    await dialog
      .getByRole("button", { name: "Spara vana", exact: true })
      .click();
    const first = tracker.getByRole("checkbox", {
      name: "Fokusarbete, 2 november 2026",
      exact: true,
    });
    await first.check();
    await tracker
      .getByRole("checkbox", {
        name: "Fokusarbete, 5 november 2026",
        exact: true,
      })
      .check();
    await expect(tracker).toContainText("2 av 5 dagar klara");
    await expect(
      tracker.getByRole("checkbox", {
        name: "Fokusarbete, 6 november 2026",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      tracker.getByRole("checkbox", {
        name: "Fokusarbete, 7 november 2026",
        exact: true,
      }),
    ).toHaveCount(0);
    await tracker.getByRole("button", { name: "Ny vana", exact: true }).click();
    await dialog.getByLabel("Vad vill du göra regelbundet?").fill("Rörelse");
    await dialog
      .getByRole("combobox", { name: "Veckomål", exact: true })
      .selectOption("weekly");
    await dialog.getByLabel("Antal dagar per vecka").fill("3");
    await dialog.getByLabel("Startdatum", { exact: true }).fill("2026-11-02");
    await dialog
      .getByRole("button", { name: "Spara vana", exact: true })
      .click();
    for (const day of [3, 4, 5])
      await tracker
        .getByRole("checkbox", {
          name: `Rörelse, ${day} november 2026`,
          exact: true,
        })
        .check();
    await expect(tracker).toContainText("3 av 3 dagar klara");
    await tracker.getByRole("heading", { name: "Vanor", exact: true }).click();
    await page.keyboard.press("Control+z");
    await expect(
      tracker.getByRole("checkbox", {
        name: "Rörelse, 5 november 2026",
        exact: true,
      }),
    ).not.toBeChecked();
    await tracker
      .getByRole("checkbox", { name: "Rörelse, 5 november 2026", exact: true })
      .check();
    await tracker
      .getByRole("button", { name: "Redigera vana: Fokusarbete", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Pausa vanan", exact: true })
      .click();
    await expect(first).toHaveCount(0);
    await tracker.getByLabel("Visa pausade vanor").check();
    await expect(first).toBeChecked();
    await tracker
      .getByRole("button", { name: "Redigera vana: Fokusarbete", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Återuppta vanan", exact: true })
      .click();
    await expect(first).toBeChecked();
    const saved = await read();
    expect(saved.weeks).toEqual(before.weeks);
    expect(saved.tasks).toEqual(before.tasks);
    await tracker
      .getByRole("button", { name: "Nästa vanovecka", exact: true })
      .click();
    await expect(tracker).toContainText("V.46");
    await expect(tracker.getByRole("checkbox").first()).toBeDisabled();
    await tracker
      .getByRole("button", { name: "Föregående vanovecka", exact: true })
      .click();
    await expect(first).toBeChecked();
    await page.reload();
    await expect(first).toBeChecked();
    await expect(tracker).toContainText("3 av 3 dagar klara");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include(".habit-tracker").analyze())
        .violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/habit-tracker-${width}.png`,
      fullPage: false,
    });
  });
