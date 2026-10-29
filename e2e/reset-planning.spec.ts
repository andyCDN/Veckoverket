import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createData } from "../src/lib/defaults";
import { generateWeek } from "../src/lib/planner";

const week = "2026-10-26",
  key = "veckoverket.workspace.v1";
const stored = (page: Page) =>
  page.evaluate((name) => JSON.parse(localStorage.getItem(name)!), key);
for (const mobile of [false, true]) {
  test(`nollställning ${mobile ? "i installerad mobilvy" : "på dator"} bevarar inställningar och återläses tom`, async ({
    page,
  }) => {
    const data = createData();
    data.profile.name = "Min profil";
    data.settings.musicMornings = 1;
    data.categories.push({
      ...data.categories[0],
      id: "custom-admin",
      name: "Administration",
      targetMinutes: 0,
    });
    data.weeks[week] = generateWeek(week, data).plan;
    data.weeks["2026-10-19"] = generateWeek("2026-10-19", data).plan;
    data.weeks[week].activities[0].status = "done";
    data.weeks[week].activities[1].status = "skipped";
    data.reflections[week] = {
      week,
      good: "Sparad reflektion",
      unfinished: "",
      balance: "",
      next: "",
      updatedAt: new Date().toISOString(),
    };
    await page.clock.install({ time: new Date("2026-10-29T10:00:00+01:00") });
    await page.addInitScript(
      ({ data, key, mobile }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(data));
        if (mobile)
          Object.defineProperty(navigator, "standalone", { get: () => true });
      },
      { data, key, mobile },
    );
    if (mobile) await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("./");
    await expect(page.locator(".calendar-grid")).toBeVisible();
    const before = await stored(page);
    const nav = page.getByRole("navigation", { name: "Huvudnavigation" });
    await nav
      .getByRole("button", { name: "Inställningar", exact: true })
      .click();
    const open = () =>
      page
        .getByRole("button", {
          name: "Nollställ planering och statistik",
          exact: true,
        })
        .click();
    await open();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName(
      "Nollställ planering och statistik",
    );
    await expect(
      dialog.getByRole("button", { name: "Nollställ nu", exact: true }),
    ).toBeDisabled();
    const downloadReady = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Exportera säkerhetskopia", exact: true })
      .click();
    const backup = await downloadReady;
    expect(JSON.parse(await readFile((await backup.path())!, "utf8"))).toEqual(
      before,
    );
    await dialog.getByRole("button", { name: "Avbryt", exact: true }).click();
    expect(await stored(page)).toEqual(before);
    await open();
    await dialog
      .getByRole("checkbox", {
        name: "Jag vill ta bort sparad planering och statistik.",
        exact: true,
      })
      .check();
    await dialog
      .getByRole("button", { name: "Nollställ nu", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".calendar-entry")).toHaveCount(0);
    const result = await stored(page);
    expect(result.settings).toEqual(before.settings);
    expect(result.categories).toEqual(before.categories);
    expect(result.profile).toEqual(before.profile);
    expect(result.goals).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.recurring).toEqual([]);
    expect(result.reflections).toEqual({});
    expect(Object.keys(result.weeks)).toEqual([week]);
    await page.reload();
    await expect(page.locator(".calendar-entry")).toHaveCount(0);
    await expect(page.locator(".day-shell.is-selected .day-empty")).toHaveText(
      "Inga pass denna dag",
    );
    await nav
      .getByRole("button", {
        name: mobile ? "Reflektion" : "Veckoreflektion",
        exact: true,
      })
      .click();
    await expect(page.locator(".reflection-summary")).toContainText("0");
  });
}
