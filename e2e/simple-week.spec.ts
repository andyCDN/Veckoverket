import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import { openToday, navigateTo } from "./navigation";
for (const width of [1440, 390])
  test(`ett sammanhängande veckoflöde ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-09T07:00:00Z") });
    const data = createData();
    data.settings.autoPlanning = false;
    data.settings.buffer = 0;
    data.goals = [];
    data.tasks = [];
    data.habits = [];
    data.applications = [
      {
        id: "a",
        organization: "Kommunen",
        role: "Utredare",
        status: "sent",
        nextAction: "Skicka arbetsprov",
        nextActionId: "step",
        nextActionKind: "task",
        nextActionOwner: "Jag",
        followUpDate: "2026-11-09",
        deadline: "",
        notes: "",
      },
    ];
    data.contacts = [];
    data.careerActions = [];
    data.deadlines = [];
    data.weeks = {
      "2026-11-09": {
        week: "2026-11-09",
        generatedAt: "",
        weeklyRoutinesFrom: "2026-11-09",
        activities: [],
      },
    };
    await page.addInitScript((data) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data));
    }, data);
    await page.goto("./");
    await expect(
      page.getByRole("region", { name: "Nästa steg", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.locator(
        ".week-focus, .accountability-band, .studio-goals, .studio-task-list",
      ),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Måndagscheck", exact: true })
      .click();
    const check = page.getByRole("dialog", {
      name: "Måndagscheck",
      exact: true,
    });
    await check
      .getByLabel(/^Veckans startplan/)
      .fill("Leverera projektet | Skriv utkast");
    await check
      .getByRole("button", { name: "Ta fram veckomål från startplanen" })
      .click();
    await check
      .getByRole("button", { name: "Fortsätt med uppgifter", exact: true })
      .click();
    await expect(
      check.getByRole("button", { name: "2. Välj uppgifter" }),
    ).toHaveAttribute("aria-current", "step");
    await check.getByLabel("Uppgifter – en per rad").fill("Färdigställ utkast");
    await check.getByRole("button", { name: "Skapa valda veckomål" }).click();
    await check
      .getByRole("button", { name: "Fortsätt till Boka tid", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await check.getByRole("button", { name: "Visa planeringsförslag" }).click();
    await expect(
      check.getByRole("region", { name: "Planeringsförslag" }),
    ).toContainText("Färdigställ utkast");
    await page.screenshot({ path: `test-results/simple-monday-${width}.png` });
    await check
      .getByRole("button", { name: "Lägg in 1 pass i veckan" })
      .click();
    await expect(
      check.getByRole("status").filter({ hasText: "Veckan är planerad" }),
    ).toBeVisible();
    await check.getByRole("button", { name: "Stäng dialog" }).click();
    if (width < 700) {
      await expect(page.locator(".week-context")).not.toHaveAttribute("open");
      const calendar = await page.locator(".planner-calendar").boundingBox();
      const context = await page.locator(".planner-habits").boundingBox();
      expect(context!.y).toBeGreaterThan(calendar!.y);
    }
    // Same application task can be booked from the shared queue and viewed in Jobb.
    const next = page.getByRole("region", { name: "Nästa steg", exact: true });
    await next
      .getByRole("listitem")
      .filter({ hasText: "Skicka arbetsprov" })
      .getByRole("button", { name: "Boka tid" })
      .click();
    const booking = page.getByRole("dialog");
    await booking.getByLabel("Starttid", { exact: true }).fill("11:00");
    await booking
      .getByRole("button", { name: "Spara kalenderpass", exact: true })
      .click();
    await expect(next).toHaveCount(0);
    await navigateTo(page, "Jobb");
    await expect(page.locator(".career-cards")).toContainText(
      "Bokat i kalendern",
    );
    await page.getByRole("button", { name: "Till veckans arbete →" }).click();
    await openToday(page);
    const entries = page.locator(".calendar-entry");
    await entries
      .filter({ hasText: "Färdigställ utkast" })
      .getByRole("checkbox", { name: /^Genomförd:/ })
      .check();
    const resolution = page.getByRole("dialog", {
      name: "Nästa steg efter passet",
    });
    await expect(resolution.getByRole("textbox")).toHaveCount(0);
    await expect(
      resolution.getByRole("button", { name: "Mer tid", exact: true }),
    ).toBeVisible();
    await resolution.getByRole("button", { name: "Klar", exact: true }).click();
    await entries
      .filter({ hasText: "Skicka arbetsprov" })
      .getByRole("checkbox", { name: /^Genomförd:/ })
      .check();
    await resolution
      .getByRole("button", { name: "Väntar", exact: true })
      .click();
    await resolution.getByLabel("Vem väntar du på?").fill("Kim");
    await resolution.getByLabel("Följ upp datum").fill("2026-11-09");
    await resolution.getByRole("button", { name: "Spara bevakning" }).click();
    await expect(next).toContainText("Skicka arbetsprov");
    await expect(next.getByRole("button", { name: "Följ upp" })).toBeVisible();
    await navigateTo(page, "Jobb");
    await expect(page.locator(".career-cards")).toContainText("Kim");
    await page.getByRole("button", { name: "Till veckans arbete →" }).click();
    await page.getByText("+ Lägg till", { exact: true }).click();
    for (const name of ["Pass", "Uppgift", "Mål", "Vana"])
      await expect(
        page.locator(".add-menu").getByRole("button", { name, exact: true }),
      ).toBeVisible();
    await page
      .locator(".add-menu")
      .getByRole("button", { name: "Vana", exact: true })
      .click();
    await page.getByLabel("Vad vill du göra regelbundet?").fill("Läsning");
    await page.getByRole("button", { name: "Spara vana", exact: true }).click();
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(
      stored.tasks.filter(
        (t: { title: string }) => t.title === "Färdigställ utkast",
      ),
    ).toHaveLength(1);
    expect(stored.habits[0].title).toBe("Läsning");
    expect(stored.applications[0]).toMatchObject({
      nextActionKind: "waiting",
      nextActionOwner: "Kim",
    });
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
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/simple-week-${width}.png`,
      fullPage: true,
    });
  });
