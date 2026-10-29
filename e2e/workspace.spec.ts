import { test, expect } from "@playwright/test";
async function nav(page: import("@playwright/test").Page, name: string) {
  if ((await page.viewportSize())!.width <= 760)
    await page
      .getByRole("button", { name: "Öppna menyn", exact: true })
      .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function stored(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
  );
}
test("svensk vecka, musikalternativ, överbelastning och beständig lagring", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Lite mer balans i vardagen." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  let data = await stored(page),
    week = Object.keys(data.weeks)[0];
  expect(
    data.weeks[week].activities.filter(
      (a: { categoryId: string }) => a.categoryId === "music",
    ),
  ).toHaveLength(2);
  await nav(page, "Inställningar");
  await page.getByRole("button", { name: "1 förmiddag", exact: true }).click();
  await expect(
    page.locator(".preview-row").filter({ hasText: "Jobb & nätverk" }),
  ).toContainText("8,5 h");
  await page.getByRole("button", { name: "Spara och planera veckan" }).click();
  await expect(
    page.getByRole("heading", { name: "Lite mer balans i vardagen." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".balance-stat").filter({ hasText: "Jobb & nätverk" }),
  ).toContainText("8,5 h");
  await nav(page, "Inställningar");
  await page
    .getByRole("button", { name: "2 förmiddagar", exact: true })
    .click();
  await page.getByRole("button", { name: "3 pass", exact: true }).click();
  await expect(page.locator(".preview-warning")).toContainText("90 minuter");
  await page.getByRole("button", { name: "Spara och planera veckan" }).click();
  await expect(page.locator(".conflicts-panel")).toContainText("90 minuter");
  expect(errors).toEqual([]);
});
test("redigering, status, egna aktiviteter, kategorier, mål, uppgifter och reflektion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Jobbsökande" })
    .first()
    .click();
  await page.getByLabel("Namn", { exact: true }).fill("Förbereda intervju");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("done");
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Förbereda intervju" }),
  ).toHaveClass(/is-done/);
  // Free up an existing interval, then create a real custom activity in it.
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Förbereda intervju" })
    .click();
  const date = await page.getByLabel("Datum", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Ta bort", exact: true }).click();
  await page.getByRole("button", { name: "Ny aktivitet", exact: true }).click();
  await page.getByLabel("Namn", { exact: true }).fill("Mitt eget projekt");
  await page.getByLabel("Datum", { exact: true }).fill(date);
  await page.getByLabel("Start", { exact: true }).fill("08:30");
  await page.getByLabel("Slut", { exact: true }).fill("09:30");
  await page
    .getByRole("combobox", { name: "Återkommer", exact: true })
    .selectOption("weekly");
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Mitt eget projekt" }),
  ).toBeVisible();
  await nav(page, "Mål & aktiviteter");
  await page.getByRole("button", { name: "Nytt mål", exact: true }).click();
  await page.getByLabel("Mål", { exact: true }).fill("Lära mig fotografera");
  await page
    .getByLabel("Konkreta uppgifter", { exact: true })
    .fill("Ta en bild\nLäs en artikel");
  await page.getByRole("button", { name: "Skapa mål", exact: true }).click();
  await page.getByLabel("Ta en bild", { exact: true }).check();
  await page.reload();
  await nav(page, "Mål & aktiviteter");
  await expect(page.getByLabel("Ta en bild", { exact: true })).toBeChecked();
  await nav(page, "Veckoreflektion");
  await page
    .getByLabel("Vad fungerade bra?", { exact: false })
    .fill("Jag gav kreativiteten plats.");
  await page.reload();
  await nav(page, "Veckoreflektion");
  await expect(
    page.getByLabel("Vad fungerade bra?", { exact: false }),
  ).toHaveValue("Jag gav kreativiteten plats.");
  await nav(page, "Inställningar");
  await page
    .getByRole("button", { name: "Lägg till eget livsområde", exact: true })
    .click();
  await page.getByLabel("Namn", { exact: true }).fill("Fotografi");
  await page
    .getByRole("button", { name: "Lägg till livsområde", exact: true })
    .click();
  await page.getByRole("button", { name: "Spara och planera veckan" }).click();
  const data = await stored(page);
  expect(
    data.categories.some((c: { name: string }) => c.name === "Fotografi"),
  ).toBe(true);
});
test("ny vecka återanvänder regler och skyddar föregående vecka", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const initial = await stored(page);
  const week = Object.keys(initial.weeks)[0];
  await page.getByRole("button", { name: "Nästa vecka", exact: true }).click();
  const after = await stored(page);
  expect(Object.keys(after.weeks)).toHaveLength(2);
  expect(after.weeks[week]).toEqual(initial.weeks[week]);
  await page
    .getByRole("button", { name: "Föregående vecka", exact: true })
    .click();
  expect((await stored(page)).weeks[week]).toEqual(initial.weeks[week]);
});
test("överlappning nekas i editorn och låst tid kan inte dras", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Kompetensutveckling" })
    .first()
    .click();
  await page.getByLabel("Start", { exact: true }).fill("12:00");
  await page.getByLabel("Slut", { exact: true }).fill("13:00");
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(page.locator(".inline-error")).toContainText("överlappar");
  await page.getByRole("button", { name: "Stäng dialog", exact: true }).click();
  const lunch = page.locator(".calendar-block.lunch").first();
  expect(await lunch.getAttribute("aria-roledescription")).toBeNull();
});
test("mobil dagvy, meny, redigering och ingen horisontell överströmning", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".mobile-days")).toBeVisible();
  await expect(page.locator(".day-shell:visible")).toHaveCount(1);
  await page.getByRole("button", { name: /Mån/ }).first().click();
  await expect(page.locator(".day-heading.mobile-active")).toContainText(
    "Måndag",
  );
  const overflowing = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflowing).toBe(false);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.locator(".calendar-block:visible").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await nav(page, "Inställningar");
  await expect(
    page.getByRole("heading", { name: "En vecka som passar ditt liv." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
test("dra och släpp flyttar flexibelt block och avvisar upptagen tid", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const first = await stored(page),
    w = Object.keys(first.weeks)[0];
  const career = first.weeks[w].activities.find(
    (a: { categoryId: string; start: number }) =>
      a.categoryId === "career" && a.start === 510,
  );
  const study = page
    .locator(".day-shell")
    .nth(2)
    .locator(".calendar-block")
    .filter({ hasText: "Kompetensutveckling" });
  await study.click();
  await page.getByRole("button", { name: "Ta bort", exact: true }).click();
  const block = page
    .locator(".day-shell")
    .nth(0)
    .locator(".calendar-block")
    .filter({ hasText: "Jobbsökande" });
  const from = (await block.boundingBox())!;
  const target = (await page.locator(".day-column").nth(2).boundingBox())!;
  await page.mouse.move(from.x + 35, from.y + 25);
  await page.mouse.down();
  await page.mouse.move(target.x + 35, from.y + 25, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const d = await stored(page);
      return d.weeks[w].activities.find(
        (a: { id: string }) => a.id === career.id,
      ).date;
    })
    .not.toBe(w);
  const after = await stored(page),
    moved = after.weeks[w].activities.find(
      (a: { id: string }) => a.id === career.id,
    );
  const movedBox = (await page
    .locator(".day-shell")
    .nth(2)
    .locator(".calendar-block")
    .filter({ hasText: "Jobbsökande" })
    .first()
    .boundingBox())!;
  const occupied = (await page.locator(".day-column").nth(1).boundingBox())!;
  await page.mouse.move(movedBox.x + 35, movedBox.y + 25);
  await page.mouse.down();
  await page.mouse.move(occupied.x + 35, movedBox.y + 25, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator(".toast")).toContainText("överlappar");
  expect(
    (await stored(page)).weeks[w].activities.find(
      (a: { id: string }) => a.id === career.id,
    ),
  ).toEqual(moved);
});
test("tillgänglighet i huvudvyer och aktivitetsdialog", async ({ page }) => {
  test.setTimeout(90000);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await page.goto("/");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  for (const name of [
    "Min vecka",
    "Mål & aktiviteter",
    "Veckoreflektion",
    "Inställningar",
    "Veckoplanerare",
  ]) {
    await nav(page, name);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      name,
    ).toEqual([]);
  }
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Kompetensutveckling" })
    .first()
    .click();
  const dialogScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    dialogScan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
