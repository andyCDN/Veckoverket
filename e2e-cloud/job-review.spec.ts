import { test, expect } from "@playwright/test";
import { mock, row, login, userA } from "./helpers";
import { navigateTo } from "../e2e/navigation";
import { jobWorkspaceFixture } from "../src/test/fixtures/job-workspace";
import { reviewJobFixture, reviewText } from "../src/test/fixtures/job-review";

for (const width of [1440, 390]) {
  test(`annonsgranskning prioriterar åtta jobb och bevarar hela urvalet med krav och bortval ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = jobWorkspaceFixture();
    data.applications![0].role = "Politiskt sakkunnig";
    const f = await mock(page, row(data));
    await page.clock.setFixedTime(new Date("2026-11-26T08:00:00Z"));
    const jobs = [
      ...Array.from({ length: 10 }, (_, i) =>
        reviewJobFixture({
          organization: `Förbund ${i + 1}`,
          url: `https://example.org/policy/${i + 1}`,
        }),
      ),
      reviewJobFixture({
        role: "Utredare",
        organization: "Fysikmyndigheten",
        url: "https://example.org/physics",
        text: reviewText.replace(
          "Du har relevant högskoleutbildning inom statsvetenskap eller motsvarande.",
          "Masterexamen inom fysik krävs.",
        ),
      }),
      reviewJobFixture({
        role: "Forskningsingenjör i kvantsäker kommunikation",
        url: "https://example.org/research",
      }),
      reviewJobFixture({
        role: "Projektledare",
        url: "https://example.org/incomplete",
        text: "",
      }),
      reviewJobFixture({
        organization: "Göteborgsförbundet",
        location: "Göteborg",
        url: "https://example.org/gothenburg",
      }),
    ];
    await page.route("**/jobbspaning.json*", (route) =>
      route.fulfill({ json: { jobs, updatedAt: "2026-11-26T08:00:00Z" } }),
    );
    await page.goto("./");
    await login(page);
    await navigateTo(page, "Jobb");
    await page
      .getByRole("button", { name: "Jobbspaning", exact: true })
      .click();
    let watch = page.getByRole("region", { name: "Jobbspaning", exact: true });
    await expect(watch).toContainText("8 jobb att börja med");
    await expect(watch).toContainText(
      "Behörigheten behöver jämföras med din utbildning och erfarenhet",
    );
    await expect(watch.getByRole("article")).toHaveCount(8);
    const first = watch.getByRole("article", {
      name: "Politiskt sakkunnig · Förbund 1",
      exact: true,
    });
    await expect(first).toContainText("Därför lyfts jobbet fram");
    await expect(first).toContainText(
      "Liknar en roll i dina aktiva ansökningar.",
    );
    await expect(first.getByRole("blockquote")).toContainText(
      "Du leder vårt påverkansarbete och tar fram remissvar.",
    );
    await first.getByText("Utvalda krav ur annonsen", { exact: true }).click();
    await expect(first).toContainText(
      "Du har relevant högskoleutbildning inom statsvetenskap eller motsvarande.",
    );
    await expect(first).toContainText("Meriterande");
    expect(f.writes).toHaveLength(0);
    await page.screenshot({ path: `test-results/job-review-${width}.png` });
    await watch.getByRole("button", { name: /^Att granska/ }).click();
    await expect(watch.getByRole("article")).toHaveCount(jobs.length - 2);
    const physics = watch.getByRole("article", {
      name: "Utredare · Fysikmyndigheten",
      exact: true,
    });
    await expect(physics).toContainText("specialistkrav behöver prövas först");
    const research = watch.getByRole("article", {
      name: "Forskningsingenjör i kvantsäker kommunikation · Förbundet",
      exact: true,
    });
    await expect(research).toHaveCount(0);
    await expect(
      watch.getByRole("article", {
        name: "Projektledare · Förbundet",
        exact: true,
      }),
    ).toContainText("Underlag saknas");
    await watch.getByRole("button", { name: /^Bortsorterade \(2\)/ }).click();
    await expect(watch.getByRole("article")).toHaveCount(2);
    await expect(research).toContainText("Automatiskt bortsorterat");
    await expect(research).toContainText("annat yrkesområde");
    await expect(watch).toContainText("Placeringen är Göteborg");
    await page.screenshot({ path: `test-results/job-excluded-${width}.png` });
    await watch
      .getByRole("button", { name: "Prioriterade", exact: true })
      .click();
    expect(f.writes).toHaveLength(0);
    await first
      .getByRole("button", { name: "Ointressant", exact: true })
      .click();
    await expect(first).toHaveCount(0);
    await expect(watch.getByRole("article")).toHaveCount(8);
    await expect
      .poll(() => f.documents.get(userA)!.data.dismissedJobUrls)
      .toEqual([jobs[0].url]);
    await page.reload();
    await navigateTo(page, "Jobb");
    await page
      .getByRole("button", { name: "Jobbspaning", exact: true })
      .click();
    watch = page.getByRole("region", { name: "Jobbspaning", exact: true });
    await expect(watch.getByRole("article")).toHaveCount(8);
    await expect(
      watch.getByRole("article", {
        name: "Politiskt sakkunnig · Förbund 1",
        exact: true,
      }),
    ).toHaveCount(0);
    await watch
      .getByRole("button", { name: /^Visa bortvalda jobb igen/ })
      .click();
    await expect(
      watch.getByRole("article", {
        name: "Politiskt sakkunnig · Förbund 1",
        exact: true,
      }),
    ).toBeVisible();
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    expect(f.documents.get(userA)!.data.applications).toEqual(
      data.applications,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(f.errors).toEqual([]);
  });
}

test("manuellt vald återkomstdag tar tillbaka ett bortsorterat jobb för bedömning", async ({
  page,
}) => {
  const data = jobWorkspaceFixture();
  const job = reviewJobFixture({
    role: "Forskningsingenjör",
    url: "https://example.org/returning",
  });
  data.jobSearch = {
    decisions: [
      {
        url: job.url,
        additionalUrls: [],
        role: job.role,
        organization: job.organization,
        deadline: job.deadline,
        kind: "later",
        revisitOn: "2026-11-26",
        decidedAt: "2026-11-25T08:00:00Z",
      },
    ],
  };
  const f = await mock(page, row(data));
  await page.clock.setFixedTime(new Date("2026-11-26T08:00:00Z"));
  await page.route("**/jobbspaning.json*", (route) =>
    route.fulfill({ json: { jobs: [job], updatedAt: "2026-11-26T08:00:00Z" } }),
  );
  await page.goto("./");
  await login(page);
  await navigateTo(page, "Jobb");
  await page.getByRole("button", { name: "Jobbspaning", exact: true }).click();
  const watch = page.getByRole("region", { name: "Jobbspaning", exact: true });
  await expect(
    watch.getByRole("article", {
      name: `${job.role} · ${job.organization}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(watch).toContainText("Dags att bedöma igen");
  await expect(
    watch.getByRole("button", { name: /^Bortsorterade/ }),
  ).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
  expect(f.documents.get(userA)!.data.applications).toEqual(data.applications);
  expect(f.errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`enbart bortsorterade jobb kan granskas och tas vidare manuellt ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = jobWorkspaceFixture();
    const job = reviewJobFixture({
      role: "Forskningsingenjör",
      url: "https://example.org/manual-choice",
    });
    const f = await mock(page, row(data));
    await page.clock.setFixedTime(new Date("2026-11-26T08:00:00Z"));
    await page.route("**/jobbspaning.json*", (route) =>
      route.fulfill({
        json: { jobs: [job], updatedAt: "2026-11-26T08:00:00Z" },
      }),
    );
    await page.goto("./");
    await login(page);
    await navigateTo(page, "Jobb");
    await page
      .getByRole("button", { name: "Jobbspaning", exact: true })
      .click();
    const watch = page.getByRole("region", {
      name: "Jobbspaning",
      exact: true,
    });
    await expect(watch).toContainText("Alla aktuella träffar är bortsorterade");
    await expect(watch.getByRole("article")).toHaveCount(0);
    await watch.getByRole("button", { name: /^Att granska \(0\)/ }).click();
    await expect(watch.getByRole("article")).toHaveCount(0);
    await watch.getByRole("button", { name: /^Bortsorterade \(1\)/ }).click();
    const card = watch.getByRole("article", {
      name: `${job.role} · ${job.organization}`,
      exact: true,
    });
    await expect(card).toContainText("Automatiskt bortsorterat");
    await expect(
      card.getByRole("link", { name: "Öppna annons", exact: true }),
    ).toHaveAttribute("href", job.url);
    expect(f.writes).toHaveLength(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card.getByRole("button", { name: "Ta vidare", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Ansökans detaljer", exact: true }),
    ).toContainText(job.role);
    await expect
      .poll(() => f.documents.get(userA)!.data.applications?.length)
      .toBe(data.applications!.length + 1);
    expect(
      f.documents.get(userA)!.data.applications!.at(-1)?.advertisement?.url,
    ).toBe(job.url);
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    expect(f.documents.get(userA)!.data.dismissedJobUrls).toEqual(
      data.dismissedJobUrls,
    );
    expect(f.errors).toEqual([]);
  });
}
