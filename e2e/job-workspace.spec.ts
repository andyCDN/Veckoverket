import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { jobWorkspaceFixture } from "../src/test/fixtures/job-workspace";
import { navigateTo } from "./navigation";
import { STORAGE_KEY } from "../src/lib/storage";

for (const width of [1440, 390]) {
  test(`samlad jobblista med väntan, detaljvy, skickat och kontextbundet besked ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-23T08:00:00Z") });
    const data = jobWorkspaceFixture();
    await page.addInitScript(
      ({ key, data }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(data));
      },
      { key: STORAGE_KEY, data },
    );
    const read = () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!),
        STORAGE_KEY,
      );
    await page.goto("./");
    await navigateTo(page, "Jobb");
    const list = page.getByRole("region", { name: "Jobblista", exact: true });
    await expect(
      list.getByRole("button", { name: "Att göra (2)", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(list.locator(".job-row")).toHaveCount(2);
    const firstRow = await list.locator(".job-row").nth(0).boundingBox();
    const secondRow = await list.locator(".job-row").nth(1).boundingBox();
    expect(secondRow!.y).toBeGreaterThanOrEqual(firstRow!.y + firstRow!.height);
    expect(
      await list
        .locator(".job-row")
        .evaluateAll((rows) =>
          rows.every((row) => row.scrollWidth <= row.clientWidth),
        ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Nästa steg", exact: true }),
    ).toHaveCount(0);
    expect((await read()).applications).toEqual(data.applications);
    await page.screenshot({
      path: `test-results/job-workspace-${width}.png`,
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await list
      .getByRole("button", { name: "Väntar på svar (1)", exact: true })
      .click();
    await expect(list.locator(".job-row")).toHaveCount(1);
    await expect(list.locator(".job-row")).toContainText("Projektledare");
    await expect(
      list.getByRole("button", { name: "Boka uppföljning", exact: true }),
    ).toHaveCount(0);
    await list
      .getByRole("button", { name: "Att göra (2)", exact: true })
      .click();
    await list
      .getByRole("searchbox", { name: "Sök jobb", exact: true })
      .fill("Utredare");
    await list
      .getByRole("button", { name: "Fortsätt ansökan", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Ansökans arbetsläge", exact: true })
        .getByRole("link", { name: "Anpassa CV ↗", exact: true }),
    ).toBeVisible();
    const detail = page.getByRole("region", {
      name: "Ansökans detaljer",
      exact: true,
    });
    await expect(detail).toContainText("Personligt brev · Version 1");
    await detail.getByText("Läs annonsen", { exact: true }).click();
    await expect(detail).toContainText("Erfarenhet av analys behövs");
    await detail.getByText("Fler verktyg för ansökan", { exact: true }).click();
    await detail.getByText("Historik", { exact: true }).click();
    await expect(detail).toContainText("Tidigare notering");
    await detail
      .getByRole("button", { name: "Markera skickad", exact: true })
      .click();
    const sent = page.getByRole("dialog", {
      name: "Markera ansökan skickad",
      exact: true,
    });
    await sent
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    expect((await read()).applications[0].status).toBe("draft");
    await detail
      .getByRole("button", { name: "Markera skickad", exact: true })
      .click();
    await sent
      .getByLabel("Bevaka igen (valfritt)", { exact: true })
      .fill("2026-11-26");
    await sent
      .getByRole("button", { name: "Bekräfta skickad", exact: true })
      .click();
    await expect(sent).toHaveCount(0);
    const saved = await read();
    expect(saved.applications[0].status).toBe("sent");
    expect(saved.applications[0].nextActionKind).toBe("waiting");
    expect(saved.weeks).toEqual(data.weeks);
    expect(saved.applications[0].materials).toEqual(
      data.applications![0].materials,
    );
    await detail
      .getByRole("button", { name: "Till jobblistan", exact: true })
      .click();
    await expect(
      list.getByRole("button", { name: "Väntar på svar (2)", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const row = list.getByRole("article", {
      name: "Utredare · Kommunen",
      exact: true,
    });
    await expect(row).toBeVisible();
    await row
      .getByRole("button", { name: "Klistra in besked", exact: true })
      .click();
    const message = page.getByRole("dialog", {
      name: "Klistra in rekryteringsbesked",
      exact: true,
    });
    await message
      .getByLabel("Besked från arbetsgivaren")
      .fill(
        "Tack för din ansökan. Vi har valt att gå vidare med andra kandidater.",
      );
    await message
      .getByRole("button", { name: "Tolka besked", exact: true })
      .click();
    await expect(
      message.getByRole("combobox", { name: "Ansökan", exact: true }),
    ).toHaveValue("draft");
    await expect(
      message.getByRole("combobox", { name: "Ny status", exact: true }),
    ).toHaveValue("rejected");
    await message
      .getByRole("button", {
        name: "Godkänn och uppdatera ansökan",
        exact: true,
      })
      .click();
    await detail
      .getByRole("button", { name: "Till jobblistan", exact: true })
      .click();
    await expect(
      list.getByRole("button", { name: "Avslutade (2)", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      list.getByRole("article", { name: "Utredare · Kommunen", exact: true }),
    ).toContainText("Avslag");
    const after = await read();
    expect(after.applications[0].history.length).toBeGreaterThan(
      data.applications![0].history!.length,
    );
    expect(after.applications[0].notes).toBe(data.applications![0].notes);
  });
  test(`lägga till jobb från annonstext med granskning och avbryt utan sparande ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-23T08:00:00Z") });
    const data = jobWorkspaceFixture();
    await page.addInitScript(
      ({ key, data }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(data));
      },
      { key: STORAGE_KEY, data },
    );
    await page.goto("./");
    await navigateTo(page, "Jobb");
    const list = page.getByRole("region", { name: "Jobblista", exact: true });
    await list
      .getByRole("button", { name: "Lägg till jobb", exact: true })
      .click();
    const capture = page.getByRole("dialog", {
      name: "Lägg till jobb",
      exact: true,
    });
    const text =
      "https://example.org/annons\nTjänst: Designer\nArbetsgivare: Formbolaget\nSista ansökningsdag: 2026-12-03\nVi söker dig som kan designa tjänster.";
    await capture
      .getByLabel("Länk eller annonstext", { exact: true })
      .fill(text);
    await capture
      .getByRole("button", { name: "Läs uppgifter", exact: true })
      .click();
    await expect(capture.getByLabel("Tjänst", { exact: true })).toHaveValue(
      "Designer",
    );
    await expect(
      capture.getByLabel("Arbetsgivare", { exact: true }),
    ).toHaveValue("Formbolaget");
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).applications.length,
        STORAGE_KEY,
      ),
    ).toBe(4);
    await capture
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    await list
      .getByRole("button", { name: "Lägg till jobb", exact: true })
      .click();
    await capture
      .getByLabel("Länk eller annonstext", { exact: true })
      .fill(text);
    await capture
      .getByRole("button", { name: "Läs uppgifter", exact: true })
      .click();
    await capture
      .getByRole("button", { name: "Spara jobb", exact: true })
      .click();
    const detail = page.getByRole("region", {
      name: "Ansökans detaljer",
      exact: true,
    });
    await expect(detail).toContainText("Designer · Formbolaget");
    await page.reload();
    await navigateTo(page, "Jobb");
    await expect(
      list.getByRole("article", {
        name: "Designer · Formbolaget",
        exact: true,
      }),
    ).toBeVisible();
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      STORAGE_KEY,
    );
    expect(saved.applications).toHaveLength(5);
    expect(
      saved.applications.find((a: { role: string }) => a.role === "Designer")
        .advertisement.text,
    ).toBe(text);
    expect(
      saved.applications.find((a: { role: string }) => a.role === "Designer")
        .advertisement.url,
    ).toBe("https://example.org/annons");
  });
}

test("bevakning flyttas till Att göra när datumet nås medan listan är öppen", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-25T22:59:30Z") });
  const data = jobWorkspaceFixture();
  await page.addInitScript(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data },
  );
  await page.goto("./");
  await navigateTo(page, "Jobb");
  const list = page.getByRole("region", { name: "Jobblista", exact: true });
  await list
    .getByRole("button", { name: "Väntar på svar (1)", exact: true })
    .click();
  await expect(list).toContainText("Projektledare");
  await page.clock.fastForward(90000);
  await expect(
    list.getByRole("button", { name: "Väntar på svar (0)", exact: true }),
  ).toBeVisible();
  await list.getByRole("button", { name: "Att göra (3)", exact: true }).click();
  await expect(
    list.getByRole("article", { name: "Projektledare · Bolaget", exact: true }),
  ).toContainText("Följ upp");
});
