import { test, expect } from "@playwright/test";
for (const width of [1440, 390])
  test(`måndagscheck skapar redigerbara veckomål utan dubbletter ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: new Date("2026-11-09T09:00:00Z") });
    await page.goto("./");
    await page
      .getByRole("button", { name: "Måndagscheck", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Måndagscheck" });
    await dialog
      .getByLabel(/^Veckans startplan/)
      .fill("Två ansökningar skickade | Anpassa CV; Skicka ansökningar");
    await dialog
      .getByRole("button", { name: "Ta fram veckomål från startplanen" })
      .click();
    await dialog
      .getByLabel("Veckomål", { exact: true })
      .fill("Tre ansökningar skickade");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await dialog
      .getByLabel("Veckomål", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/monday-goals-${width}.png` });
    await dialog.getByRole("button", { name: "Skapa valda veckomål" }).click();
    await expect(
      dialog.getByRole("status").filter({ hasText: "1 veckomål har skapats" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("region", { name: "Veckans mål", exact: true }),
    ).toContainText("Tre ansökningar skickade");
    await dialog
      .getByLabel(/^Veckans startplan/)
      .fill("Tre ansökningar skickade | Anpassa CV; Skicka ansökningar");
    await dialog
      .getByRole("button", { name: "Ta fram veckomål från startplanen" })
      .click();
    await dialog.getByRole("button", { name: "Skapa valda veckomål" }).click();
    await expect(dialog.getByText(/^Inga nya mål skapades/)).toBeVisible();
    await dialog
      .getByRole("button", { name: "Planera veckans mål och vanor" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Anpassa CV");
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(
      stored.goals.filter(
        (g: { title: string }) => g.title === "Tre ansökningar skickade",
      ),
    ).toHaveLength(1);
    await page.reload();
    await page
      .getByRole("button", { name: "Måndagscheck", exact: true })
      .click();
    await expect(
      dialog.getByRole("region", { name: "Veckans mål", exact: true }),
    ).toContainText("Tre ansökningar skickade");
  });
