import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
const date = "2026-11-11",
  week = "2026-11-09";
function fixture() {
  const data = createData();
  data.goals = [
    {
      id: "g",
      title: "Veckans leverans",
      horizon: "week",
      week,
      categoryId: "career",
      description: "",
    },
  ];
  data.tasks = [
    {
      id: "t",
      goalId: "g",
      title: "Skriv första stycket",
      done: false,
      estimatedMinutes: 30,
    },
    {
      id: "u",
      goalId: "g",
      title: "Läs ett mejl",
      done: false,
      estimatedMinutes: 15,
    },
  ];
  data.habits = [];
  data.applications = [];
  data.contacts = [];
  data.deadlines = [];
  data.careerActions = [];
  data.weeks = {
    [week]: { week, generatedAt: "", activities: [], weeklyRoutinesFrom: week },
  };
  return data;
}
for (const width of [1440, 390]) {
  test(`kort dagsincheck utan fritext, riktigt fokus, återöppning och radering ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.clock.install({ time: new Date("2026-11-11T07:00:00Z") });
    await page.addInitScript((value) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value));
    }, fixture());
    await page.goto("./");
    const start = page.getByRole("region", { name: "Din dagstart" });
    await start
      .getByRole("button", { name: "Dagsincheck · ca 20 sek" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Dagsincheck",
      exact: true,
    });
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Spara dagens incheck" }),
    ).toBeDisabled();
    await dialog.getByRole("radio", { name: "Okej", exact: true }).check();
    await dialog
      .getByRole("combobox", { name: "2. En liten start på fem minuter" })
      .selectOption("task:t");
    await dialog
      .getByRole("radio", { name: "Efter nästa paus", exact: true })
      .check();
    await expect(dialog.locator(".check-in-plan")).toContainText(
      "Efter nästa paus: fem minuter med ”Skriv första stycket”",
    );
    const a11y = await new AxeBuilder({ page })
      .include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/daily-check-in-${width}.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Spara dagens incheck" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(start.locator(".daily-recommendation h3")).toHaveText(
      "Skriv första stycket",
    );
    await expect(
      start.getByRole("button", { name: "Boka tid", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          (d) =>
            JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!)
              .dailyCheckIns?.[d]?.focus.id,
          date,
        ),
      )
      .toBe("t");
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(saved.tasks).toEqual(fixture().tasks);
    await page.reload();
    await expect(
      start.getByRole("button", { name: "Ändra dagsincheck" }),
    ).toBeVisible();
    await start.getByRole("button", { name: "Ändra dagsincheck" }).click();
    await dialog.getByRole("radio", { name: "Tungt", exact: true }).check();
    await dialog.getByRole("combobox").selectOption("recovery:recovery");
    await dialog.getByRole("radio", { name: "Nu", exact: true }).check();
    await dialog.getByRole("button", { name: "Spara dagens incheck" }).click();
    await expect(start).toContainText("Återhämtning är ditt valda steg");
    await expect(start.locator(".daily-recommendation")).toHaveCount(0);
    await start.getByRole("button", { name: "Ändra dagsincheck" }).click();
    await dialog.getByRole("button", { name: "Radera dagens incheck" }).click();
    await expect(
      start.getByRole("button", { name: "Dagsincheck · ca 20 sek" }),
    ).toBeVisible();
  });
}
test("ny dag i Stockholm kräver inga gamla svar och stoppar en öppen dialog över midnatt", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-11T22:59:30Z") });
  await page.addInitScript(
    (value) =>
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value)),
    fixture(),
  );
  await page.goto("./");
  const start = page.getByRole("region", { name: "Din dagstart" });
  await start.getByRole("button", { name: "Dagsincheck · ca 20 sek" }).click();
  const dialog = page.getByRole("dialog", { name: "Dagsincheck", exact: true });
  await dialog.getByRole("radio", { name: "Bra", exact: true }).check();
  await dialog.getByRole("radio", { name: "Nu", exact: true }).check();
  await page.clock.fastForward(90000);
  await dialog.getByRole("button", { name: "Spara dagens incheck" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Dagen har ändrats");
  await dialog.getByRole("button", { name: "Stäng dialog" }).click();
  await start.getByRole("button", { name: "Dagsincheck · ca 20 sek" }).click();
  await expect(
    dialog.getByRole("radio", { name: "Bra", exact: true }),
  ).not.toBeChecked();
  await dialog.getByRole("radio", { name: "Bra", exact: true }).check();
  await dialog.getByRole("radio", { name: "Nu", exact: true }).check();
  await dialog.getByRole("button", { name: "Spara dagens incheck" }).click();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Object.keys(
          JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!)
            .dailyCheckIns ?? {},
        ),
      ),
    )
    .toEqual(["2026-11-12"]);
});
