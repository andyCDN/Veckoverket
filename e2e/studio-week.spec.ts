import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";
import { decodeData } from "../src/lib/storage";
import type { Activity } from "../src/lib/types";

function fixture() {
  const data = createData();
  const week = "2024-10-21";
  data.goals = [
    "Sprint 4: Huvuddemo",
    "Validera prototypen",
    "Kvartalsleverans",
  ].map((title, index) => ({
    id: `g${index}`,
    title,
    week,
    categoryId: "learning",
    horizon: "week" as const,
    description: [
      "Godkända sprintmål och en tydlig leverans.",
      "Testa flödet och samla teamets återkoppling.",
      "Samla resultat och förbered nästa iteration.",
    ][index],
  }));
  data.tasks = Array.from({ length: 28 }, (_, index) => ({
    id: `t${index}`,
    title:
      [
        "Godkänn sprintmål",
        "Färdigställ prototyp",
        "Granska pull request",
        "Förbered huvuddemo",
      ][index % 4] + ` ${index + 1}`,
    goalId: `g${index % 3}`,
    done: index < 18,
    date: `2024-10-${21 + (index % 5)}`,
  }));
  const activities: Activity[] = [];
  const titles = [
    "Sprintstart & planering",
    "Designgenomgång",
    "Djupfokus & kodning",
    "Sprintleverans Q4",
    "Veckoavslut & retrospektiv",
  ];
  for (let day = 0; day < 5; day++) {
    const make = (
      title: string,
      start: number,
      end: number,
      blockType: Activity["blockType"],
    ) =>
      activities.push({
        id: `${day}-${activities.length}`,
        title,
        date: `2024-10-${21 + day}`,
        start,
        end,
        blockType,
        categoryId: "learning",
        estimatedMinutes: end - start,
        description: "",
        priority: 3,
        status: day < 3 ? "done" : "planned",
        source: "manual",
        goalId: `g${day % 3}`,
      });
    make(titles[day], 540, 570, "locked");
    make("Avstämning med teamet", 840, 870, "locked");
    if (day === 1 || day === 3)
      make("Workshop & prototyptest", 960, 990, "locked");
    make(
      day === 2 ? "Pull request & implementation" : "Fokusblock",
      600,
      720,
      "flexible",
    );
    if (day >= 2) make("Leveransarbete", 780, 900, "flexible");
  }
  activities.push({
    ...activities[0],
    id: "personal",
    categoryId: "family",
    title: "Familj & hushåll",
    date: "2024-10-26",
  });
  data.weeks = {
    [week]: { week, generatedAt: "", activities, weeklyRoutinesFrom: week },
  };
  data.deadlines = [
    {
      id: "d",
      title: "Sprintleverans Q4: Huvuddemo",
      date: "2024-10-24",
      minute: 870,
      categoryId: "learning",
      steps: [{ id: "demo", title: "Förbered demo", minutes: 30 }],
    },
    {
      id: "e",
      title: "Releasekandidat",
      date: "2024-10-25",
      minute: 960,
      categoryId: "learning",
      steps: [{ id: "release", title: "Förbered release", minutes: 30 }],
    },
  ];
  return decodeData(JSON.stringify(data));
}

for (const width of [390, 320]) {
  test(`professionell veckoöversikt med riktiga data och tre flikar vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install({ time: new Date("2024-10-24T08:00:00Z") });
    const data = fixture();
    await page.addInitScript((value) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value));
    }, data);
    await page.goto("./");
    const overview = page.getByRole("region", {
      name: "Veckoöversikt",
      exact: true,
    });
    await expect(overview).toBeVisible();
    await expect(
      overview.getByRole("heading", { name: "Veckoöversikt", exact: true }),
    ).toBeVisible();
    await expect(overview.locator(".studio-dateband")).toContainText("V.43");
    await expect(overview.locator(".studio-dateband")).toContainText(
      "18 AV 28 KLARA (64%)",
    );
    await expect(overview.locator(".studio-kpis > div").nth(0)).toContainText(
      "12",
    );
    await expect(overview.locator(".studio-kpis > div").nth(1)).toContainText(
      "16 h",
    );
    await expect(overview.locator(".studio-kpis > div").nth(3)).toContainText(
      "2",
    );
    await expect(overview).not.toContainText("Familj");
    const nav = page.getByRole("navigation", { name: "Huvudnavigation" });
    await expect(nav.getByRole("button")).toHaveCount(3);
    await expect(
      nav.getByRole("button", { name: "Vecka", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/studio-week-${width}.png`,
      fullPage: true,
    });
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    const active = overview.getByRole("article", { name: /24 oktober 2024/ });
    await active
      .getByRole("button", { name: "Ny uppgift", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Uppgift", { exact: true })
      .fill("Kontrollera leveranspaketet");
    await dialog
      .getByRole("button", { name: "Spara uppgift", exact: true })
      .click();
    await active
      .getByRole("checkbox", {
        name: "Kontrollera leveranspaketet",
        exact: true,
      })
      .check();
    await nav.getByRole("button", { name: "Uppgifter", exact: true }).click();
    await page.getByRole("button", { name: "Klara", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: /Kontrollera leveranspaketet/ }),
    ).toBeChecked();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(saved.weeks).toEqual(before.weeks);
    expect(
      saved.tasks.find(
        (task: { title: string }) =>
          task.title === "Kontrollera leveranspaketet",
      ),
    ).toMatchObject({ date: "2024-10-24", done: true });
    await nav.getByRole("button", { name: "Vecka", exact: true }).click();
    await page.reload();
    await expect(overview).toContainText("19 AV 29 KLARA");
    await expect(overview).toContainText("Kontrollera leveranspaketet");
    await overview
      .getByRole("button", { name: "Nästa vecka", exact: true })
      .click();
    await expect(overview.locator(".studio-dateband")).toContainText("V.44");
    await overview
      .getByRole("button", { name: "Föregående vecka", exact: true })
      .click();
    await expect(overview.locator(".studio-dateband")).toContainText("V.43");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await nav.getByRole("button", { name: "Idag", exact: true }).click();
    await expect(page.locator(".calendar-grid")).toBeVisible();
    await nav.getByRole("button", { name: "Vecka", exact: true }).click();
    for (const name of ["Jobb", "Nätverk"]) {
      await page.getByLabel("Profil och fler vyer", { exact: true }).click();
      await page
        .getByRole("navigation", { name: "Fler vyer" })
        .getByRole("button", { name, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole("button", { name: "Inställningar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tillgänglighet och tidsmål" }),
    ).toBeVisible();
    await page.locator(".studio-appbar a").click();
    await expect(overview).toBeVisible();
  });
}
