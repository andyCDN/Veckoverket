import { test, expect, type Page } from "@playwright/test";
import { mock, row, login, userA } from "./helpers";
import { navigateTo } from "../e2e/navigation";
import { jobWorkspaceFixture } from "../src/test/fixtures/job-workspace";
import {
  sourceJob,
  sourceText,
  stockholmJob,
  statligtJob,
} from "../src/test/fixtures/job-watch-sources";
import type { JobWatchFeed } from "../src/lib/job-watch-config";

const checkedAt = "2026-11-26T08:00:00Z";
const feed: JobWatchFeed = {
  updatedAt: checkedAt,
  sources: [
    {
      id: "ideella-jobb",
      status: "ok",
      checkedAt,
      lastSuccessfulAt: checkedAt,
      count: 1,
    },
    {
      id: "stockholms-stad",
      status: "ok",
      checkedAt,
      lastSuccessfulAt: checkedAt,
      count: 1,
    },
    {
      id: "jobba-statligt",
      status: "ok",
      checkedAt,
      lastSuccessfulAt: checkedAt,
      count: 1,
    },
  ],
  jobs: [
    {
      ...sourceJob,
      text: sourceText,
      applicationUrl: "https://example.org/apply",
      additionalUrls: ["https://example.org/other-ad"],
    },
    { ...stockholmJob, text: sourceText },
    {
      ...statligtJob,
      text: sourceText,
      applicationUrl: "https://example.org/apply",
      additionalUrls: [
        "https://arbetsformedlingen.se/platsbanken/annonser/31781856",
      ],
    },
  ],
};
async function openWatch(page: Page) {
  await page.goto("./");
  await login(page);
  await navigateTo(page, "Jobb");
  await page.getByRole("button", { name: "Jobbspaning", exact: true }).click();
  const watch = page.getByRole("region", { name: "Jobbspaning", exact: true });
  await expect(
    watch.getByText("Hämtar jobb…", { exact: true }),
  ).not.toBeVisible();
  await watch.getByRole("button", { name: /^Att granska/ }).click();
  return watch;
}

for (const [width, selectedJob] of [
  [1440, sourceJob],
  [390, sourceJob],
  [1440, statligtJob],
  [390, statligtJob],
] as const) {
  test(`jobbkällan ${selectedJob.sourceId} visar fulltext och ansökningslänk genom granskning och sparning ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const original = jobWorkspaceFixture(),
      f = await mock(page, row(original));
    await page.clock.setFixedTime(new Date(checkedAt));
    await page.route("**/jobbspaning.json*", (route) =>
      route.fulfill({ json: feed }),
    );
    let externalReads = 0;
    await page.route("https://jobsearch.api.jobtechdev.se/**", (route) => {
      externalReads++;
      return route.abort();
    });
    const watch = await openWatch(page);
    await expect(watch.getByRole("article")).toHaveCount(3);
    await watch.getByText("Källor och sökurval", { exact: true }).click();
    await expect(
      watch.getByRole("link", { name: "Ideella jobb", exact: true }),
    ).toHaveAttribute("href", "https://ideellajobb.se/jobs/");
    await expect(
      watch.getByRole("link", {
        name: "Stockholms stads jobbdatabas",
        exact: true,
      }),
    ).toHaveAttribute("href", "https://jobba.stockholm/lediga-jobb/");
    await expect(
      watch.getByRole("link", { name: "Jobba statligt", exact: true }),
    ).toHaveAttribute("href", "https://www.jobbastatligt.se/sok");
    await expect(watch).toContainText(
      "Källorna kontrolleras automatiskt varje dag",
    );
    await watch
      .getByRole("article", {
        name: `${selectedJob.role} · ${selectedJob.organization}`,
        exact: true,
      })
      .getByRole("button", { name: "Ta vidare", exact: true })
      .click();
    const detail = page.getByRole("region", {
      name: "Ansökans detaljer",
      exact: true,
    });
    await expect(detail).toContainText(
      `${selectedJob.role} · ${selectedJob.organization}`,
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await detail.getByText("Läs annonsen", { exact: true }).click();
    await expect(detail.getByText(sourceText, { exact: true })).toBeVisible();
    expect(externalReads).toBe(0);
    await expect
      .poll(() => f.documents.get(userA)!.data.applications!.length)
      .toBe(original.applications!.length + 1);
    expect(
      f.documents.get(userA)!.data.applications!.at(-1)?.advertisement,
    ).toEqual({
      url: selectedJob.url,
      text: sourceText,
      applicationUrl: "https://example.org/apply",
      additionalUrls:
        selectedJob.sourceId === "jobba-statligt"
          ? ["https://arbetsformedlingen.se/platsbanken/annonser/31781856"]
          : ["https://example.org/other-ad"],
    });
    expect(f.documents.get(userA)!.data.weeks).toEqual(original.weeks);
    expect(f.documents.get(userA)!.data.settings).toEqual(original.settings);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(f.errors).toEqual([]);
  });
}

for (const mode of ["http-error", "invalid-json"]) {
  test(`reservrapport och källfel bevarar senaste annonserna vid ${mode}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    const f = await mock(page, row(jobWorkspaceFixture()));
    await page.clock.setFixedTime(new Date(checkedAt));
    const stale = structuredClone(feed);
    stale.sources![0] = {
      ...stale.sources![0],
      status: "error",
      lastSuccessfulAt: "2026-11-25T08:00:00Z",
    };
    let fallbackReads = 0;
    await page.route("**/jobbspaning.json*", (route) => {
      if (route.request().url().includes("raw.githubusercontent.com"))
        return route.fulfill({
          status: mode === "http-error" ? 503 : 200,
          contentType: "application/json",
          body: "unavailable",
        });
      fallbackReads++;
      return route.fulfill({ json: stale });
    });
    const watch = await openWatch(page);
    await expect(watch).toContainText("En annonskälla kunde inte uppdateras");
    await watch.getByText("Källor och sökurval", { exact: true }).click();
    await expect(watch).toContainText("visar senaste lyckade hämtningen från");
    await expect(watch.getByRole("article")).toHaveCount(3);
    await watch.getByRole("button", { name: "Uppdatera", exact: true }).click();
    await expect.poll(() => fallbackReads).toBe(2);
    await expect(watch.getByRole("article")).toHaveCount(3);
    expect(f.writes).toHaveLength(0);
    expect(f.errors).toEqual([]);
  });
}
