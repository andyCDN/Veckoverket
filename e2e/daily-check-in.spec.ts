import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import { navigateTo } from "./navigation";
import type { JobApplication } from "../src/lib/types";
const date = "2026-11-11",
  week = "2026-11-09";
function fixture() {
  const data = createData();
  data.goals = [
    {
      id: "g",
      title: "Veckans leverans",
      horizon: "week",
      week,
      categoryId: "career",
      description: "",
    },
  ];
  data.tasks = [
    {
      id: "t",
      goalId: "g",
      title: "Skriv första stycket",
      done: false,
      estimatedMinutes: 30,
    },
  ];
  const app = (id: string, patch: Partial<JobApplication>): JobApplication => ({
    id,
    organization: "Kommunen",
    role: "Utredare",
    status: "draft",
    deadline: date,
    nextAction: "",
    followUpDate: "",
    notes: "Bevara",
    advertisement: {
      url: "https://example.org/annons",
      text: `Annons för ${id}: erfarenhet av analys behövs.`,
    },
    ...patch,
  });
  data.applications = [
    app("later", { role: "Strateg", deadline: "2026-11-15" }),
    app("today", {}),
    app("sent", {
      organization: "KuF",
      role: "Chefssekreterare",
      status: "sent",
    }),
    app("expired", { role: "Passerad", deadline: "2026-11-10" }),
  ];
  data.contacts = [
    {
      id: "waiting",
      name: "Anna",
      organization: "Annat bolag",
      nextAction: "Invänta svar",
      nextActionKind: "waiting",
      followUpDate: "2026-11-15",
      entries: [],
    },
    {
      id: "due",
      name: "Anna",
      organization: "Kommunen",
      nextAction: "Fråga om rollen",
      followUpDate: date,
      entries: [
        {
          id: "old",
          date: "2026-11-10",
          channel: "E-post",
          notes: "Hör gärna av dig om tjänsten.",
        },
      ],
    },
  ];
  data.habits = [];
  data.deadlines = [];
  data.careerActions = [];
  data.weeks = {
    [week]: { week, generatedAt: "", activities: [], weeklyRoutinesFrom: week },
  };
  return data;
}
for (const width of [1440, 390]) {
  test(`dagens jobb, kontakter och första steg hänger ihop med originalen ${width}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 950 });
    await page.clock.install({ time: new Date("2026-11-11T07:00:00Z") });
    await page.addInitScript((value) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value));
    }, fixture());
    await page.goto("./");
    const start = page.getByRole("region", { name: "Din dagstart" });
    await start
      .getByRole("button", { name: "Dagens riktning · tre frågor" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Dagens riktning",
      exact: true,
    });
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(dialog.getByText(/Hur känns|Tungt|Mående/)).toHaveCount(0);
    const jobs = dialog.getByRole("combobox", {
      name: "1. Vilka jobb vill du söka idag?",
      exact: true,
    });
    const jobLabels = (await jobs.locator("option").allTextContents()).join(
      " ",
    );
    expect(jobLabels).not.toContain("Chefssekreterare");
    expect(jobLabels).not.toContain("Passerad");
    await expect(jobs.locator("option[value='today']")).toContainText(
      "Sista dag idag",
    );
    await jobs.selectOption("today");
    await jobs.selectOption("later");
    await expect(jobs.locator("option[value='today']")).toHaveCount(0);
    await dialog
      .getByRole("combobox", {
        name: "2. Vilka personer vill du kontakta?",
        exact: true,
      })
      .selectOption("due");
    await dialog
      .getByRole("combobox", {
        name: "2. Vilka personer vill du kontakta?",
        exact: true,
      })
      .selectOption("waiting");
    const first = dialog.getByRole("combobox", {
      name: "3. Vad börjar du med?",
      exact: true,
    });
    await expect(first.locator("option[value='contact:due']")).toHaveText(
      "Anna · Kommunen",
    );
    await expect(first.locator("option[value='contact:waiting']")).toHaveText(
      "Anna · Annat bolag",
    );
    await first.selectOption("contact:due");
    await expect(dialog.locator(".check-in-plan")).toContainText(
      "formulera en fråga",
    );
    const a11y = await new AxeBuilder({ page })
      .include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/daily-priorities-${width}.png`,
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Spara och börja här", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Nätverk", exact: true }),
    ).toBeVisible();
    const cards = page.locator(".network-overview .career-cards > article");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Anna · Kommunen");
    await expect(cards).toContainText(
      "Läs senaste noteringen och formulera en fråga",
    );
    await expect(
      cards.getByText("Hör gärna av dig om tjänsten.", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          (d) =>
            JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!)
              .dailyCheckIns?.[d]?.focus.id,
          date,
        ),
      )
      .toBe("due");
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(saved.dailyCheckIns[date].applicationIds).toEqual([
      "today",
      "later",
    ]);
    expect(saved.dailyCheckIns[date].contactIds).toEqual(["due", "waiting"]);
    expect(saved.dailyCheckIns[date]).not.toHaveProperty("mood");
    expect(saved.contacts).toEqual(fixture().contacts);
    expect(saved.applications).toEqual(fixture().applications);
    expect(saved.tasks).toEqual(fixture().tasks);
    await page
      .getByRole("button", { name: "Visa alla kontakter", exact: true })
      .click();
    await expect(cards).toHaveCount(2);
    await navigateTo(page, "Vecka");
    await expect(start).toContainText("Kontakt: Anna");
    await expect(
      start.getByRole("button", { name: "Börja här", exact: true }),
    ).toBeVisible();
    await start
      .getByRole("button", { name: "Jobb: Utredare · Kommunen", exact: true })
      .click();
    const materials = page.getByRole("dialog", {
      name: "Dokumentunderlag",
      exact: true,
    });
    await expect(materials).toContainText("Läs annonsen och välj ett krav");
    await expect(
      materials.getByRole("textbox", { name: "Annonstext", exact: true }),
    ).toHaveValue(fixture().applications![1].advertisement!.text);
    await materials.getByRole("button", { name: "Stäng dialog" }).click();
    await navigateTo(page, "Vecka");
    await page.reload();
    await expect(start.locator(".daily-recommendation h3")).toHaveText(
      "Anna · Kommunen",
    );
    // A real contact log ends the original first-step recommendation, without inventing a new task.
    await start.getByRole("button", { name: "Börja här", exact: true }).click();
    await cards
      .getByRole("button", { name: "Logga samtal/mejl", exact: true })
      .click();
    const log = page.getByRole("dialog", { name: "Logga kontakt med Anna" });
    await log.getByLabel("Kort anteckning").fill("Pratade om tjänsten idag.");
    await log
      .getByRole("button", { name: "Spara kontaktlogg", exact: true })
      .click();
    await navigateTo(page, "Vecka");
    await expect(
      start.getByRole("button", { name: "Börja här", exact: true }),
    ).toHaveCount(0);
    await expect(start).toContainText("Första steget är inte längre aktuellt");
    await start
      .getByRole("button", { name: "Ändra dagens val", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Radera dagens val", exact: true })
      .click();
    await expect(
      start.getByRole("button", {
        name: "Dagens riktning · tre frågor",
        exact: true,
      }),
    ).toBeVisible();
  });
}
test("utan jobb och kontakter går det att välja en befintlig uppgift och öppna bokningen", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-11T07:00:00Z") });
  const data = fixture();
  data.applications = [];
  data.contacts = [];
  await page.addInitScript(
    (value) =>
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value)),
    data,
  );
  await page.goto("./");
  await page
    .getByRole("button", { name: "Dagens riktning · tre frågor", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Dagens riktning",
    exact: true,
  });
  await expect(dialog).toContainText("Inga aktuella utkast");
  await dialog
    .getByRole("combobox", { name: "3. Vad börjar du med?", exact: true })
    .selectOption("task:t");
  await dialog
    .getByRole("button", { name: "Spara och börja här", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Skriv första stycket");
});
test("midnatt i Stockholm stoppar gammal dialog och öppnar en ny dagsplan utan gårdagens val", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-11T22:59:30Z") });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("veckoverket.workspace.v1"))
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value));
  }, fixture());
  await page.goto("./");
  const start = page.getByRole("region", { name: "Din dagstart" });
  await start
    .getByRole("button", { name: "Dagens riktning · tre frågor", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Dagens riktning",
    exact: true,
  });
  await page.clock.fastForward(90000);
  await dialog
    .getByRole("button", { name: "Spara dagens val", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Dagen har ändrats");
  await dialog.getByRole("button", { name: "Stäng dialog" }).click();
  await start
    .getByRole("button", { name: "Dagens riktning · tre frågor", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", {
      name: "3. Vad börjar du med?",
      exact: true,
    }),
  ).toHaveValue("none:none");
  await dialog
    .getByRole("button", { name: "Spara dagens val", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Object.keys(
          JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!)
            .dailyCheckIns ?? {},
        ),
      ),
    )
    .toEqual(["2026-11-12"]);
});
