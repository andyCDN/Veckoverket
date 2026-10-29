import { test, expect } from "@playwright/test";
import { addDays, hours, time } from "../src/lib/date";
async function nav(page: import("@playwright/test").Page, name: string) {
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
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Min vecka" })).toBeVisible();
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
  ).toContainText("8,3 h");
  await page.getByRole("button", { name: "Spara och planera veckan" }).click();
  await expect(page.getByRole("heading", { name: "Min vecka" })).toBeVisible();
  await page.reload();
  await page.locator(".info-drawer > summary").click();
  await expect(
    page.locator(".balance-stat").filter({ hasText: "Jobb & nätverk" }),
  ).toContainText("8,3 h");
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
  await page.goto("./");
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
  const start = await page.getByLabel("Start", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Ta bort", exact: true }).click();
  await page.getByRole("button", { name: "Ny aktivitet", exact: true }).click();
  await page.getByLabel("Namn", { exact: true }).fill("Mitt eget projekt");
  await page.getByLabel("Datum", { exact: true }).fill(date);
  await page.getByLabel("Start", { exact: true }).fill(start);
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
  await page.goto("./");
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
  await page.goto("./");
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
test("mobil dagsagenda, navigation, redigering och ingen sidscroll", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-29T10:00:00+01:00") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.locator(".day-focus")).toBeVisible();
  await expect(page.locator(".day-shell:visible")).toHaveCount(1);
  await expect(page.locator(".day-shell:visible")).toHaveClass(/is-today/);
  expect(
    await page
      .locator(".calendar-viewport")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(false);
  await page.getByRole("button", { name: /^Visa måndag/ }).click();
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
  await page.locator(".calendar-tools-menu > summary").click();
  await page
    .getByRole("button", { name: "Filtrera aktiviteter", exact: true })
    .click();
  const filters = page.getByRole("group", { name: "Filtrera aktiviteter" });
  await expect(filters).toBeVisible();
  await filters.getByRole("button", { name: "Musik", exact: true }).click();
  await expect(page.locator(".day-shell:visible .day-empty")).toHaveText(
    "Inga pass i vald kategori",
  );
  await page
    .getByRole("button", { name: "Visa alla", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /^Visa lördag/ }).click();
  await expect(page.locator(".day-shell:visible .day-empty")).toHaveText(
    "Inga pass denna dag",
  );
  await page.getByRole("button", { name: "Idag", exact: true }).click();
  await expect(page.locator(".day-shell:visible")).toHaveClass(/is-today/);
  await nav(page, "Inställningar");
  await expect(
    page.getByRole("heading", { name: "Tillgänglighet och tidsmål" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.clock.setSystemTime(new Date("2026-10-31T10:00:00+01:00"));
  await page.reload();
  await expect(page.locator(".day-focus-name")).toContainText(
    "Lördag31 oktober 2026",
  );
  await expect(page.locator(".day-shell:visible .day-empty")).toHaveText(
    "Inga pass denna dag",
  );
});
test("dra och släpp flyttar flexibelt block och avvisar upptagen tid", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const first = await stored(page),
    w = Object.keys(first.weeks)[0];
  const career = first.weeks[w].activities.find(
    (a: { categoryId: string; date: string }) =>
      a.categoryId === "career" && a.date === w,
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
  await page.goto("./");
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
test("kategorifilter ändrar bara visningen och utskrift visar hela veckan", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const before = await stored(page),
    week = Object.keys(before.weeks)[0],
    total = before.weeks[week].activities.length;
  const filters = page.getByRole("group", { name: "Filtrera aktiviteter" });
  await filters.getByRole("button", { name: "Musik", exact: true }).click();
  await expect(page.locator(".calendar-block:visible")).toHaveCount(2);
  for (const a of await page.locator(".calendar-block:visible").all())
    await expect(a.locator(".block-category")).toHaveText("Musik");
  expect(await stored(page)).toEqual(before);
  // A filtered-out job block still occupies its time in the scheduling rules.
  await page.getByRole("button", { name: "Ny aktivitet", exact: true }).click();
  await page
    .getByLabel("Namn", { exact: true })
    .fill("Tid som redan är upptagen");
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(page.locator(".inline-error")).toContainText("överlappar");
  await page.getByRole("button", { name: "Stäng dialog", exact: true }).click();
  expect(await stored(page)).toEqual(before);
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = "true";
    };
  });
  await page.getByRole("button", { name: "Skriv ut", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-print-requested",
    "true",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Visa fredag/ }).click();
  await expect(page.locator(".day-heading.is-selected")).toContainText(
    "Fredag",
  );
  // Print must restore chronological, equal-width columns even after mobile reordering.
  await page
    .locator(".calendar-viewport")
    .evaluate((el) => (el.scrollLeft = 200));
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".week-title:visible")).toContainText("Vecka");
  await expect(page.locator(".day-shell:visible")).toHaveCount(5);
  await expect(page.locator(".calendar-block:visible")).toHaveCount(total);
  for (const [index, count] of (
    await page.locator(".print-count:visible").all()
  ).entries()) {
    const iso = addDays(week, index);
    const expected = before.weeks[week].activities.filter(
      (a: { date: string }) => a.date === iso,
    ).length;
    await expect(count).toHaveText(`${expected} pass`);
  }
  await expect(filters).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skriv ut", exact: true }),
  ).not.toBeVisible();
  const pdf = await page.pdf({
    path: "test-results/veckoschema-riso.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  const pages = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? [];
  expect(pages.length).toBe(1);
});
test("PUNK RISO-layout i 1440, 1024, 768 och 390 px utan sidscroll", async ({
  page,
}) => {
  test.setTimeout(60000);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1024 });
    await page.goto("./");
    await expect(page.locator(".calendar-grid")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/riso-${width}.png`,
      fullPage: true,
    });
    if (width === 768) {
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.failureSummary),
        })),
      ).toEqual([]);
    }
  }
});
test("varje kalenderhändelse kan bockas av, återställas och sparas utan att öppna editorn", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const before = await stored(page),
    week = Object.keys(before.weeks)[0],
    firstId = await page
      .locator(".calendar-entry")
      .first()
      .getAttribute("data-activity-id"),
    first = before.weeks[week].activities.find(
      (a: { id: string }) => a.id === firstId,
    );
  await expect(
    page.locator(".calendar-completion input[type=checkbox]"),
  ).toHaveCount(before.weeks[week].activities.length);
  const firstEntry = page.locator(".calendar-entry").first(),
    firstCheck = firstEntry.getByRole("checkbox", { name: /^Genomförd:/ });
  await firstCheck.check();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(firstEntry.locator(".calendar-block")).toHaveClass(/is-done/);
  expect(
    (await stored(page)).weeks[week].activities.find(
      (a: { id: string }) => a.id === first.id,
    ),
  ).toEqual({ ...first, status: "done" });
  await page.reload();
  await expect(firstCheck).toBeChecked();
  await firstCheck.uncheck();
  await expect(firstEntry.locator(".calendar-block")).not.toHaveClass(
    /is-done/,
  );
  const lunch = page
    .locator(".calendar-entry")
    .filter({ has: page.locator(".lunch") })
    .first();
  await lunch.getByRole("checkbox", { name: /^Genomförd:/ }).check();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await nav(page, "Veckoreflektion");
  await expect(
    page
      .locator(".comparison-row")
      .filter({ hasText: "Återhämtning" })
      .locator("strong"),
  ).toHaveText("5 h / 1 h");
  await page.setViewportSize({ width: 390, height: 844 });
  await nav(page, "Min vecka");
  await page.getByRole("button", { name: /^Visa måndag/ }).click();
  await lunch.getByRole("checkbox", { name: /^Genomförd:/ }).focus();
  await page.keyboard.press("Space");
  await expect(
    lunch.getByRole("checkbox", { name: /^Genomförd:/ }),
  ).not.toBeChecked();
  expect((await stored(page)).weeks[week].activities).toEqual(
    before.weeks[week].activities,
  );
});
test("baksidans länkar visar och fokuserar reflektion respektive lagringsinställningar", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page
    .getByRole("button", { name: "Visa veckoreflektioner", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Veckoreflektion", exact: true }),
  ).toBeInViewport();
  await expect(page.locator("#main-content")).toBeFocused();
  await page
    .getByRole("button", {
      name: "Lagring och säkerhetskopiering",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Lagring och säkerhetskopiering",
      exact: true,
    }),
  ).toBeInViewport();
  await expect(page.locator("#storage-settings")).toBeFocused();
});

test("v2.5: aktiv dag, exakta datum, veckobyte och nytt pass på vald dag", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-29T10:00:00+01:00") });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("./");
    const focus = page.getByRole("group", { name: "Vald dag", exact: true });
    await expect(focus.locator(".focus-marker")).toHaveText("Idag");
    await expect(focus.locator(".day-focus-name")).toContainText(
      "Torsdag29 oktober 2026",
    );
    const selected = page.locator(".day-heading.is-selected");
    await expect(selected.getByRole("button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const viewport = (await page.locator(".calendar-viewport").boundingBox())!;
    const active = (await selected.boundingBox())!;
    const first = (await page
      .locator(".day-shell.is-selected .calendar-entry")
      .first()
      .boundingBox())!;
    expect(first.y).toBeLessThan(height - 100);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width > 950) {
      const inactive = (await page
        .locator(".day-heading:not(.is-selected)")
        .first()
        .boundingBox())!;
      expect(active.width / inactive.width).toBeCloseTo(1.9, 1);
    } else if (width <= 700) {
      await expect(page.locator(".day-shell:visible")).toHaveCount(1);
      const agenda = (await page
        .locator(".day-shell.is-selected")
        .boundingBox())!;
      expect(agenda.width / viewport.width).toBeCloseTo(1, 1);
      expect(
        await page
          .locator(".calendar-viewport")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    } else {
      expect(Math.abs(active.x - viewport.x - 2)).toBeLessThan(2);
      expect(active.width / viewport.width).toBeCloseTo(0.92, 1);
    }
    await page.screenshot({ path: `test-results/v25-${width}.png` });
    await page.getByRole("button", { name: /^Visa måndag/ }).click();
    await expect(focus.locator(".focus-marker")).toHaveText("Vald dag");
    await expect(focus.locator(".day-focus-name")).toContainText(
      "Måndag26 oktober 2026",
    );
    await page
      .getByRole("button", { name: "Välj nästa dag", exact: true })
      .click();
    await expect(focus.locator(".day-focus-name")).toContainText(
      "Tisdag27 oktober 2026",
    );
    await page
      .getByRole("button", { name: "Ny aktivitet", exact: true })
      .click();
    await expect(page.getByLabel("Datum", { exact: true })).toHaveValue(
      "2026-10-27",
    );
    await page.keyboard.press("Escape");
    if (width <= 700)
      await page.locator(".calendar-tools-menu > summary").click();
    await page
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    await expect(focus.locator(".day-focus-name")).toContainText(
      "Måndag2 november 2026",
    );
    await expect(focus.locator(".focus-marker")).toHaveText("Vald dag");
    await expect(page.locator(".day-heading.is-today")).toHaveCount(0);
    await page.getByRole("button", { name: "Till idag", exact: true }).click();
    await expect(focus.locator(".focus-marker")).toHaveText("Idag");
    await expect(focus.locator(".day-focus-name")).toContainText(
      "Torsdag29 oktober 2026",
    );
  }
  expect(errors).toEqual([]);
});

test("v2.5: missade pass, ombokning, ändrad längd, borttagning och uppföljning över veckor", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("./");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const initial = await stored(page),
    week = Object.keys(initial.weeks)[0];
  const original = initial.weeks[week].activities.find(
    (a: { date: string; categoryId: string }) =>
      a.date === week && a.categoryId === "career",
  );
  const debt = `${hours(original.end - original.start)} kvar att boka om`;
  const entry = page.locator(`[data-activity-id="${original.id}"]`);
  const missed = entry.getByRole("checkbox", { name: /^Missat:/ }),
    done = entry.getByRole("checkbox", { name: /^Genomförd:/ });
  const panel = page.getByRole("region", {
    name: "Uppföljning av missade pass",
  });
  await missed.check();
  await expect(done).not.toBeChecked();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(panel.getByRole("status")).toHaveText(debt);
  await done.check();
  await expect(missed).not.toBeChecked();
  await expect(panel).not.toBeVisible();
  await missed.check();
  await expect(done).not.toBeChecked();
  // Make a real free slot; ombokning must not displace occupied or locked passes.
  const study = initial.weeks[week].activities.find(
    (a: { categoryId: string; start: number; date: string }) =>
      a.categoryId === "learning" && a.start === 510 && a.date > week,
  );
  await page
    .locator(`[data-activity-id="${study.id}"]`)
    .getByRole("button", { name: /^Ta bort pass:/ })
    .click();
  await panel.getByRole("button", { name: "Boka om", exact: true }).click();
  await expect(page.getByLabel("Datum", { exact: true })).toHaveValue(
    study.date,
  );
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("08:30");
  await expect(page.getByLabel("Slut", { exact: true })).toHaveValue(
    time(510 + original.end - original.start),
  );
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(panel.getByRole("status")).toHaveText("0 h kvar att boka om");
  await expect(panel.locator(".followup-state")).toHaveText("Ombokad");
  await expect(
    panel.getByRole("button", { name: "Boka om", exact: true }),
  ).toHaveCount(0);
  let after = await stored(page);
  const replacement = after.weeks[week].activities.find(
    (a: { followUpOf?: { activityId: string } }) =>
      a.followUpOf?.activityId === original.id,
  );
  expect(
    after.weeks[week].activities.find(
      (a: { id: string }) => a.id === original.id,
    ),
  ).toEqual({ ...original, status: "skipped" });
  await page.reload();
  await expect(panel.getByRole("status")).toHaveText("0 h kvar att boka om");
  await panel.getByRole("button", { name: /^Ersättningspass:/ }).click();
  await page.getByLabel("Slut", { exact: true }).fill("10:30");
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText(
    `${hours(original.end - original.start - 120)} kvar att boka om`,
  );
  await page
    .locator(`[data-activity-id="${replacement.id}"]`)
    .getByRole("button", { name: /^Ta bort pass:/ })
    .click();
  await expect(panel.getByRole("status")).toHaveText(debt);
  // Unresolved time follows the user into another week.
  await page.getByRole("button", { name: "Nästa vecka", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText(debt);
  after = await stored(page);
  const next = Object.keys(after.weeks).sort().at(-1)!;
  const nextStudy = after.weeks[next].activities.find(
    (a: { categoryId: string; start: number }) =>
      a.categoryId === "learning" && a.start === 510,
  );
  await page
    .locator(`[data-activity-id="${nextStudy.id}"]`)
    .getByRole("button", { name: /^Ta bort pass:/ })
    .click();
  await panel.getByRole("button", { name: "Boka om", exact: true }).click();
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  after = await stored(page);
  const nextReplacement = after.weeks[next].activities.find(
    (a: { followUpOf?: { activityId: string } }) =>
      a.followUpOf?.activityId === original.id,
  );
  expect(nextReplacement.followUpOf).toEqual({ week, activityId: original.id });
  const nextEntry = page.locator(`[data-activity-id="${nextReplacement.id}"]`);
  await nextEntry.getByRole("checkbox", { name: /^Missat:/ }).check();
  await expect(panel.getByRole("status")).toHaveText(debt);
  await expect(panel.locator(".debt-chip")).toHaveCount(1);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
  await nextEntry.getByRole("checkbox", { name: /^Genomförd:/ }).check();
  await expect(
    nextEntry.getByRole("checkbox", { name: /^Missat:/ }),
  ).not.toBeChecked();
  await expect(panel).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Nästa vecka", exact: true }).click();
  await expect(
    nextEntry.getByRole("checkbox", { name: /^Genomförd:/ }),
  ).toBeChecked();
});
