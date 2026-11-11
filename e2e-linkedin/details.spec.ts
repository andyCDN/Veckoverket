import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import { navigateTo } from "../e2e/navigation";
import { parseJobPage } from "../supabase/functions/_shared/linkedin-job-details";
const job = {
  "@type": "JobPosting",
  title: "Titel från LinkedIn",
  hiringOrganization: { name: "Exempel AB" },
  description: "<p>Utveckla tillgängliga tjänster.</p>",
  jobLocation: {
    address: { addressLocality: "Stockholm", addressCountry: "SE" },
  },
  employmentType: "FULL_TIME",
  datePosted: "2026-11-10",
  applicationDeadline: "2026-12-01",
  validThrough: "2026-12-15",
};
const details = parseJobPage(
  `<script type="application/ld+json">${JSON.stringify(job)}</script>`,
);
for (const width of [1440, 390]) {
  test(`länken fyller i annonsuppgifter och bevarar en egen titel ${width}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    const data = createData();
    data.applications = [];
    await page.addInitScript((data) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data));
    }, data);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    await page.route("**/functions/v1/linkedin-job", async (route) => {
      calls++;
      expect(route.request().postDataJSON().url).toBe(
        "https://www.linkedin.com/jobs/view/123456/",
      );
      await wait;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ details }),
      });
    });
    await page.goto("./");
    await navigateTo(page, "Jobb");
    await page
      .getByRole("button", { name: "Importera från LinkedIn", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Importera från LinkedIn",
    });
    await dialog
      .getByLabel("Jobblänkar – en per rad")
      .fill(
        "https://www.linkedin.com/jobs/view/123456/?trk=a\nhttps://se.linkedin.com/jobs/view/title-123456/?trk=b",
      );
    await dialog
      .getByRole("button", { name: "Granska jobben", exact: true })
      .click();
    const row = dialog.getByRole("group", { name: "Jobb 1", exact: true });
    await row.getByLabel("Tjänst", { exact: true }).fill("Min egen titel");
    release();
    await expect(row.getByLabel("Arbetsgivare", { exact: true })).toHaveValue(
      "Exempel AB",
    );
    await expect(row.getByLabel("Tjänst", { exact: true })).toHaveValue(
      "Min egen titel",
    );
    await expect(row.getByLabel("Sista ansökningsdag (valfritt)")).toHaveValue(
      "2026-12-01",
    );
    await expect(row.getByLabel("Övriga annonsuppgifter")).toHaveValue(
      /Stockholm.*\nAnställningsform: Heltid/,
    );
    expect(calls).toBe(1);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/linkedin-details-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "Importera 1 jobb", exact: true })
      .click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(saved.applications).toHaveLength(1);
    expect(saved.applications[0]).toMatchObject({
      role: "Min egen titel",
      organization: "Exempel AB",
      deadline: "2026-12-01",
    });
    expect(saved.applications[0].advertisement.text).toContain(
      "tillgängliga tjänster",
    );
    expect(saved.applications[0].notes).toContain(
      "Annons giltig till: 2026-12-15",
    );
  });
  test(`blockerad LinkedIn-sida får en tydlig reservväg via annonstext ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = createData();
    data.applications = [];
    await page.addInitScript(
      (data) =>
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data)),
      data,
    );
    await page.route("**/functions/v1/linkedin-job", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "LinkedIn blockerade läsningen. Klistra in annonstexten.",
        }),
      }),
    );
    await page.goto("./");
    await navigateTo(page, "Jobb");
    await page
      .getByRole("button", { name: "Importera från LinkedIn", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Jobblänkar – en per rad")
      .fill("https://www.linkedin.com/jobs/view/123456/");
    await dialog
      .getByRole("button", { name: "Granska jobben", exact: true })
      .click();
    await expect(dialog).toContainText("LinkedIn blockerade läsningen");
    await dialog
      .getByText("Annonsens text och reservimport", { exact: true })
      .click();
    await dialog
      .getByLabel("Annonsens text", { exact: true })
      .fill(
        "Tjänst: Designer\nArbetsgivare: Kommunen\nOrt: Göteborg\nSista ansökningsdag: 2026-12-01\nBygg bra tjänster.",
      );
    await dialog
      .getByRole("button", { name: "Läs inklistrad annons", exact: true })
      .click();
    await expect(dialog.getByLabel("Tjänst", { exact: true })).toHaveValue(
      "Designer",
    );
    await expect(
      dialog.getByLabel("Arbetsgivare", { exact: true }),
    ).toHaveValue("Kommunen");
    await dialog
      .getByRole("button", { name: "Importera 1 jobb", exact: true })
      .click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(saved.applications[0].advertisement.text).toContain(
      "Bygg bra tjänster",
    );
  });
}
