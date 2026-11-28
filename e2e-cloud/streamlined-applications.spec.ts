import { test, expect, type Page } from "@playwright/test";
import { mock, row, login, userA } from "./helpers";
import { applicationFlowFixture } from "../src/test/fixtures/application-flow";
import {
  platsbankenAd,
  platsbankenUrl,
} from "../src/test/fixtures/platsbanken-ad";
import { navigateTo } from "../e2e/navigation";
import { CV_AGENT_URL } from "../src/lib/cv-agent";
import type { AppData } from "../src/lib/types";

async function setup(page: Page, data: AppData = applicationFlowFixture()) {
  const f = await mock(page, row(data));
  await page.clock.setFixedTime(new Date("2026-11-23T08:00:00Z"));
  await page.goto("./");
  await login(page);
  return f;
}
async function openJob(page: Page) {
  await navigateTo(page, "Jobb");
  await page
    .getByRole("article", { name: "Utredare · Kommunen", exact: true })
    .getByRole("button", { name: "Fortsätt ansökan", exact: true })
    .click();
  return page.getByRole("region", { name: "Ansökans detaljer", exact: true });
}
async function sent(page: Page) {
  await page
    .getByRole("region", { name: "Ansökans detaljer", exact: true })
    .getByRole("button", { name: "Markera skickad", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Markera ansökan skickad",
    exact: true,
  });
  await expect(
    dialog.getByLabel("Bevaka igen (valfritt)", { exact: true }),
  ).toHaveValue("2026-11-30");
  await dialog
    .getByRole("button", { name: "Bekräfta skickad", exact: true })
    .click();
}
const readResponse = {
  ...platsbankenAd,
  application_details: { url: "https://example.org/ansok-projektledare" },
};
test("förfallen uppföljning öppnas igen även när verktygen har fällts ihop", async ({
  page,
}) => {
  const data = applicationFlowFixture();
  Object.assign(data.applications![0], {
    status: "sent",
    nextAction: "Invänta svar från arbetsgivaren",
    nextActionKind: "waiting",
    followUpDate: "2026-11-23",
  });
  const f = await setup(page, data);
  await navigateTo(page, "Jobb");
  await page
    .getByRole("article", { name: "Utredare · Kommunen", exact: true })
    .getByRole("button", { name: "Utredare", exact: true })
    .click();
  const detail = page.getByRole("region", {
    name: "Ansökans detaljer",
    exact: true,
  });
  const more = detail.locator(".application-details > details");
  await expect(more).not.toHaveAttribute("open", "");
  await detail
    .getByRole("button", { name: "Öppna uppföljningen", exact: true })
    .click();
  await expect(more).toHaveAttribute("open", "");
  await more.locator(":scope > summary").click();
  await detail
    .getByRole("button", { name: "Öppna uppföljningen", exact: true })
    .click();
  await expect(more).toHaveAttribute("open", "");
  expect(f.writes).toHaveLength(0);
  expect(f.errors).toEqual([]);
});
test("flerimport kan samla en LinkedIn-källa under ett jobb från en annan sajt", async ({
  page,
}) => {
  const data = applicationFlowFixture(),
    f = await setup(page, data);
  await page.route("**/functions/v1/linkedin-job", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        details: {
          role: "Utredare",
          organization: "Kommunen",
          description: "En andra källa till samma jobb.",
        },
      }),
    }),
  );
  await navigateTo(page, "Jobb");
  await page.getByText("Fler verktyg", { exact: true }).click();
  await page
    .getByRole("button", { name: "Importera flera LinkedIn-jobb", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Importera från LinkedIn",
    exact: true,
  });
  await dialog
    .getByLabel("Jobblänkar – en per rad")
    .fill("https://www.linkedin.com/jobs/view/888888/");
  await dialog
    .getByRole("button", { name: "Granska jobben", exact: true })
    .click();
  await expect(dialog).toContainText("Möjlig dubblett mellan annonskällor");
  expect(f.writes).toHaveLength(0);
  await dialog
    .getByRole("button", { name: "Samla under befintligt jobb", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Annonskällan är kopplad till Utredare · Kommunen",
  );
  await expect
    .poll(
      () =>
        f.documents.get(userA)!.data.applications![0].advertisement
          ?.additionalUrls,
    )
    .toEqual(["https://www.linkedin.com/jobs/view/888888/"]);
  expect(f.documents.get(userA)!.data.applications).toHaveLength(
    data.applications!.length,
  );
  expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
  expect(f.errors).toEqual([]);
});

test("jobbspaning använder publicerad fulltext och bevarar uppgifter när annonsläsning saknar träff", async ({
  page,
}) => {
  const data = applicationFlowFixture(),
    f = await setup(page, data);
  const jobs = [
    {
      role: "Utvecklare",
      organization: "Formbolaget",
      url: "https://example.org/published-ad",
      location: "",
      deadline: "2026-12-05",
      summary: "Kort sammanfattning",
      text: "Hela den publicerade annonsen med alla krav.",
    },
    {
      role: "Arkivarie",
      organization: "Arkivet",
      url: "https://example.org/unreadable-ad",
      location: "",
      deadline: "2026-12-06",
      summary: "Detta är bara en sammanfattning.",
    },
  ];
  let reads = 0;
  await page.route("**/jobbspaning.json*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ updatedAt: "2026-11-23T08:00:00Z", jobs }),
    }),
  );
  await page.route("https://jobsearch.api.jobtechdev.se/search?*", (route) => {
    reads++;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hits: [] }),
    });
  });
  await navigateTo(page, "Jobb");
  await page.getByRole("button", { name: "Jobbspaning", exact: true }).click();
  const watch = page.getByRole("region", { name: "Jobbspaning", exact: true });
  await watch.getByRole("button", { name: /^Att granska/ }).click();
  await watch
    .getByRole("article", { name: "Utvecklare · Formbolaget", exact: true })
    .getByRole("button", { name: "Ta vidare", exact: true })
    .click();
  const capture = page.getByRole("dialog", {
    name: "Lägg till jobb",
    exact: true,
  });
  await expect(capture.getByLabel("Tjänst", { exact: true })).toHaveValue(
    "Utvecklare",
  );
  await capture.getByText("Annons och anteckningar", { exact: true }).click();
  await expect(
    capture.getByRole("textbox", { name: "Annonstext", exact: true }),
  ).toHaveValue(jobs[0].text!);
  expect(reads).toBe(0);
  expect(f.writes).toHaveLength(0);
  await capture
    .getByRole("button", { name: "Stäng dialog", exact: true })
    .click();
  await watch
    .getByRole("article", { name: "Arkivarie · Arkivet", exact: true })
    .getByRole("button", { name: "Ta vidare", exact: true })
    .click();
  await expect(capture).toContainText("Ingen entydig annons");
  await expect(capture.getByLabel("Tjänst", { exact: true })).toHaveValue(
    "Arkivarie",
  );
  await expect(capture.getByLabel("Arbetsgivare", { exact: true })).toHaveValue(
    "Arkivet",
  );
  await capture.getByText("Annons och anteckningar", { exact: true }).click();
  await expect(
    capture.getByRole("textbox", { name: "Annonstext", exact: true }),
  ).toHaveValue("");
  expect(f.writes).toHaveLength(0);
  await capture
    .getByRole("textbox", { name: "Annonstext", exact: true })
    .fill("Min inklistrade fullständiga annons.");
  await capture
    .getByRole("button", { name: "Spara jobb", exact: true })
    .click();
  await expect
    .poll(() => f.documents.get(userA)!.data.applications!.length)
    .toBe(data.applications!.length + 1);
  expect(
    f.documents.get(userA)!.data.applications!.at(-1)?.advertisement,
  ).toMatchObject({
    url: jobs[1].url,
    text: "Min inklistrade fullständiga annons.",
  });
  expect(f.errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`sammanhållen ansökan behåller jobbet när CV-agent och ansökningssida öppnas ${width}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await context.route("https://chatgpt.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "CV-agent" }),
    );
    await context.route("https://example.org/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "Arbetsgivarens ansökan",
      }),
    );
    const data = applicationFlowFixture();
    data.applications![0].advertisement!.applicationUrl =
      "https://example.org/ansok-utredare";
    data.applications![0].notes =
      "Privat anteckning som inte hör till CV-underlaget";
    const f = await setup(page, data),
      detail = await openJob(page);
    const work = detail.getByRole("region", {
      name: "Ansökans arbetsläge",
      exact: true,
    });
    await expect(work).toBeVisible();
    await work.getByText("Visa CV-underlag", { exact: true }).click();
    const prompt = work.getByRole("textbox", {
      name: "Underlag till CV-agenten",
      exact: true,
    });
    await expect(prompt).toHaveValue(/Tjänst: Utredare/);
    expect(await prompt.inputValue()).not.toContain("Privat anteckning");
    const cvPopup = page.waitForEvent("popup");
    await work.getByRole("link", { name: "Anpassa CV ↗", exact: true }).click();
    const agent = await cvPopup;
    await expect(agent).toHaveURL(CV_AGENT_URL);
    await agent.close();
    await expect(detail).toContainText("Utredare · Kommunen");
    expect(f.writes).toHaveLength(0);
    await work
      .getByLabel("CV-länk (valfritt)", { exact: true })
      .fill("https://example.org/cv-v2");
    await work
      .getByRole("button", { name: "CV klart – gå vidare", exact: true })
      .click();
    await expect
      .poll(
        () =>
          f.documents.get(userA)!.data.applications![0].preparation?.cvReadyAt,
      )
      .toBeTruthy();
    const applicationPopup = page.waitForEvent("popup");
    await work
      .getByRole("link", { name: "Öppna ansökningssidan ↗", exact: true })
      .click();
    const portal = await applicationPopup;
    await expect(portal).toHaveURL("https://example.org/ansok-utredare");
    await portal.close();
    await expect
      .poll(
        () =>
          f.documents.get(userA)!.data.applications![0].preparation
            ?.applicationOpenedAt,
      )
      .toBeTruthy();
    expect(f.documents.get(userA)!.data.applications![0].status).toBe("draft");
    await page.screenshot({
      path: `test-results/application-work-${width}.png`,
      fullPage: true,
    });
    await sent(page);
    await expect
      .poll(() => f.documents.get(userA)!.data.applications![0].status)
      .toBe("sent");
    const saved = f.documents.get(userA)!.data.applications![0];
    expect(saved.followUpDate).toBe("2026-11-30");
    expect(
      saved.materials?.some(
        (material) => material.url === "https://example.org/cv-v2",
      ),
    ).toBe(true);
    expect(saved.notes).toBe(data.applications![0].notes);
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    await detail
      .getByRole("button", { name: "Ändra uppföljning", exact: true })
      .click();
    const followUp = page.getByRole("dialog", {
      name: "Ändra uppföljning",
      exact: true,
    });
    await followUp
      .getByLabel("Bevaka igen (valfritt)", { exact: true })
      .fill("2026-12-02");
    await followUp
      .getByRole("button", { name: "Spara bevakning", exact: true })
      .click();
    await expect
      .poll(() => f.documents.get(userA)!.data.applications![0].followUpDate)
      .toBe("2026-12-02");
    await page.reload();
    await navigateTo(page, "Jobb");
    await page
      .getByRole("region", { name: "Ansökans detaljer", exact: true })
      .getByRole("button", { name: "Till jobblistan", exact: true })
      .click();
    await page.getByRole("button", { name: /^Väntar på svar/ }).click();
    await expect(
      page.getByRole("article", { name: "Utredare · Kommunen", exact: true }),
    ).toBeVisible();
    expect(f.errors).toEqual([]);
  });

  test(`jobbspaning granskar hela annonsen och samlar dubbletter mellan källor ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = applicationFlowFixture(),
      f = await setup(page, data);
    const source =
      "https://www.naturvardsverket.se/om-oss/jobba-hos-oss/lediga-jobb/projektledare-for-regeringsuppdrag-till-naturvardsverket/";
    let feedJobs = [
      {
        role: "Projektledare för regeringsuppdrag",
        organization: "Naturvårdsverket",
        url: source,
        location: "Stockholm",
        deadline: "2026-12-06",
        summary: "Ett nytt regeringsuppdrag.",
      },
    ];
    await page.route("**/jobbspaning.json*", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          updatedAt: "2026-11-23T08:00:00Z",
          jobs: feedJobs,
        }),
      }),
    );
    await page.route("https://jobsearch.api.jobtechdev.se/search?*", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ hits: [readResponse] }),
      }),
    );
    await navigateTo(page, "Jobb");
    await page
      .getByRole("button", { name: "Jobbspaning", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Jobbspaning", exact: true })
      .getByRole("button", { name: /^Att granska/ })
      .click();
    await page
      .getByRole("region", { name: "Jobbspaning", exact: true })
      .getByRole("button", { name: "Ta vidare", exact: true })
      .click();
    const capture = page.getByRole("dialog", {
      name: "Lägg till jobb",
      exact: true,
    });
    await expect(capture.getByLabel("Tjänst", { exact: true })).toHaveValue(
      platsbankenAd.headline,
    );
    await capture.getByText("Annons och anteckningar", { exact: true }).click();
    await expect(capture.getByLabel("Annonslänk", { exact: true })).toHaveValue(
      source,
    );
    await expect(
      capture.getByRole("textbox", { name: "Annonstext", exact: true }),
    ).toHaveValue(platsbankenAd.description.text);
    expect(f.writes).toHaveLength(0);
    await capture
      .getByRole("button", { name: "Spara jobb", exact: true })
      .click();
    await expect
      .poll(() => f.documents.get(userA)!.data.applications!.length)
      .toBe(data.applications!.length + 1);
    const added = f.documents.get(userA)!.data.applications!.at(-1)!;
    expect(added.advertisement?.additionalUrls).toEqual([platsbankenUrl]);
    expect(added.advertisement?.applicationUrl).toBe(
      "https://example.org/ansok-projektledare",
    );
    const detail = page.getByRole("region", {
      name: "Ansökans detaljer",
      exact: true,
    });
    await detail
      .getByLabel("CV-länk (valfritt)", { exact: true })
      .fill("https://example.org/projekt-cv");
    await detail
      .getByRole("button", { name: "CV klart – gå vidare", exact: true })
      .click();
    await sent(page);
    await expect
      .poll(
        () =>
          f.documents
            .get(userA)!
            .data.applications!.find((job) => job.id === added.id)?.status,
      )
      .toBe("sent");
    const before = structuredClone(
      f.documents
        .get(userA)!
        .data.applications!.find((job) => job.id === added.id)!,
    );
    await detail
      .getByRole("button", { name: "Till jobblistan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Lägg till jobb", exact: true })
      .click();
    await page.route("**/functions/v1/linkedin-job", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          details: {
            role: platsbankenAd.headline,
            organization: "Naturvårdsverket",
            description: "Ny källa med annan text.",
          },
        }),
      }),
    );
    await capture
      .getByLabel("Länk eller annonstext", { exact: true })
      .fill("https://www.linkedin.com/jobs/view/987654/?trk=feed");
    await capture
      .getByRole("button", { name: "Läs uppgifter", exact: true })
      .click();
    const duplicate = capture.getByRole("region", {
      name: "Möjliga dubbletter",
      exact: true,
    });
    await expect(duplicate).toContainText(
      "Möjlig dubblett mellan annonskällor",
    );
    await expect(duplicate).toContainText("Status: Skickad");
    await duplicate
      .getByRole("button", { name: "Samla under befintligt jobb", exact: true })
      .click();
    await expect
      .poll(
        () =>
          f.documents
            .get(userA)!
            .data.applications!.find((job) => job.id === added.id)
            ?.advertisement?.additionalUrls?.length,
      )
      .toBe(2);
    const merged = f.documents
      .get(userA)!
      .data.applications!.find((job) => job.id === added.id)!;
    expect(f.documents.get(userA)!.data.applications).toHaveLength(
      data.applications!.length + 1,
    );
    expect(merged.status).toBe("sent");
    expect(merged.materials).toEqual(before.materials);
    expect(merged.advertisement?.text).toBe(before.advertisement?.text);
    expect(merged.history!.slice(0, -1)).toEqual(before.history);
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    feedJobs.push({
      ...feedJobs[0],
      url: "https://www.linkedin.com/jobs/view/987654/?trk=new",
    });
    await detail
      .getByRole("button", { name: "Till jobblistan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Jobbspaning", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Jobbspaning", exact: true })
        .getByRole("article"),
    ).toHaveCount(0);
    expect(f.errors).toEqual([]);
  });

  test(`befintliga jobbsökarpass får en ordnad arbetskö utan nya tider ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = applicationFlowFixture(),
      f = await setup(page, data);
    if (width === 390) {
      const detail = await openJob(page);
      await detail
        .getByRole("button", {
          name: "Välj befintligt jobbsökarpass",
          exact: true,
        })
        .click();
    } else
      await page
        .getByRole("region", { name: "Dagens jobbsökarpass", exact: true })
        .getByRole("button", { name: "Välj jobb för passet", exact: true })
        .click();
    const picker = page.getByRole("dialog", {
      name: "Jobb för jobbsökarpasset",
      exact: true,
    });
    const first = picker.getByRole("checkbox", { name: /Utredare · Kommunen/ });
    if (!(await first.isChecked())) await first.check();
    await picker
      .getByRole("checkbox", { name: /Kommunikatör · Museet/ })
      .check();
    await picker
      .getByRole("button", { name: "Spara jobb för passet", exact: true })
      .click();
    await expect
      .poll(
        () =>
          f.documents.get(userA)!.data.weeks["2026-11-23"].activities[0]
            .jobApplicationIds,
      )
      .toEqual(["draft", "second"]);
    const stored =
      f.documents.get(userA)!.data.weeks["2026-11-23"].activities[0];
    const { jobApplicationIds, ...unchanged } = stored;
    expect(unchanged).toEqual(data.weeks["2026-11-23"].activities[0]);
    expect(Object.keys(f.documents.get(userA)!.data.weeks)).toEqual(
      Object.keys(data.weeks),
    );
    expect(f.documents.get(userA)!.data.settings).toEqual(data.settings);
    await navigateTo(page, "Vecka");
    await page
      .getByRole("region", { name: "Dagens jobbsökarpass", exact: true })
      .getByRole("button", { name: "Börja jobbsökarpasset", exact: true })
      .click();
    let context = page.getByRole("region", {
      name: "Pågående jobbsökarpass",
      exact: true,
    });
    await expect(context).toContainText("Jobb 1 av 2");
    await sent(page);
    await context
      .getByRole("button", { name: "Fortsätt med nästa jobb", exact: true })
      .click();
    context = page.getByRole("region", {
      name: "Pågående jobbsökarpass",
      exact: true,
    });
    await expect(context).toContainText("Jobb 2 av 2");
    await expect(
      page.getByRole("region", { name: "Ansökans detaljer", exact: true }),
    ).toContainText("Kommunikatör · Museet");
    await sent(page);
    await expect(context).toContainText("Passets valda jobb är hanterade");
    await navigateTo(page, "Vecka");
    await expect(
      page.getByRole("region", { name: "Dagens jobbsökarpass", exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(
        () =>
          f.documents
            .get(userA)!
            .data.applications!.find((job) => job.id === "second")?.status,
      )
      .toBe("sent");
    expect(
      f.documents.get(userA)!.data.weeks["2026-11-23"].activities,
    ).toHaveLength(1);
    expect(
      f.documents.get(userA)!.data.weeks["2026-11-23"].activities[0].start,
    ).toBe(540);
    expect(
      f.documents.get(userA)!.data.weeks["2026-11-23"].activities[0].end,
    ).toBe(630);
    expect(
      f.documents.get(userA)!.data.weeks["2026-11-23"].activities[0].status,
    ).toBe("planned");
    expect(f.errors).toEqual([]);
  });
}

test("en annan rekrytering med samma titel kan sparas separat efter granskning", async ({
  page,
}) => {
  const data = applicationFlowFixture(),
    f = await setup(page, data);
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
    .fill(
      "https://example.org/a-different-recruitment\nTjänst: Utredare\nArbetsgivare: Kommunen\nEn annan rekrytering.",
    );
  await capture
    .getByRole("button", { name: "Läs uppgifter", exact: true })
    .click();
  await capture
    .getByRole("button", { name: "Spara jobb", exact: true })
    .click();
  await expect(capture.getByRole("alert")).toContainText(
    "bekräfta att detta är en annan tjänst",
  );
  expect(f.writes).toHaveLength(0);
  await capture
    .getByRole("checkbox", {
      name: "Det är en annan tjänst – spara separat",
      exact: true,
    })
    .check();
  await capture
    .getByRole("button", { name: "Spara jobb", exact: true })
    .click();
  await expect
    .poll(() => f.documents.get(userA)!.data.applications!.length)
    .toBe(data.applications!.length + 1);
  expect(f.documents.get(userA)!.data.applications![0]).toEqual(
    data.applications![0],
  );
});
