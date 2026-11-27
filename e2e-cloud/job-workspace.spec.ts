import { test, expect } from "@playwright/test";
import { mock, row, login, userA } from "./helpers";
import { jobWorkspaceFixture } from "../src/test/fixtures/job-workspace";
import { navigateTo } from "../e2e/navigation";
for (const width of [1440, 390])
  test(`jobblänk läses, granskas och sparas i kontot innan skickat övergår till väntan ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const original = jobWorkspaceFixture(),
      f = await mock(page, row(original));
    await page.clock.setFixedTime(new Date("2026-11-23T08:00:00Z"));
    let reads = 0;
    await page.route("**/functions/v1/linkedin-job", (route) => {
      reads++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          details: {
            role: "Verksamhetsutvecklare",
            organization: "Exempel AB",
            description: "Utveckla offentliga tjänster.",
            deadline: "2026-12-01",
            location: "Stockholm",
          },
        }),
      });
    });
    await page.goto("./");
    await login(page);
    await navigateTo(page, "Jobb");
    expect(f.writes).toHaveLength(0);
    await page
      .getByRole("button", { name: "Lägg till jobb", exact: true })
      .click();
    const capture = page.getByRole("dialog", {
      name: "Lägg till jobb",
      exact: true,
    });
    await capture
      .getByLabel("Länk eller annonstext", { exact: true })
      .fill("https://www.linkedin.com/jobs/view/123456/?trk=example");
    await capture
      .getByRole("button", { name: "Läs uppgifter", exact: true })
      .click();
    await expect(
      capture.getByLabel("Arbetsgivare", { exact: true }),
    ).toHaveValue("Exempel AB");
    expect(reads).toBe(1);
    expect(f.writes).toHaveLength(0);
    await capture
      .getByRole("button", { name: "Spara jobb", exact: true })
      .click();
    const detail = page.getByRole("region", {
      name: "Ansökans detaljer",
      exact: true,
    });
    await expect(detail).toContainText("Verksamhetsutvecklare · Exempel AB");
    await expect
      .poll(() => f.documents.get(userA)!.data.applications?.length)
      .toBe(5);
    const added = f.documents
      .get(userA)!
      .data.applications!.find((a) => a.organization === "Exempel AB")!;
    expect(added.advertisement?.url).toBe(
      "https://www.linkedin.com/jobs/view/123456/",
    );
    expect(added.advertisement?.text).toContain("Utveckla offentliga tjänster");
    await detail
      .getByRole("button", { name: "Markera skickad", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Markera ansökan skickad", exact: true })
      .getByRole("button", { name: "Bekräfta skickad", exact: true })
      .click();
    await expect
      .poll(
        () =>
          f.documents
            .get(userA)!
            .data.applications?.find((a) => a.id === added.id)?.status,
      )
      .toBe("sent");
    expect(f.documents.get(userA)!.data.weeks).toEqual(original.weeks);
    await page.reload();
    await navigateTo(page, "Jobb");
    await expect(detail).toContainText("Ansökan är skickad");
    await detail
      .getByRole("button", { name: "Till jobblistan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Väntar på svar (2)", exact: true })
      .click();
    await expect(
      page.getByRole("article", {
        name: "Verksamhetsutvecklare · Exempel AB",
        exact: true,
      }),
    ).toContainText("Visa ansökan");
    expect(f.documents.get(userA)!.data.applications).toHaveLength(5);
    expect(f.errors).toEqual([]);
  });

test("blockerad annonsläsning lämnar länken kvar och erbjuder manuell komplettering utan förtidig sparning", async ({
  page,
}) => {
  const f = await mock(page, row(jobWorkspaceFixture()));
  await page.clock.setFixedTime(new Date("2026-11-23T08:00:00Z"));
  await page.route("**/functions/v1/linkedin-job", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Annonsen kunde inte läsas. Klistra in annonstexten.",
      }),
    }),
  );
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
    .fill("https://www.linkedin.com/jobs/view/555555/");
  await capture
    .getByRole("button", { name: "Läs uppgifter", exact: true })
    .click();
  await expect(capture).toContainText("Annonsen kunde inte läsas");
  await expect(capture.getByLabel("Tjänst", { exact: true })).toHaveValue("");
  await capture.getByLabel("Tjänst", { exact: true }).fill("Analytiker");
  await capture
    .getByLabel("Arbetsgivare", { exact: true })
    .fill("Reservbolaget");
  expect(f.writes).toHaveLength(0);
  await capture
    .getByRole("button", { name: "Spara jobb", exact: true })
    .click();
  await expect
    .poll(() => f.documents.get(userA)!.data.applications?.length)
    .toBe(5);
  expect(
    f.documents
      .get(userA)!
      .data.applications?.find((a) => a.organization === "Reservbolaget")
      ?.advertisement?.url,
  ).toBe("https://www.linkedin.com/jobs/view/555555/");
  expect(f.errors).toEqual([]);
});
