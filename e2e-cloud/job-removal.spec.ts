import { test, expect, type Page } from "@playwright/test";
import { mock, row, login, logout, userA, userB } from "./helpers";
import { jobWorkspaceFixture } from "../src/test/fixtures/job-workspace";
import { jobWatchFeed } from "../src/test/fixtures/job-watch";
import { navigateTo } from "../e2e/navigation";

async function watch(page: Page) {
  await navigateTo(page, "Jobb");
  await page.getByRole("button", { name: "Jobbspaning", exact: true }).click();
  const region = page.getByRole("region", { name: "Jobbspaning", exact: true });
  await expect(
    region.getByText("Hämtar jobb…", { exact: true }),
  ).not.toBeVisible();
  const all = region.getByRole("button", { name: /^Alla träffar/ });
  if (await all.isVisible()) await all.click();
  return region;
}
async function feed(page: Page) {
  await page.route("**/jobbspaning.json*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(jobWatchFeed),
    }),
  );
}
for (const width of [1440, 390]) {
  test(`sparat jobb kan avbrytas eller tas bort från lista och detaljvy ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = jobWorkspaceFixture(),
      f = await mock(page, row(data));
    await page.clock.setFixedTime(new Date("2026-11-26T08:00:00Z"));
    await feed(page);
    await page.goto("./");
    await login(page);
    await navigateTo(page, "Jobb");
    const job = page.getByRole("article", {
      name: "Utredare · Kommunen",
      exact: true,
    });
    page.once("dialog", (dialog) => dialog.dismiss());
    await job
      .getByRole("button", {
        name: "Ta bort jobb: Utredare · Kommunen",
        exact: true,
      })
      .click();
    await expect(job).toBeVisible();
    expect(f.writes).toHaveLength(0);
    const confirmation = page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.message()).toContain("Utredare · Kommunen");
      expect(dialog.message()).toContain(
        "kalenderpass och deadlines finns kvar",
      );
      await dialog.accept();
    });
    if (width === 390) {
      await job.getByRole("button", { name: "Utredare", exact: true }).click();
      await page
        .getByRole("region", { name: "Ansökans detaljer", exact: true })
        .getByRole("button", { name: "Ta bort jobbet", exact: true })
        .click();
    } else
      await job
        .getByRole("button", {
          name: "Ta bort jobb: Utredare · Kommunen",
          exact: true,
        })
        .click();
    await confirmation;
    await expect(job).toHaveCount(0);
    await expect
      .poll(() => f.documents.get(userA)!.data.applications?.length)
      .toBe(3);
    expect(f.documents.get(userA)!.data.applications).toEqual(
      data.applications!.slice(1),
    );
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    let results = await watch(page);
    await expect(
      results.getByRole("article", {
        name: "Utredare · Kommunen",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(results.getByRole("article")).toHaveCount(2);
    await page.reload();
    results = await watch(page);
    await expect(
      results.getByRole("article", {
        name: "Utredare · Kommunen",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(f.documents.get(userA)!.data.applications).toHaveLength(3);
    expect(f.errors).toEqual([]);
  });

  test(`jobbspaning sparar bortval med ångra och återställning ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const original = jobWorkspaceFixture(),
      f = await mock(page, row(original));
    await page.clock.setFixedTime(new Date("2026-11-26T08:00:00Z"));
    await feed(page);
    await page.goto("./");
    await login(page);
    let results = await watch(page);
    const job = results.getByRole("article", {
      name: "Projektledare · Naturvårdsverket",
      exact: true,
    });
    await expect(results.getByRole("article")).toHaveCount(2);
    await job.getByRole("button", { name: "Ointressant", exact: true }).click();
    await expect(job).toHaveCount(0);
    await expect
      .poll(() => f.documents.get(userA)!.data.dismissedJobUrls?.length)
      .toBe(1);
    await results
      .getByRole("button", { name: "Ångra bortval", exact: true })
      .click();
    await expect(job).toBeVisible();
    await job.getByRole("button", { name: "Ointressant", exact: true }).click();
    await expect
      .poll(() => f.documents.get(userA)!.data.dismissedJobUrls)
      .toEqual(["https://arbetsformedlingen.se/platsbanken/annonser/31722867"]);
    await page.reload();
    results = await watch(page);
    await expect(
      results.getByRole("article", {
        name: "Projektledare · Naturvårdsverket",
        exact: true,
      }),
    ).toHaveCount(0);
    await results
      .getByRole("button", { name: "Uppdatera", exact: true })
      .click();
    await expect(
      results.getByText("Hämtar jobb…", { exact: true }),
    ).not.toBeVisible();
    await expect(results.getByRole("article")).toHaveCount(1);
    await results
      .getByRole("button", {
        name: "Visa bortvalda jobb igen (1)",
        exact: true,
      })
      .click();
    await expect(results.getByRole("article")).toHaveCount(2);
    await expect
      .poll(() => f.documents.get(userA)!.data.dismissedJobUrls)
      .toEqual([]);
    expect(f.documents.get(userA)!.data.applications).toEqual(
      original.applications,
    );
    expect(f.documents.get(userA)!.data.weeks).toEqual(original.weeks);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(f.errors).toEqual([]);
  });
}

test("jobbspaningens bortval stannar i rätt konto", async ({ page }) => {
  const f = await mock(page, row(jobWorkspaceFixture()));
  f.documents.set(userB, row(jobWorkspaceFixture()));
  await page.clock.setFixedTime(new Date("2026-11-26T08:00:00Z"));
  await feed(page);
  await page.goto("./");
  await login(page);
  let results = await watch(page);
  await results
    .getByRole("article", {
      name: "Projektledare · Naturvårdsverket",
      exact: true,
    })
    .getByRole("button", { name: "Ointressant", exact: true })
    .click();
  await expect
    .poll(() => f.documents.get(userA)!.data.dismissedJobUrls?.length)
    .toBe(1);
  await logout(page);
  await login(page, "b@example.test");
  results = await watch(page);
  await expect(
    results.getByRole("article", {
      name: "Projektledare · Naturvårdsverket",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.documents.get(userB)!.data.dismissedJobUrls).toBeUndefined();
  await logout(page);
  await login(page);
  results = await watch(page);
  await expect(
    results.getByRole("article", {
      name: "Projektledare · Naturvårdsverket",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(f.errors).toEqual([]);
});
