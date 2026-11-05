import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import { navigateTo } from "./navigation";

for (const mobile of [false, true])
  test(`kontaktflöde med grupper, snabblogg och tidslinje ${mobile ? "mobil" : "dator"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install({ time: new Date("2026-11-05T09:00:00Z") });
    const data = createData();
    data.applications = [];
    data.careerActions = [];
    data.contacts = [
      {
        id: "a",
        name: "Alex",
        organization: "Designstudion",
        nextAction: "Skicka portfolio",
        followUpDate: "2026-11-05",
        entries: [
          {
            id: "old",
            date: "2026-11-03",
            channel: "Telefon",
            notes: "Första samtalet",
          },
        ],
      },
      {
        id: "b",
        name: "Bea",
        organization: "Ateljén",
        nextAction: "Besked om mötet",
        nextActionKind: "waiting",
        nextActionOwner: "Bea",
        followUpDate: "2026-11-20",
        entries: [],
      },
      {
        id: "c",
        name: "Charlie",
        organization: "",
        nextAction: "",
        followUpDate: "",
        entries: [],
      },
    ];
    await page.addInitScript((data) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data));
    }, data);
    await page.goto("./");
    await expect(
      page.getByRole("navigation", { name: "Huvudnavigation" }),
    ).toBeVisible();
    await navigateTo(page, "Nätverk");
    const due = page.getByRole("region", {
      name: "Att följa upp",
      exact: true,
    });
    const waiting = page.getByRole("region", {
      name: "Väntar på svar",
      exact: true,
    });
    await expect(
      due.getByRole("article", { name: "Alex", exact: true }),
    ).toBeVisible();
    await expect(
      waiting.getByRole("article", { name: "Bea", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Övriga kontakter" }),
    ).toContainText("Charlie");
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    await due.getByRole("button", { name: "Logga samtal/mejl" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: "Kanal", exact: true })
      .selectOption("E-post");
    await dialog
      .getByLabel("Kort anteckning")
      .fill("Skickade portfölj och kom överens om återkoppling.");
    await dialog.getByLabel("Uppdatera nästa steg").check();
    await dialog
      .getByRole("combobox", { name: "Typ av nästa steg" })
      .selectOption("waiting");
    await dialog
      .getByLabel("Nästa steg", { exact: true })
      .fill("Svar på portföljen");
    await dialog.getByLabel("Väntar på", { exact: true }).fill("Alex");
    await dialog.getByLabel("Bevakningsdatum").fill("2026-11-12");
    await dialog.getByRole("button", { name: "Spara kontaktlogg" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(due).toHaveCount(0);
    const alex = waiting.getByRole("article", { name: "Alex", exact: true });
    await expect(alex).toContainText("Svar på portföljen");
    await expect(alex).toContainText("12 november 2026");
    await alex.getByText("Tidslinje · 2 händelser", { exact: true }).click();
    const events = alex.locator(".network-timeline ol > li");
    await expect(events.nth(0)).toContainText("Skickade portfölj");
    await expect(events.nth(1)).toContainText("Första samtalet");
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(saved.weeks).toEqual(before.weeks);
    expect(saved.applications).toEqual(before.applications);
    expect(saved.contacts[0].entries).toHaveLength(2);
    await page.getByLabel("Sök kontakter").fill("Charlie");
    await expect(waiting).toHaveCount(0);
    await expect(due).toHaveCount(0);
    await page.getByLabel("Sök kontakter").fill("");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel("Sök kontakter").blur();
    await alex.getByText("Tidslinje · 2 händelser", { exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/network-overview-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "Huvudnavigation" }),
    ).toBeVisible();
    await navigateTo(page, "Nätverk");
    await expect(
      waiting.getByRole("article", { name: "Alex", exact: true }),
    ).toContainText("Svar på portföljen");
  });
