import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import type { AppData } from "../src/lib/types";
const key = "veckoverket.workspace.v1",
  week = "2026-10-26";
function fixture() {
  const d = createData();
  d.weeks = {
    [week]: {
      week,
      generatedAt: "",
      weeklyRoutinesFrom: week,
      activities: [
        {
          id: "done",
          title: "Avklarat pass",
          description: "",
          date: "2026-10-29",
          start: 510,
          end: 540,
          estimatedMinutes: 30,
          categoryId: "career",
          blockType: "flexible",
          status: "done",
          source: "manual",
          priority: 3,
        },
        {
          id: "later",
          title: "Senare pass",
          description: "",
          date: "2026-10-29",
          start: 810,
          end: 840,
          estimatedMinutes: 30,
          categoryId: "career",
          blockType: "flexible",
          status: "planned",
          source: "manual",
          priority: 3,
        },
      ],
    },
  };
  return d;
}
async function setup(page: Page) {
  const data = fixture();
  await page.clock.setFixedTime(new Date("2026-10-29T10:00:00+01:00"));
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key, data },
  );
  await page.goto("./");
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Jobb & nätverk", exact: true })
    .click();
}
const stored = (page: Page): Promise<AppData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);

test("ansökan, kalenderuppföljning och bakåtplanering bevaras vid omladdning", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Ny ansökan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Organisation", { exact: true })
    .fill("Exempelbolaget");
  await dialog.getByLabel("Tjänst", { exact: true }).fill("Utvecklare");
  await dialog
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("sent");
  await dialog.getByLabel("Ansökningsdeadline").fill("2026-10-30");
  await dialog.getByLabel("Uppföljningsdatum").fill("2026-10-30");
  await dialog
    .getByLabel("Nästa steg", { exact: true })
    .fill("Kontakta rekryteraren");
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Utvecklare · Exempelbolaget" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Boka uppföljning", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Spara kalenderpass", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: /2026-10-30 09:00 · Kontakta rekryteraren/,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Planera från deadline", exact: true })
    .click();
  await dialog.getByLabel("Delstegets namn").fill("Anpassa CV");
  await dialog.getByRole("button", { name: "Lägg till delsteg" }).click();
  await dialog.getByLabel("Delstegets namn").nth(1).fill("Skicka ansökan");
  await dialog
    .getByRole("button", { name: "Spara deadline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Förhandsvisa bakåtplanering", exact: true })
    .click();
  await expect(dialog.getByText(/Anpassa CV/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Använd förslaget", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await stored(page)).weeks[week].activities.filter((a) => a.deadlineId)
          .length,
    )
    .toBe(2);
  await page.getByRole("button", { name: /Anpassa CV · Planerad$/ }).click();
  await dialog
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("done");
  await dialog
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await stored(page)).weeks[week].activities.find(
          (a) => a.deadlineStepId && a.title.includes("Anpassa CV"),
        )?.status,
    )
    .toBe("done");
  const saved = await stored(page);
  expect(saved.weeks[week].activities.find((a) => a.id === "done")).toEqual(
    fixture().weeks[week].activities[0],
  );
  await page.reload();
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Jobb & nätverk", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Utvecklare · Exempelbolaget" }),
  ).toBeVisible();
  expect((await stored(page)).deadlines).toEqual(saved.deadlines);
  await page
    .getByRole("combobox", { name: "Filtrera status" })
    .selectOption("rejected");
  await expect(
    page.getByRole("heading", { name: "Utvecklare · Exempelbolaget" }),
  ).toHaveCount(0);
});

test("kontaktlogg går att redigera på mobil utan att kalender eller planer raderas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole("button", { name: "Kontaktlogg", exact: true }).click();
  await page.getByRole("button", { name: "Ny kontakt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Namn", { exact: true }).fill("Kim Andersson");
  await dialog.getByLabel("Organisation", { exact: true }).fill("Nätverket");
  await dialog.getByLabel("Nästa steg", { exact: true }).fill("Boka samtal");
  await dialog.getByLabel("Uppföljningsdatum").fill("2026-10-30");
  await dialog
    .getByRole("button", { name: "Lägg till kontaktanteckning" })
    .click();
  await dialog.getByLabel("Kanal", { exact: true }).fill("E-post");
  await dialog
    .getByRole("textbox", { name: "Anteckning", exact: true })
    .fill("Diskuterade rollen och nästa möte.");
  await dialog
    .getByRole("button", { name: "Spara kontakt", exact: true })
    .click();
  await expect(
    page.getByText("Diskuterade rollen och nästa möte.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Boka kontakt", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Spara kalenderpass", exact: true })
    .click();
  await expect.poll(async () => (await stored(page)).contacts?.length).toBe(1);
  const before = await stored(page);
  expect(
    before.weeks[week].activities.find((a) => a.contactId)?.categoryId,
  ).toBe("networking");
  await page
    .getByRole("button", { name: "Redigera kontakt och logg", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Anteckning", exact: true })
    .fill("Samtal bokat.");
  await dialog
    .getByRole("button", { name: "Spara kontakt", exact: true })
    .click();
  await expect(page.getByText("Samtal bokat.", { exact: true })).toBeVisible();
  expect((await stored(page)).weeks).toEqual(before.weeks);
  const results = await new AxeBuilder({ page })
    .include('[aria-label="Jobb och nätverk"]')
    .analyze();
  expect(results.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("dagens förslag kräver tillämpning, bevarar avklarat och kan ångras", async ({
  page,
}) => {
  await setup(page);
  const before = await stored(page);
  await page
    .getByRole("button", { name: "Förhandsvisa dagens omplanering" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/Senare pass · 2026-10-29 10:00/),
  ).toBeVisible();
  expect((await stored(page)).weeks).toEqual(before.weeks);
  await dialog
    .getByRole("button", { name: "Använd förslaget", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await stored(page)).weeks[week].activities.find(
          (a) => a.id === "later",
        )?.start,
    )
    .toBe(600);
  expect(
    (await stored(page)).weeks[week].activities.find((a) => a.id === "done"),
  ).toEqual(before.weeks[week].activities[0]);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        (await stored(page)).weeks[week].activities.find(
          (a) => a.id === "later",
        )?.start,
    )
    .toBe(810);
});

test("ett förslag vars starttid har passerat skriver inte över planen", async ({
  page,
}) => {
  await setup(page);
  const before = await stored(page);
  await page
    .getByRole("button", { name: "Förhandsvisa dagens omplanering" })
    .click();
  await page.clock.setFixedTime(new Date("2026-10-29T11:00:00+01:00"));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Använd förslaget", exact: true })
    .click();
  await expect(
    page.getByText("Tiden har ändrats. Skapa en ny förhandsvisning.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await stored(page)).weeks).toEqual(before.weeks);
});

test("separata tidsmål justeras tillsammans och kontaktpass använder nätverkande", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Inställningar", exact: true })
    .click();
  const career = page
    .locator(".category-setting")
    .filter({ has: page.locator(".category-label", { hasText: "Jobbsök" }) });
  const networking = page.locator(".category-setting").filter({
    has: page.locator(".category-label", { hasText: "Nätverkande" }),
  });
  await expect(career.getByLabel("Timmar / vecka")).toHaveValue("3.75");
  await expect(networking.getByLabel("Timmar / vecka")).toHaveValue("1.25");
  await career.getByLabel("Timmar / vecka").fill("3");
  await expect(networking.getByLabel("Timmar / vecka")).toHaveValue("1");
  await page
    .getByRole("button", { name: "Spara och planera veckan", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await stored(page)).categories.find((c) => c.id === "career")
          ?.targetMinutes,
    )
    .toBe(180);
  expect(
    (await stored(page)).categories.find((c) => c.id === "networking")
      ?.targetMinutes,
  ).toBe(60);
  expect(
    (await stored(page)).weeks[week].activities.find((a) => a.id === "done"),
  ).toEqual(fixture().weeks[week].activities[0]);
});

test("ansökans nästa steg, historik och kontaktkoppling fungerar på mobil och sparas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const before = await stored(page);
  await page.getByRole("button", { name: "Kontaktlogg", exact: true }).click();
  await page.getByRole("button", { name: "Ny kontakt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Namn", { exact: true }).fill("Kim Rekryterare");
  await dialog
    .getByRole("button", { name: "Spara kontakt", exact: true })
    .click();
  await page.getByRole("button", { name: "Ansökningar", exact: true }).click();
  await page.getByRole("button", { name: "Ny ansökan", exact: true }).click();
  await dialog.getByLabel("Organisation", { exact: true }).fill("Bolaget");
  await dialog.getByLabel("Tjänst", { exact: true }).fill("Analytiker");
  await dialog.getByLabel("Nästa steg", { exact: true }).fill("Ring Kim");
  await dialog.getByLabel("Uppföljningsdatum").fill("2026-10-29");
  await dialog.getByRole("checkbox", { name: "Kim Rekryterare" }).check();
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Filtrera nästa steg" })
    .selectOption("today");
  await expect(
    page.getByRole("heading", { name: "Analytiker · Bolaget" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Redigera ansökan", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("interview");
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Visa historik", exact: true })
    .click();
  await expect(
    dialog.getByText("Utkast → Intervju", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Händelsetyp" })
    .selectOption("contact");
  await dialog
    .getByRole("combobox", { name: "Kontakt för händelsen" })
    .selectOption((await stored(page)).contacts![0].id);
  await dialog
    .getByRole("textbox", { name: "Händelseanteckning" })
    .fill("Intervjutid diskuterad.");
  await dialog
    .getByRole("button", { name: "Spara händelse", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Markera nästa steg klart", exact: true })
    .click();
  await expect(
    page.getByText("Inga ansökningar matchar filtren."),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Filtrera nästa steg" })
    .selectOption("all");
  await page
    .getByRole("button", { name: "Visa historik", exact: true })
    .click();
  await expect(
    dialog.getByText("Genomfört: Ring Kim · Planerat datum 2026-10-29", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Intervjutid diskuterad.", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Stäng dialog" }).click();
  await page
    .getByRole("button", { name: "Kim Rekryterare", exact: true })
    .click();
  await expect(dialog.getByLabel("Namn", { exact: true })).toHaveValue(
    "Kim Rekryterare",
  );
  await dialog.getByRole("button", { name: "Stäng dialog" }).click();
  await expect
    .poll(async () => (await stored(page)).applications?.[0].history?.length)
    .toBe(4);
  const saved = await stored(page);
  expect(saved.weeks).toEqual(before.weeks);
  await page.reload();
  expect((await stored(page)).applications).toEqual(saved.applications);
});

test("dokumentversioner och intervjuflöde sparas med kalender och historik", async ({
  page,
}) => {
  await setup(page);
  const before = await stored(page),
    dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Ny ansökan", exact: true }).click();
  await dialog.getByLabel("Organisation", { exact: true }).fill("Bolaget");
  await dialog.getByLabel("Tjänst", { exact: true }).fill("Analytiker");
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dokumentunderlag", exact: true })
    .click();
  await dialog
    .getByLabel("Annonslänk", { exact: true })
    .fill("https://example.test/job");
  await dialog
    .getByRole("textbox", { name: "Annonstext", exact: true })
    .fill("Sparad annons, även efter sista ansökningsdag.");
  await dialog
    .getByRole("button", { name: "Lägg till dokument", exact: true })
    .click();
  await dialog
    .getByLabel("Dokumentlänk", { exact: true })
    .fill("https://drive.example.test/cv-v1");
  await dialog
    .getByLabel("Version", { exact: true })
    .fill("Version 1, skickad");
  await dialog.getByLabel("Skickat datum", { exact: true }).fill("2026-10-29");
  await dialog
    .getByRole("button", { name: "Spara dokumentunderlag", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Boka intervju", exact: true })
    .click();
  await dialog.getByLabel("Intervjudatum", { exact: true }).fill("2026-10-30");
  await dialog.getByLabel("Intervjuns starttid", { exact: true }).fill("13:30");
  await dialog
    .getByLabel("Förberedelseanteckningar", { exact: true })
    .fill("Läs annonsen och förbered frågor.");
  await dialog
    .getByRole("button", {
      name: "Spara intervju och förberedelse",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Intervju: Analytiker · Bolaget" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await stored(page)).applications?.[0].interviews?.length)
    .toBe(1);
  await page
    .getByRole("button", { name: "Intervjuanteckningar", exact: true })
    .click();
  await dialog
    .getByLabel("Anteckningar efter intervjun", { exact: true })
    .fill("Avtalat att skicka referenser.");
  await dialog
    .getByLabel("Nästa steg efter intervjun", { exact: true })
    .fill("Skicka referenser");
  await dialog
    .getByLabel("Uppföljningsdatum efter intervjun", { exact: true })
    .fill("2026-11-02");
  await dialog
    .getByRole("button", { name: "Markera intervjun genomförd", exact: true })
    .click();
  const saved = await stored(page),
    i = saved.applications![0].interviews![0];
  expect(
    saved.weeks[week].activities.find((a) => a.id === i.meetingActivityId)
      ?.status,
  ).toBe("done");
  expect(
    saved.weeks[week].activities.find((a) => a.id === i.preparationActivityId)
      ?.status,
  ).toBe("planned");
  expect(saved.weeks[week].activities.find((a) => a.id === "done")).toEqual(
    before.weeks[week].activities[0],
  );
  expect(saved.applications![0].nextAction).toBe("Skicka referenser");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Jobb & nätverk", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dokumentunderlag", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Annonstext", exact: true }),
  ).toHaveValue("Sparad annons, även efter sista ansökningsdag.");
  await expect(
    dialog.getByRole("link", { name: "Öppna dokument 1" }),
  ).toHaveAttribute("href", "https://drive.example.test/cv-v1");
  expect((await stored(page)).applications).toEqual(saved.applications);
});
