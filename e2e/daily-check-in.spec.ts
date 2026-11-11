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
    app("undated", { role: "Analytiker", deadline: "" }),
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
  test(`dagens lista öppnar färdiga jobb- och nätverkstodos utan frågor ${width}`, async ({
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
    await expect(
      start.getByRole("button", {
        name: "Börja med Utredare · Kommunen",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      start.getByRole("button", {
        name: "Börja med Anna · Kommunen",
        exact: true,
      }),
    ).toBeVisible();
    await start
      .getByRole("button", { name: "Visa dagens att göra", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Att göra idag",
      exact: true,
    });
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(dialog).not.toContainText("Chefssekreterare");
    await expect(dialog).not.toContainText("Passerad");
    await expect(dialog).not.toContainText("Anna · Annat bolag");
    await expect(
      dialog.getByRole("region", { name: "Jobb idag" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("region", { name: "Nätverkande idag" }),
    ).toBeVisible();
    const a11y = await new AxeBuilder({ page })
      .include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/daily-todos-${width}.png`,
      fullPage: true,
    });
    // A check mark records only the small step, keeps the dialog open, and changes no application status.
    await dialog
      .getByRole("checkbox", {
        name: "Steget för Utredare · Kommunen klart",
        exact: true,
      })
      .click();
    await expect(dialog).toBeVisible();
    await dialog.locator(".daily-todos-done > summary").click();
    await expect(
      dialog.getByRole("checkbox", {
        name: "Steget för Utredare · Kommunen klart",
        exact: true,
      }),
    ).toBeChecked();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(saved.applications).toEqual(fixture().applications);
    expect(saved.contacts).toEqual(fixture().contacts);
    expect(saved.dailyCheckIns[date].completedKeys).toEqual([
      "application:today",
    ]);
    expect(saved.dailyCheckIns[date].applicationIds).toEqual([
      "today",
      "later",
    ]);
    await dialog
      .getByRole("checkbox", {
        name: "Steget för Utredare · Kommunen klart",
        exact: true,
      })
      .click();
    await dialog
      .getByRole("button", {
        name: "Börja med Utredare · Kommunen",
        exact: true,
      })
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
    // Starting directly from the inline list opens the correct contact even when names are shared.
    await start
      .getByRole("button", { name: "Börja med Anna · Kommunen", exact: true })
      .click();
    const cards = page.locator(".network-overview .career-cards > article");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Anna · Kommunen");
    await expect(
      cards.getByText("Hör gärna av dig om tjänsten.", { exact: true }),
    ).toBeVisible();
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
      start.getByRole("button", {
        name: "Börja med Anna · Kommunen",
        exact: true,
      }),
    ).toHaveCount(0);
    await start
      .getByRole("button", { name: "Visa dagens att göra", exact: true })
      .click();
    await dialog
      .getByRole("button", {
        name: "Lägg Strateg · Kommunen åt sidan idag",
        exact: true,
      })
      .click();
    await dialog.locator(".daily-todos-deferred > summary").click();
    await expect(
      dialog.getByRole("button", {
        name: "Ta tillbaka Strateg · Kommunen",
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Tillbaka till planen", exact: true })
      .click();
    await page.reload();
    await start
      .getByRole("button", { name: "Visa dagens att göra", exact: true })
      .click();
    await dialog.locator(".daily-todos-deferred > summary").click();
    await dialog
      .getByRole("button", {
        name: "Ta tillbaka Strateg · Kommunen",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Börja med Strateg · Kommunen",
        exact: true,
      }),
    ).toBeVisible();
    await dialog.locator(".daily-todos-more > summary").click();
    await dialog
      .getByRole("button", {
        name: "Lägg till Analytiker · Kommunen idag",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Börja med Analytiker · Kommunen",
        exact: true,
      }),
    ).toBeVisible();
  });
}
test("tomma register ger ingen frågeblankett och befintligt uppgiftsflöde finns kvar", async ({
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
  const start = page.getByRole("region", { name: "Din dagstart" });
  await start
    .getByRole("button", { name: "Visa dagens att göra", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Att göra idag",
    exact: true,
  });
  await expect(dialog).toContainText("Inga aktuella små steg");
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Tillbaka till planen", exact: true })
    .click();
  await start.getByRole("button", { name: "Boka tid", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Skriv första stycket");
});
test("midnatt i Stockholm stoppar avprickning i gammal dialog och börjar en ny dagslista", async ({
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
    .getByRole("button", { name: "Visa dagens att göra", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Att göra idag",
    exact: true,
  });
  await page.clock.fastForward(90000);
  await dialog
    .getByRole("checkbox", {
      name: "Steget för Strateg · Kommunen klart",
      exact: true,
    })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Dagen har ändrats");
  await dialog.getByRole("button", { name: "Stäng dialog" }).click();
  await start
    .getByRole("button", { name: "Visa dagens att göra", exact: true })
    .click();
  await dialog
    .getByRole("checkbox", {
      name: "Steget för Strateg · Kommunen klart",
      exact: true,
    })
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
