import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import type { JobApplication } from "../src/lib/types";

for (const mobile of [false, true]) {
  test(`ansökningsöversikten prioriterar nästa steg och bevarar data ${mobile ? "på mobil" : "på dator"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install({ time: new Date("2026-11-03T09:00:00Z") });
    const data = createData();
    const app = (
      id: string,
      patch: Partial<JobApplication> = {},
    ): JobApplication => ({
      id,
      organization: "Stadshuset",
      role: "Utredare",
      status: "sent",
      nextAction: "Ring rekryteraren",
      followUpDate: "2026-11-03",
      deadline: "",
      notes: "",
      ...patch,
    });
    data.applications = [
      app("upcoming", { organization: "Bolaget", followUpDate: "2026-11-06" }),
      app("today"),
      app("missing", {
        organization: "Kommunen",
        nextAction: "",
        followUpDate: "",
      }),
      app("closed", { organization: "Arkivbolaget", status: "closed" }),
    ];
    await page.addInitScript(
      (value) =>
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value)),
      data,
    );
    await page.goto("./");
    await page
      .getByRole("navigation", { name: "Huvudnavigation" })
      .getByRole("button", { name: "Jobb", exact: true })
      .click();
    const cards = page.locator(".career-cards > article");
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText("Stadshuset");
    await expect(cards.first()).toContainText("Att göra idag");
    await expect(
      cards
        .first()
        .getByRole("button", { name: "Boka arbetstid", exact: true }),
    ).toBeVisible();
    await expect(
      cards
        .first()
        .getByRole("button", { name: "Dokumentunderlag", exact: true }),
    ).not.toBeVisible();
    const before = await page.evaluate(() =>
      localStorage.getItem("veckoverket.workspace.v1"),
    );
    await page.screenshot({
      path: `test-results/application-overview-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("searchbox", { name: "Sök ansökan" })
      .fill("stadshuset ring");
    await expect(cards).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Sök ansökan" }).fill("saknas");
    await expect(
      page.getByText("Inga ansökningar matchar filtren."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Visa alla ansökningar", exact: true })
      .click();
    await expect(cards).toHaveCount(4);
    await page
      .getByRole("combobox", { name: "Visa ansökningar", exact: true })
      .selectOption("closed");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Arkivbolaget");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("veckoverket.workspace.v1"),
      ),
    ).toBe(before);
    await page
      .getByRole("combobox", { name: "Visa ansökningar", exact: true })
      .selectOption("active");
    await page.getByRole("searchbox", { name: "Sök ansökan" }).fill("Kommunen");
    await page
      .getByRole("button", { name: "Lägg till nästa steg", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("group", { name: "2. Vad händer härnäst?" }),
    ).toBeVisible();
    await dialog
      .getByLabel("Nästa steg", { exact: true })
      .fill("Skicka arbetsprov");
    await dialog
      .getByRole("button", { name: "Spara ansökan", exact: true })
      .click();
    await expect(cards).toContainText("Skicka arbetsprov");
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(saved.applications).toHaveLength(4);
    expect(
      saved.applications.find((a: JobApplication) => a.id === "closed"),
    ).toEqual(data.applications[3]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
