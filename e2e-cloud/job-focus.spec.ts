import { test, expect, type Page } from "@playwright/test";
import { mock, row, login, logout, userA, userB } from "./helpers";
import { navigateTo } from "../e2e/navigation";
import { applicationFlowFixture } from "../src/test/fixtures/application-flow";
import { reviewJobFixture, reviewText } from "../src/test/fixtures/job-review";
import type { AppData } from "../src/lib/types";

const cv =
  "Kandidatexamen i statsvetenskap, Universitetet, 2010.\nPolitiskt arbete 2012–2022: politisk rådgivning och remissvar.\nProjektledning och EU-samordning i ideell organisation.";
const jobs = [
  reviewJobFixture(),
  reviewJobFixture({
    role: "Kommunikatör",
    organization: "Organisationen",
    url: "https://example.org/comms",
    text: reviewText.replace("påverkansarbete", "kommunikationsarbete"),
  }),
];

async function setup(
  page: Page,
  width: number,
  data: AppData = applicationFlowFixture(),
) {
  await page.setViewportSize({ width, height: 1000 });
  const f = await mock(page, row(data));
  await page.clock.setFixedTime(new Date("2026-11-23T08:00:00Z"));
  await page.route("**/jobbspaning.json*", (route) =>
    route.fulfill({ json: { jobs, updatedAt: "2026-11-23T08:00:00Z" } }),
  );
  await page.goto("./");
  await login(page);
  await navigateTo(page, "Jobb");
  return f;
}
const jobList = (page: Page) =>
  page.getByRole("region", { name: "Jobblista", exact: true });
const detail = (page: Page) =>
  page.getByRole("region", { name: "Ansökans detaljer", exact: true });
const watch = (page: Page) =>
  page.getByRole("region", { name: "Jobbspaning", exact: true });
async function openWatch(page: Page) {
  await page.getByRole("button", { name: "Jobbspaning", exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const width of [1440, 390]) {
  test(`CV-textfil kan läsas och tas bort medan veckans arbetsyta behålls ${width}`, async ({
    page,
  }) => {
    const data = applicationFlowFixture(),
      f = await setup(page, width, data);
    for (const name of [
      "Utredare · Kommunen",
      "Analytiker · Stadshuset",
      "Kommunikatör · Museet",
    ])
      await jobList(page)
        .getByRole("article", { name, exact: true })
        .getByRole("button", { name: "Välj till veckan", exact: true })
        .click();
    const focus = jobList(page).getByRole("region", {
      name: "Veckans val",
      exact: true,
    });
    await focus.scrollIntoViewIfNeeded();
    await focus.screenshot({ path: `test-results/job-weekly-${width}.png` });
    await openWatch(page);
    await watch(page)
      .getByRole("button", { name: "CV för jobbmatchning", exact: true })
      .click();
    let editor = page.getByRole("dialog", {
      name: "CV för jobbmatchning",
      exact: true,
    });
    await editor
      .getByLabel("Läs in filer (PDF, PowerPoint eller text)", { exact: true })
      .setInputFiles({
        name: "grund-cv.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(cv),
      });
    await expect(
      editor.getByLabel("Klistra in CV-text", { exact: true }),
    ).toHaveValue(cv);
    await editor
      .getByRole("button", { name: "Spara CV-underlag", exact: true })
      .click();
    await expect
      .poll(() => f.documents.get(userA)!.data.jobSearch?.cvProfile?.text)
      .toBe(cv);
    const card = watch(page).getByRole("article", {
      name: "Politiskt sakkunnig · Förbundet",
      exact: true,
    });
    await card.locator(".job-cv-comparison > summary").click();
    await expect(card.locator(".job-requirement").first()).toContainText(
      "Behöver kontrolleras",
    );
    await card.locator(".job-cv-comparison").scrollIntoViewIfNeeded();
    await card
      .locator(".job-cv-comparison")
      .screenshot({ path: `test-results/job-cv-detail-${width}.png` });
    await noOverflow(page);
    await watch(page)
      .getByRole("button", { name: "CV för jobbmatchning", exact: true })
      .click();
    editor = page.getByRole("dialog", {
      name: "CV för jobbmatchning",
      exact: true,
    });
    page.once("dialog", (dialog) => dialog.accept());
    await editor
      .getByRole("button", { name: "Ta bort CV-underlaget", exact: true })
      .click();
    await expect
      .poll(() => f.documents.get(userA)!.data.jobSearch?.cvProfile)
      .toBeUndefined();
    expect(
      f.documents.get(userA)!.data.jobSearch?.weeklyPicks?.["2026-11-23"],
    ).toHaveLength(3);
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    expect(f.documents.get(userA)!.data.applications).toEqual(
      data.applications,
    );
    expect(f.errors).toEqual([]);
  });

  test(`veckans tre val sparas per vecka och ändrar inga kalenderpass ${width}`, async ({
    page,
  }) => {
    const data = applicationFlowFixture(),
      f = await setup(page, width, data);
    const list = jobList(page),
      focus = list.getByRole("region", { name: "Veckans val", exact: true });
    for (const name of [
      "Utredare · Kommunen",
      "Analytiker · Stadshuset",
      "Kommunikatör · Museet",
    ]) {
      await list
        .getByRole("article", { name, exact: true })
        .getByRole("button", { name: "Välj till veckan", exact: true })
        .click();
    }
    await expect(focus).toContainText("3 av 3 jobb valda");
    await expect(focus.getByRole("listitem")).toHaveCount(3);
    await expect(focus).toContainText("Anpassa CV");
    await list.getByRole("button", { name: /^Väntar på svar/ }).click();
    await expect(
      list
        .getByRole("article", { name: "Projektledare · Bolaget", exact: true })
        .getByRole("button", { name: "Välj till veckan", exact: true }),
    ).toBeDisabled();
    await focus
      .getByRole("button", { name: "Nästa valvecka", exact: true })
      .click();
    await expect(focus).toContainText("0 av 3 jobb valda");
    await focus
      .getByRole("button", { name: "Föregående valvecka", exact: true })
      .click();
    await expect(focus).toContainText("3 av 3 jobb valda");
    await expect
      .poll(
        () =>
          f.documents.get(userA)!.data.jobSearch?.weeklyPicks?.["2026-11-23"]
            ?.length,
      )
      .toBe(3);
    await page.reload();
    await navigateTo(page, "Jobb");
    await expect(
      jobList(page).getByRole("region", { name: "Veckans val", exact: true }),
    ).toContainText("3 av 3 jobb valda");
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    expect(f.documents.get(userA)!.data.applications).toEqual(
      data.applications,
    );
    await noOverflow(page);
    expect(f.errors).toEqual([]);
  });

  test(`återupptar rätt ansökningssteg och bevarar sökning och listposition ${width}`, async ({
    page,
  }) => {
    const data = applicationFlowFixture();
    data.applications = [
      data.applications![0],
      ...Array.from({ length: 15 }, (_, i) => ({
        ...data.applications![0],
        id: `extra-${i}`,
        role: `Utredare ${i}`,
        organization: `Kommunen ${i}`,
        nextActionId: `step-${i}`,
      })),
    ];
    const f = await setup(page, width, data);
    await jobList(page)
      .getByLabel("Sök jobb", { exact: true })
      .fill("Kommunen");
    const target = jobList(page).getByRole("article", {
      name: "Utredare 7 · Kommunen 7",
      exact: true,
    });
    await target
      .getByRole("button", { name: "Fortsätt ansökan", exact: true })
      .scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    await target
      .getByRole("button", { name: "Fortsätt ansökan", exact: true })
      .click();
    await expect(detail(page)).toContainText("Anpassa ditt CV till jobbet");
    await page.reload();
    await navigateTo(page, "Jobb");
    await expect(detail(page)).toContainText("Utredare 7 · Kommunen 7");
    await expect(
      detail(page).locator('.application-progress [aria-current="step"]'),
    ).toContainText("CV");
    await detail(page)
      .getByRole("button", { name: "Till jobblistan", exact: true })
      .click();
    await expect(
      jobList(page).getByLabel("Sök jobb", { exact: true }),
    ).toHaveValue("Kommunen");
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThan(scroll - 100);
    await jobList(page)
      .getByRole("button", { name: "Återuppta ansökan", exact: true })
      .click();
    await expect(detail(page)).toContainText("Utredare 7 · Kommunen 7");
    expect(f.writes).toHaveLength(0);
    await noOverflow(page);
    expect(f.errors).toEqual([]);
  });

  test(`bedöm senare återkommer på vald dag och ta vidare sparar utkast direkt ${width}`, async ({
    page,
  }) => {
    const data = applicationFlowFixture(),
      f = await setup(page, width, data);
    await openWatch(page);
    const first = watch(page).getByRole("article", {
      name: "Politiskt sakkunnig · Förbundet",
      exact: true,
    });
    await first
      .getByRole("button", { name: "Bedöm senare", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Bedöm jobbet senare",
      exact: true,
    });
    await dialog
      .getByLabel("Bedöm igen den", { exact: true })
      .fill("2026-11-25");
    await dialog
      .getByRole("button", { name: "Spara återkomstdatum", exact: true })
      .click();
    await expect(first).toHaveCount(0);
    await expect(watch(page)).toContainText("Bedöm senare (1)");
    await expect
      .poll(
        () => f.documents.get(userA)!.data.jobSearch?.decisions?.[0].revisitOn,
      )
      .toBe("2026-11-25");
    await page.reload();
    await navigateTo(page, "Jobb");
    await expect(first).toHaveCount(0);
    await page.clock.setFixedTime(new Date("2026-11-25T08:00:00Z"));
    await page.reload();
    await navigateTo(page, "Jobb");
    await expect(first).toContainText("Dags att bedöma igen");
    await first.getByRole("button", { name: "Ta vidare", exact: true }).click();
    await expect(detail(page)).toContainText("Politiskt sakkunnig · Förbundet");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(() => f.documents.get(userA)!.data.applications!.length)
      .toBe(data.applications!.length + 1);
    expect(f.documents.get(userA)!.data.applications!.at(-1)).toMatchObject({
      status: "draft",
      advertisement: { url: jobs[0].url, text: reviewText },
    });
    expect(f.documents.get(userA)!.data.jobSearch?.decisions).toEqual([]);
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    await noOverflow(page);
    expect(f.errors).toEqual([]);
  });

  test(`CV-utdrag bekräftas privat och ändrad CV-text återställer bedömningarna ${width}`, async ({
    page,
  }) => {
    const data = applicationFlowFixture(),
      f = await setup(page, width, data);
    await openWatch(page);
    let card = watch(page).getByRole("article", {
      name: "Politiskt sakkunnig · Förbundet",
      exact: true,
    });
    await card.getByText("Jämför krav med ditt CV", { exact: true }).click();
    await expect(card).toContainText("CV-underlag saknas");
    await card
      .getByRole("button", { name: "Lägg till CV-underlag", exact: true })
      .click();
    let editor = page.getByRole("dialog", {
      name: "CV för jobbmatchning",
      exact: true,
    });
    await editor.getByLabel("Klistra in CV-text", { exact: true }).fill(cv);
    await editor
      .getByRole("button", { name: "Spara CV-underlag", exact: true })
      .click();
    const comparison = card.locator(".job-cv-comparison");
    const firstRequirement = comparison.locator(".job-requirement").first();
    await expect(firstRequirement).toContainText("Behöver kontrolleras");
    await expect(firstRequirement.getByRole("blockquote")).toContainText(
      "Kandidatexamen i statsvetenskap",
    );
    await firstRequirement
      .getByRole("button", { name: "Bekräfta stödet", exact: true })
      .click();
    await expect(firstRequirement).toContainText("Stöd bekräftat i CV:t");
    await comparison
      .locator(".job-requirement")
      .nth(1)
      .getByRole("button", { name: "Markera att stöd saknas", exact: true })
      .click();
    await expect(card).toHaveCount(0);
    await watch(page)
      .getByRole("button", { name: /^Bortsorterade/ })
      .click();
    card = watch(page).getByRole("article", {
      name: "Politiskt sakkunnig · Förbundet",
      exact: true,
    });
    await expect(card).toContainText("ett angivet krav saknar stöd i CV:t");
    await card.locator(".job-cv-comparison > summary").click();
    await expect(card.locator(".job-requirement").first()).toContainText(
      "Stöd bekräftat i CV:t",
    );
    await expect(card.locator(".job-requirement").nth(1)).toContainText(
      "Saknar stöd i CV:t",
    );
    await expect
      .poll(
        () => f.documents.get(userA)!.data.jobSearch?.cvProfile?.checks.length,
      )
      .toBe(2);
    await page.reload();
    await navigateTo(page, "Jobb");
    await watch(page)
      .getByRole("button", { name: /^Bortsorterade/ })
      .click();
    await card.locator(".job-cv-comparison > summary").click();
    await expect(card.locator(".job-requirement").first()).toContainText(
      "Stöd bekräftat i CV:t",
    );
    await watch(page)
      .getByRole("button", { name: "CV för jobbmatchning", exact: true })
      .click();
    editor = page.getByRole("dialog", {
      name: "CV för jobbmatchning",
      exact: true,
    });
    await editor
      .getByLabel("Klistra in CV-text", { exact: true })
      .fill(cv + "\nNy erfarenhet 2026.");
    await editor
      .getByRole("button", { name: "Spara CV-underlag", exact: true })
      .click();
    await expect
      .poll(() => f.documents.get(userA)!.data.jobSearch?.cvProfile?.checks)
      .toEqual([]);
    await expect(card.locator(".job-requirement").first()).toContainText(
      "Behöver kontrolleras",
    );
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    expect(f.documents.get(userA)!.data.applications).toEqual(
      data.applications,
    );
    await page.screenshot({ path: `test-results/job-cv-${width}.png` });
    await noOverflow(page);
    expect(f.errors).toEqual([]);
  });
}

test("jobbvyns återupptagning och CV-underlag hålls isär mellan konton", async ({
  page,
}) => {
  const data = applicationFlowFixture();
  data.jobSearch = {
    cvProfile: { text: cv, updatedAt: "2026-11-23T08:00:00Z", checks: [] },
  };
  const f = await setup(page, 1440, data);
  f.documents.set(userB, row(applicationFlowFixture()));
  await jobList(page).getByLabel("Sök jobb", { exact: true }).fill("Kommunen");
  await jobList(page)
    .getByRole("article", { name: "Utredare · Kommunen", exact: true })
    .getByRole("button", { name: "Fortsätt ansökan", exact: true })
    .click();
  await logout(page);
  await login(page, "b@example.test");
  await navigateTo(page, "Jobb");
  await expect(detail(page)).toHaveCount(0);
  await expect(
    jobList(page).getByLabel("Sök jobb", { exact: true }),
  ).toHaveValue("");
  await jobList(page).getByText("Fler verktyg", { exact: true }).click();
  await jobList(page)
    .getByRole("button", { name: "CV för jobbmatchning", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "CV för jobbmatchning", exact: true })
      .getByLabel("Klistra in CV-text", { exact: true }),
  ).toHaveValue("");
  expect(f.documents.get(userB)!.data.jobSearch?.cvProfile).toBeUndefined();
  expect(f.errors).toEqual([]);
});
