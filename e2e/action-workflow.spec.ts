import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import type { Activity, AppData } from "../src/lib/types";

const key = "veckoverket.workspace.v1";
function fixture() {
  const data = createData();
  data.settings = {
    ...data.settings,
    start: 480,
    end: 1020,
    lunchStart: 720,
    lunchEnd: 780,
    familyStart: 1020,
    familyEnd: 1080,
    buffer: 0,
    musicMornings: 0,
    trainingSessions: 0,
  };
  const activity = (
    id: string,
    start: number,
    end: number,
    status: Activity["status"] = "planned",
  ): Activity => ({
    id,
    title: id,
    date: "2026-11-05",
    start,
    end,
    status,
    description: "",
    categoryId: "career",
    estimatedMinutes: end - start,
    priority: 3,
    blockType: "flexible",
    source: "manual",
  });
  data.weeks = {
    "2026-11-02": {
      week: "2026-11-02",
      generatedAt: "",
      weeklyRoutinesFrom: "2026-11-02",
      activities: [
        activity("Redan klart", 540, 570, "done"),
        activity("Pågående arbete", 570, 630),
        activity("Senare bokning", 870, 900),
      ],
    },
    "2026-11-09": {
      week: "2026-11-09",
      generatedAt: "",
      weeklyRoutinesFrom: "2026-11-09",
      activities: [],
    },
  };
  data.applications = [
    {
      id: "a",
      role: "Utredare",
      organization: "Stadshuset",
      status: "sent",
      nextAction: "Skicka arbetsprov",
      nextActionId: "a-step",
      nextActionKind: "task",
      nextActionOwner: "Jag",
      followUpDate: "2026-11-05",
      deadline: "",
      notes: "Bevara anteckningen",
    },
  ];
  data.contacts = [
    {
      id: "c",
      name: "Pat",
      organization: "Bolaget",
      nextAction: "Invänta besked från Pat",
      nextActionKind: "waiting",
      nextActionOwner: "Pat",
      followUpDate: "2026-11-05",
      entries: [],
    },
  ];
  return data;
}
async function setup(page: Page, data = fixture()) {
  await page.clock.install({ time: new Date("2026-11-05T09:00:00Z") });
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key, data },
  );
  await page.goto("./");
}
const stored = (page: Page): Promise<AppData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name, exact: true })
    .click();

for (const mobile of [false, true]) {
  test(`tom uppföljning döljs automatiskt ${mobile ? "på mobil" : "på dator"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const data = fixture();
    data.applications = [];
    data.contacts = [];
    await setup(page, data);
    await expect(
      page.getByRole("navigation", { name: "Huvudnavigation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Att följa upp" }),
    ).toHaveCount(0);
    await expect(page.locator(".week-focus")).toHaveCount(0);
  });
  test(`Vecka leder till rätt nästa steg och samma bokning från ansökan ${mobile ? "på mobil" : "på dator"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    const focus = page.getByRole("region", { name: "Att följa upp" });
    await expect(page.locator(".week-focus-next")).toHaveCount(0);
    await expect(focus).not.toContainText("Pågår nu");
    await expect(focus).toContainText("Skicka arbetsprov");
    if (mobile) {
      const followUpBox = (await focus.boundingBox())!;
      const overviewBox = (await page.locator(".studio-week").boundingBox())!;
      expect(followUpBox.y).toBeLessThan(overviewBox.y);
    }
    await page.screenshot({
      path: `test-results/action-focus-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    const before = await stored(page);
    await focus.getByRole("button", { name: /Skicka arbetsprov/ }).click();
    const queue = page.getByRole("region", {
      name: "Nästa steg för ansökningar",
    });
    await expect(
      queue.getByRole("heading", { name: "Skicka arbetsprov", exact: true }),
    ).toBeVisible();
    expect((await stored(page)).weeks).toEqual(before.weeks);
    await nav(page, "Jobb");
    const card = page.locator(".career-cards > article").filter({
      has: page.getByRole("heading", {
        name: "Utredare · Stadshuset",
        exact: true,
      }),
    });
    await card
      .getByRole("button", { name: "Boka arbetstid", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Starttid", { exact: true }).fill("11:00");
    await dialog
      .getByRole("button", { name: "Spara kalenderpass", exact: true })
      .click();
    await expect(card).toContainText("Bokat i kalendern");
    await page.screenshot({
      path: `test-results/action-booked-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await expect(
      card.getByRole("button", { name: "Boka arbetstid", exact: true }),
    ).toHaveCount(0);
    const booked = (await stored(page)).weeks["2026-11-02"].activities.filter(
      (a) => a.careerActionId === "a-step",
    );
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({
      applicationId: "a",
      start: 660,
      end: 690,
    });
    await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
    await expect(
      queue.getByRole("button", { name: "Öppna bokat pass", exact: true }),
    ).toBeVisible();
    await queue
      .getByRole("button", { name: "Öppna bokat pass", exact: true })
      .click();
    await expect(dialog.getByLabel("Namn", { exact: true })).toHaveValue(
      "Skicka arbetsprov",
    );
    await dialog
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    if (mobile)
      await page
        .getByRole("button", { name: "Visa dagplanering", exact: true })
        .click();
    await page
      .locator(`[data-activity-id="${booked[0].id}"]`)
      .getByRole("checkbox", { name: /^Genomförd:/ })
      .check();
    expect((await stored(page)).applications![0].nextAction).toBe(
      "Skicka arbetsprov",
    );
    await nav(page, "Jobb");
    await card
      .getByRole("button", { name: "Markera nästa steg klart", exact: true })
      .click();
    const completed = await stored(page);
    expect(completed.applications![0].nextAction).toBe("");
    expect(
      completed.weeks["2026-11-02"].activities.find(
        (a) => a.id === booked[0].id,
      )?.status,
    ).toBe("done");
    expect(completed.applications![0].notes).toBe("Bevara anteckningen");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("vänteläge bevakas med datum och bokas tidigast då utan automatisk kalenderändring", async ({
  page,
}) => {
  await setup(page);
  await nav(page, "Jobb");
  await page
    .getByRole("button", { name: "Redigera ansökan", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Typ av nästa steg" })
    .selectOption("waiting");
  await dialog.getByLabel("Väntar på", { exact: true }).fill("Kim");
  await dialog
    .getByLabel("Nästa steg", { exact: true })
    .fill("Svar på arbetsprovet");
  await dialog
    .getByLabel("Bevakningsdatum", { exact: true })
    .fill("2026-11-06");
  const before = await stored(page);
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  expect((await stored(page)).weeks).toEqual(before.weeks);
  await expect(page.locator(".action-control")).toContainText("Väntar på svar");
  await page
    .getByRole("button", { name: "Boka uppföljning", exact: true })
    .click();
  await expect(dialog.getByLabel("Datum", { exact: true })).toHaveAttribute(
    "min",
    "2026-11-06",
  );
  await dialog.getByLabel("Datum", { exact: true }).fill("2026-11-09");
  await dialog.getByLabel("Starttid", { exact: true }).fill("11:00");
  await dialog
    .getByRole("button", { name: "Spara kalenderpass", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Öppna bokat pass", exact: true }),
  ).toBeVisible();
  const saved = await stored(page);
  expect(
    saved.weeks["2026-11-09"].activities.filter(
      (a) => a.careerActionId === "a-step",
    ),
  ).toHaveLength(1);
  expect(saved.applications![0]).toMatchObject({
    nextActionKind: "waiting",
    nextActionOwner: "Kim",
    followUpDate: "2026-11-06",
  });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Att följa upp" }),
  ).not.toContainText("Svar på arbetsprovet");
});
