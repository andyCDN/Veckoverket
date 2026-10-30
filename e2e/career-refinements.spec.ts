import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import type { Activity, AppData } from "../src/lib/types";
const week = "2026-10-26",
  date = "2026-10-29",
  key = "veckoverket.workspace.v1";
const activity = (
  id: string,
  start: number,
  end: number,
  patch: Partial<Activity> = {},
): Activity => ({
  id,
  title: id,
  date,
  start,
  end,
  estimatedMinutes: end - start,
  categoryId: "career",
  description: "",
  priority: 3,
  blockType: "flexible",
  status: "planned",
  source: "manual",
  ...patch,
});
function fixture() {
  const d = createData();
  d.settings = {
    ...d.settings,
    start: 480,
    end: 1020,
    lunchStart: 720,
    lunchEnd: 780,
    familyStart: 1020,
    familyEnd: 1080,
    buffer: 10,
    musicMornings: 0,
    trainingSessions: 0,
  };
  d.weeks = {
    [week]: {
      week,
      generatedAt: "",
      weeklyRoutinesFrom: week,
      activities: [activity("Bevarat avklarat", 480, 510, { status: "done" })],
    },
  };
  d.applications = [
    {
      id: "a",
      organization: "Bolaget",
      role: "Analytiker",
      status: "sent",
      deadline: "",
      nextAction: "Skicka arbetsprov",
      followUpDate: date,
      nextActionReason: "Rekryteraren efterfrågade ett exempel",
      notes: "Befintlig anteckning",
      contactIds: ["c"],
    },
  ];
  d.contacts = [
    {
      id: "c",
      name: "Kim",
      organization: "Bolaget",
      nextAction: "Följ upp mötet",
      followUpDate: "2026-10-28",
      entries: [
        {
          id: "old",
          date: "2026-10-27",
          channel: "Telefon",
          notes: "Samtal om rollen",
        },
      ],
    },
  ];
  return d;
}
async function setup(page: Page, data = fixture()) {
  await page.clock.setFixedTime(new Date("2026-10-29T10:00:00+01:00"));
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key, data },
  );
  await page.goto("./");
  await nav(page);
}
async function nav(page: Page) {
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Jobb & nätverk", exact: true })
    .click();
}
const stored = (page: Page): Promise<AppData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);

test("gemensamma nästa steg visar försenade kontakter, bokar utan dubbelbokning och bevarar planen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const d = fixture();
  await setup(page, d);
  await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
  const queue = page.getByRole("region", { name: "Gemensamma nästa steg" });
  await expect(queue).toContainText("1 försenade uppföljningar");
  await page.getByLabel("Visa nästa steg").selectOption("overdue");
  await expect(
    queue.getByRole("heading", { name: "Följ upp mötet" }),
  ).toBeVisible();
  await expect(
    queue.getByRole("heading", { name: "Skicka arbetsprov" }),
  ).toHaveCount(0);
  await queue.getByRole("button", { name: "Markera nästa steg klart" }).click();
  expect((await stored(page)).contacts![0].entries).toHaveLength(2);
  await page.getByLabel("Visa nästa steg").selectOption("today");
  await expect(queue).toContainText("Rekryteraren efterfrågade ett exempel");
  await queue.getByRole("button", { name: "Redigera nästa steg" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ansvarig", { exact: true }).fill("Jag");
  await dialog
    .getByLabel("Varför behövs steget?")
    .fill("Överenskommet med Kim");
  await dialog
    .getByRole("button", { name: "Spara nästa steg", exact: true })
    .click();
  await queue
    .getByRole("button", { name: "Boka nästa steg", exact: true })
    .click();
  await dialog.getByLabel("Starttid", { exact: true }).fill("10:30");
  await dialog
    .getByRole("button", { name: "Spara kalenderpass", exact: true })
    .click();
  await expect(
    queue.getByRole("button", { name: "Boka nästa steg", exact: true }),
  ).toBeDisabled();
  const saved = await stored(page);
  expect(saved.applications![0].nextActionReason).toBe("Överenskommet med Kim");
  expect(saved.weeks[week].activities[0]).toEqual(d.weeks[week].activities[0]);
  expect(
    saved.weeks[week].activities.find((a) => a.careerActionId),
  ).toMatchObject({ applicationId: "a", start: 630, end: 660 });
  await page.reload();
  await nav(page);
  await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Gemensamma nästa steg" }),
  ).toContainText("Överenskommet med Kim");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "/tmp/veckoverket-next-steps-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("intervjuunderlaget samlar dokument, kontaktlogg, punkter och återkoppling", async ({
  page,
}) => {
  const d = fixture();
  d.applications![0].advertisement = {
    url: "https://example.test/job",
    text: "Analys och utredning ingår i tjänsten.",
  };
  d.applications![0].materials = [
    {
      id: "cv",
      title: "Inskickat CV",
      kind: "cv",
      url: "https://example.test/cv-v2",
      version: "2",
      sentOn: "2026-10-27",
    },
  ];
  d.applications![0].interviews = [
    {
      id: "i",
      title: "Intervju med Kim",
      date,
      start: 810,
      end: 870,
      location: "Kontoret",
      contactId: "c",
      meetingActivityId: "meeting",
      preparationNotes: "Förbered erfarenhetsexempel",
      outcomeNotes: "",
    },
  ];
  d.weeks[week].activities.push(
    activity("meeting", 810, 870, { blockType: "locked", applicationId: "a" }),
  );
  await setup(page, d);
  await page
    .getByRole("button", { name: "Öppna intervjuunderlag", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Analys och utredning ingår i tjänsten."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Inskickat CV" }),
  ).toHaveAttribute("href", "https://example.test/cv-v2");
  await dialog
    .getByText("Kontaktpersoner och tidigare anteckningar", { exact: true })
    .click();
  await expect(dialog).toContainText("Samtal om rollen");
  await dialog
    .getByRole("checkbox", { name: "Gå igenom inskickat CV och arbetsprov" })
    .check();
  await dialog
    .getByLabel("Återkoppling från arbetsgivaren")
    .fill("Skicka arbetsprov inför nästa möte");
  await dialog
    .getByLabel("Nästa steg efter intervjun", { exact: true })
    .fill("Skicka det efterfrågade arbetsprovet");
  await dialog
    .getByRole("button", { name: "Spara intervjuanteckningar", exact: true })
    .click();
  const saved = await stored(page);
  expect(saved.weeks).toEqual(d.weeks);
  expect(saved.applications![0].interviews![0].feedbackNotes).toContain(
    "Skicka arbetsprov",
  );
  await page.reload();
  await nav(page);
  await page
    .getByRole("button", { name: "Öppna intervjuunderlag", exact: true })
    .click();
  await expect(
    dialog.getByRole("checkbox", {
      name: "Gå igenom inskickat CV och arbetsprov",
    }),
  ).toBeChecked();
  await expect(
    dialog.getByLabel("Återkoppling från arbetsgivaren"),
  ).toHaveValue("Skicka arbetsprov inför nästa möte");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog
    .getByRole("button", { name: "Stäng dialog", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Veckoplanerare", exact: true })
    .click();
  await page.locator('[data-activity-id="meeting"]').click();
  await dialog
    .getByRole("button", { name: "Öppna intervjuunderlag", exact: true })
    .click();
  await expect(
    dialog.getByRole("link", { name: "Inskickat CV" }),
  ).toBeVisible();
  await dialog.screenshot({ path: "/tmp/veckoverket-interview-dossier.png" });
});

test("omplanering visar före och efter, deadlinevarningar och oplacerade pass utan att skriva något", async ({
  page,
}) => {
  const d = fixture();
  d.deadlines = [
    {
      id: "deadline",
      title: "Ansökan fredag",
      date,
      minute: 700,
      categoryId: "career",
      steps: [{ id: "s", title: "Skriv", minutes: 30 }],
    },
  ];
  d.weeks[week].activities.push(
    activity("Skriv ansökan", 900, 930, {
      priority: 1,
      deadlineId: "deadline",
      deadlineStepId: "s",
    }),
    activity("Övrigt arbete", 850, 880, { priority: 5 }),
  );
  await setup(page, d);
  await page
    .getByRole("button", { name: "Förhandsvisa dagens omplanering" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("15:00–15:30 → 2026-10-29 10:00–10:30");
  await expect(dialog).toContainText("cirka 75 %");
  expect((await stored(page)).weeks).toEqual(d.weeks);
  await dialog.getByRole("button", { name: "Använd förslaget" }).click();
  expect(
    (await stored(page)).weeks[week].activities.find(
      (a) => a.id === "Skriv ansökan",
    )!.start,
  ).toBe(600);
  const unfit = fixture();
  unfit.weeks[week].activities.push(activity("För långt pass", 1000, 1300));
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key, data: unfit },
  );
  await page.reload();
  await nav(page);
  await page
    .getByRole("button", { name: "Förhandsvisa dagens omplanering" })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Kunde inte placeras" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Använd förslaget" }),
  ).toBeDisabled();
  expect((await stored(page)).weeks).toEqual(unfit.weeks);
});
