import { test, expect } from "@playwright/test";
import { mock, row, login, userA } from "./helpers";
import { jobWorkspaceFixture } from "../src/test/fixtures/job-workspace";
import {
  platsbankenAd,
  platsbankenUrl,
} from "../src/test/fixtures/platsbanken-ad";
import { navigateTo } from "../e2e/navigation";

const adEndpoint = "https://jobsearch.api.jobtechdev.se/ad/31722867";
for (const width of [1440, 390])
  test(`Platsbanken fyller i titel, organisation, länk och annonstext före granskning och sparning ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const original = jobWorkspaceFixture(),
      f = await mock(page, row(original));
    await page.clock.setFixedTime(new Date("2026-11-25T08:00:00Z"));
    let reads = 0;
    const serverReads: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/functions/v1/"))
        serverReads.push(request.url());
    });
    await page.route(adEndpoint, async (route) => {
      reads++;
      const headers = await route.request().allHeaders();
      expect(headers.authorization).toBeUndefined();
      expect(headers.apikey).toBeUndefined();
      expect(headers.referer).toBeUndefined();
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(platsbankenAd),
      });
    });
    await page.goto("./");
    await login(page);
    await navigateTo(page, "Jobb");
    await page
      .getByRole("button", { name: "Lägg till jobb", exact: true })
      .click();
    const capture = page.getByRole("dialog", {
      name: "Lägg till jobb",
      exact: true,
    });
    await capture
      .getByLabel("Länk eller annonstext", { exact: true })
      .fill(`${platsbankenUrl}?utm_source=linkedin#ansok`);
    await capture
      .getByRole("button", { name: "Läs uppgifter", exact: true })
      .click();
    await expect(capture.getByLabel("Tjänst", { exact: true })).toHaveValue(
      platsbankenAd.headline,
    );
    await expect(
      capture.getByLabel("Arbetsgivare", { exact: true }),
    ).toHaveValue("Naturvårdsverket");
    await expect(
      capture.getByLabel("Sista ansökningsdag (valfritt)", { exact: true }),
    ).toHaveValue("2026-12-06");
    await capture.getByText("Annons och anteckningar", { exact: true }).click();
    await expect(capture.getByLabel("Annonslänk", { exact: true })).toHaveValue(
      platsbankenUrl,
    );
    await expect(
      capture.getByRole("textbox", { name: "Annonstext", exact: true }),
    ).toHaveValue(platsbankenAd.description.text);
    expect(reads).toBe(1);
    expect(serverReads).toEqual([]);
    expect(f.writes).toHaveLength(0);
    await capture
      .getByLabel("Tjänst", { exact: true })
      .fill("Projektledare för regeringsuppdrag");
    await capture
      .getByRole("button", { name: "Spara jobb", exact: true })
      .click();
    await expect
      .poll(() => f.documents.get(userA)!.data.applications?.length)
      .toBe(5);
    const added = f.documents
      .get(userA)!
      .data.applications!.find((a) => a.organization === "Naturvårdsverket")!;
    expect(added).toMatchObject({
      role: "Projektledare för regeringsuppdrag",
      status: "draft",
      deadline: "2026-12-06",
      advertisement: {
        url: platsbankenUrl,
        text: platsbankenAd.description.text,
      },
    });
    expect(f.documents.get(userA)!.data.weeks).toEqual(original.weeks);
    await page.reload();
    await navigateTo(page, "Jobb");
    await expect(
      page.getByRole("article", {
        name: "Projektledare för regeringsuppdrag · Naturvårdsverket",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      f.documents.get(userA)!.data.applications!.find((a) => a.id === added.id)
        ?.advertisement,
    ).toEqual(added.advertisement);
    // A different tracking link must not create another copy of the same ad.
    await page
      .getByRole("button", { name: "Lägg till jobb", exact: true })
      .click();
    await capture
      .getByLabel("Länk eller annonstext", { exact: true })
      .fill(`${platsbankenUrl}/?utm_source=other`);
    await capture
      .getByRole("button", { name: "Läs uppgifter", exact: true })
      .click();
    await expect(
      capture.getByLabel("Arbetsgivare", { exact: true }),
    ).toHaveValue("Naturvårdsverket");
    const writes = f.writes.length;
    await capture
      .getByRole("button", { name: "Spara jobb", exact: true })
      .click();
    await expect(capture).toContainText(
      "Det här jobbet finns redan i din lista",
    );
    expect(f.documents.get(userA)!.data.applications).toHaveLength(5);
    expect(f.writes).toHaveLength(writes);
    expect(f.errors).toEqual([]);
  });

test("en borttagen Platsbanken-annons behåller länken och kan kompletteras manuellt", async ({
  page,
}) => {
  const f = await mock(page, row(jobWorkspaceFixture()));
  await page.clock.setFixedTime(new Date("2026-11-25T08:00:00Z"));
  await page.route(adEndpoint, (route) => route.fulfill({ status: 404 }));
  await page.goto("./");
  await login(page);
  await navigateTo(page, "Jobb");
  await page
    .getByRole("button", { name: "Lägg till jobb", exact: true })
    .click();
  const capture = page.getByRole("dialog", {
    name: "Lägg till jobb",
    exact: true,
  });
  await capture
    .getByLabel("Länk eller annonstext", { exact: true })
    .fill(platsbankenUrl);
  await capture
    .getByRole("button", { name: "Läs uppgifter", exact: true })
    .click();
  await expect(capture).toContainText(
    "Annonsen finns inte längre i Platsbanken",
  );
  expect(f.writes).toHaveLength(0);
  await capture.getByLabel("Tjänst", { exact: true }).fill("Projektledare");
  await capture
    .getByLabel("Arbetsgivare", { exact: true })
    .fill("Naturvårdsverket");
  await capture.getByText("Annons och anteckningar", { exact: true }).click();
  await expect(capture.getByLabel("Annonslänk", { exact: true })).toHaveValue(
    platsbankenUrl,
  );
  await capture
    .getByRole("textbox", { name: "Annonstext", exact: true })
    .fill("Min sparade annonstext.");
  await capture
    .getByRole("button", { name: "Spara jobb", exact: true })
    .click();
  await expect
    .poll(() => f.documents.get(userA)!.data.applications?.length)
    .toBe(5);
  expect(
    f.documents.get(userA)!.data.applications!.at(-1)?.advertisement,
  ).toEqual({ url: platsbankenUrl, text: "Min sparade annonstext." });
  expect(f.errors).toEqual([]);
});
