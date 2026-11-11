import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import { navigateTo } from "./navigation";
import type { Activity } from "../src/lib/types";
for (const width of [1440, 390])
  test(`LinkedIn-import granskas, sparas utan dubbletter och kopplas till samma veckouppgift ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-11T09:00:00Z") });
    const d = createData();
    d.settings.autoPlanning = false;
    d.settings.buffer = 0;
    d.goals = [];
    d.tasks = [];
    d.habits = [];
    d.contacts = [];
    d.careerActions = [];
    d.deadlines = [];
    d.recurring = [];
    d.applications = [
      {
        id: "existing",
        role: "Befintlig tjänst",
        organization: "Bevara AB",
        status: "interview",
        deadline: "",
        nextAction: "",
        followUpDate: "",
        notes: "Bevara historik och anteckningar",
        advertisement: {
          url: "https://se.linkedin.com/jobs/view/111111/?trk=old",
          text: "Befintlig annons",
        },
      },
    ];
    d.weeks = {
      "2026-11-09": {
        week: "2026-11-09",
        generatedAt: "",
        weeklyRoutinesFrom: "2026-11-09",
        activities: [],
      },
    };
    await page.addInitScript((d) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(d));
    }, d);
    const linkedinRequests: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).hostname.endsWith("linkedin.com"))
        linkedinRequests.push(r.url());
    });
    const stored = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
      );
    await page.goto("./");
    await navigateTo(page, "Jobb");
    const before = await stored();
    await page
      .getByRole("button", { name: "Importera från LinkedIn", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Importera från LinkedIn",
    });
    const text =
      "https://se.linkedin.com/jobs/view/senior-utvecklare-at-bolaget-222222/?trackingId=secret\nhttps://www.linkedin.com/jobs/view/222222/?utm_source=foo\nhttps://www.linkedin.com/jobs/search/?currentJobId=333333\nhttps://www.linkedin.com/jobs/view/111111/?trk=new\nhttps://linkedin.com.evil.test/jobs/view/444444/";
    await dialog.getByLabel("Jobblänkar – en per rad").fill(text);
    await dialog
      .getByRole("button", { name: "Granska jobben", exact: true })
      .click();
    await expect(dialog).toContainText(
      "Finns redan: Befintlig tjänst · Bevara AB",
    );
    await expect(dialog).toContainText("Ingen giltig LinkedIn-länk");
    expect((await stored()).applications).toEqual(before.applications);
    const first = dialog.getByRole("group", { name: "Jobb 1", exact: true });
    await first.getByLabel("Tjänst", { exact: true }).fill("Utvecklare");
    await first.getByLabel("Arbetsgivare", { exact: true }).fill("Testbolaget");
    await first.getByLabel("Sista ansökningsdag (valfritt)").fill("2026-11-30");
    await first
      .getByRole("combobox", { name: "Nästa steg", exact: true })
      .selectOption("Förbered ansökan");
    const second = dialog.getByRole("group", { name: "Jobb 3", exact: true });
    await second.getByLabel("Tjänst", { exact: true }).fill("Designer");
    await second
      .getByLabel("Arbetsgivare", { exact: true })
      .fill("Designbolaget");
    await second
      .getByRole("combobox", { name: "Nästa steg", exact: true })
      .selectOption("");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/linkedin-review-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "Importera 2 jobb", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByText(/^2 jobb har importerats som utkast/),
    ).toBeVisible();
    let after = await stored();
    expect(after.applications).toHaveLength(3);
    expect(after.applications[0]).toEqual(before.applications[0]);
    expect(after.weeks).toEqual(before.weeks);
    expect(after.applications[1].advertisement.url).toBe(
      "https://www.linkedin.com/jobs/view/222222/",
    );
    expect(after.applications[2].nextAction).toBe("");
    await navigateTo(page, "Vecka");
    const queue = page.getByRole("region", { name: "Nästa steg", exact: true });
    const row = queue.getByRole("listitem").filter({ hasText: "Testbolaget" });
    await expect(row).toContainText("Förbered ansökan");
    await row.getByRole("button", { name: "Boka tid", exact: true }).click();
    const booking = page.getByRole("dialog");
    await booking.getByLabel("Starttid", { exact: true }).fill("11:00");
    await booking
      .getByRole("button", { name: "Spara kalenderpass", exact: true })
      .click();
    after = await stored();
    const imported = after.applications[1];
    expect(
      after.weeks["2026-11-09"].activities.filter(
        (a: Activity) => a.careerActionId === imported.nextActionId,
      ),
    ).toHaveLength(1);
    expect(after.tasks).toEqual([]);
    await navigateTo(page, "Jobb");
    await page
      .getByRole("button", { name: "Importera från LinkedIn", exact: true })
      .click();
    await dialog
      .getByLabel("Jobblänkar – en per rad")
      .fill(
        "https://www.linkedin.com/jobs/view/222222/\nhttps://www.linkedin.com/jobs/view/333333/",
      );
    await dialog
      .getByRole("button", { name: "Granska jobben", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Importera 0 jobb", exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Avbryt", exact: true }).click();
    await page.reload();
    await navigateTo(page, "Jobb");
    expect((await stored()).applications).toHaveLength(3);
    expect(linkedinRequests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/linkedin-imported-${width}.png`,
      fullPage: true,
    });
  });
