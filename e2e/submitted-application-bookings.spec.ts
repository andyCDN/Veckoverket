import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
for (const mobile of [false, true]) {
  test(`inskickad KuF-ansökan återkommer inte som bokningskrav ${mobile ? "mobil" : "dator"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install({ time: new Date("2026-11-11T09:00:00Z") });
    const data = createData();
    data.goals = [];
    data.tasks = [];
    data.habits = [];
    data.contacts = [];
    data.careerActions = [];
    data.applications = [
      {
        id: "kuf",
        organization: "KuF",
        role: "Chefssekreterare",
        status: "sent",
        deadline: "2026-11-10",
        nextAction: "Invänta svar från rekryteraren",
        nextActionKind: "waiting",
        nextActionOwner: "KuF",
        followUpDate: "2026-11-11",
        notes: "Bevara min anteckning",
      },
    ];
    data.deadlines = [
      {
        id: "submission",
        applicationId: "kuf",
        title: "Chefssekreterare · KuF",
        date: "2026-11-10",
        minute: 930,
        categoryId: "career",
        steps: [
          { id: "cv", title: "Anpassa CV", minutes: 30 },
          { id: "send", title: "Skicka ansökan", minutes: 15 },
        ],
      },
    ];
    data.weeks = {
      "2026-11-09": {
        week: "2026-11-09",
        generatedAt: "",
        weeklyRoutinesFrom: "2026-11-09",
        activities: [
          {
            id: "missed",
            title: "Chefssekreterare · KuF: Anpassa CV",
            description: "Bevara missat utfall",
            applicationId: "kuf",
            deadlineId: "submission",
            deadlineStepId: "cv",
            categoryId: "career",
            date: "2026-11-10",
            start: 600,
            end: 630,
            estimatedMinutes: 30,
            status: "skipped",
            blockType: "flexible",
            source: "manual",
            priority: 3,
          },
        ],
      },
    };
    await page.addInitScript((value) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value));
    }, data);
    await page.goto("./");
    const queue = page.getByRole("region", { name: "Nästa steg", exact: true });
    await expect(queue).toBeVisible();
    await expect(queue.locator("li")).toHaveCount(1);
    await expect(queue).toContainText("Invänta svar från rekryteraren");
    await expect(
      queue.getByRole("button", { name: "Boka tid", exact: true }),
    ).toHaveCount(0);
    await page.clock.fastForward(61000);
    await expect(queue.locator("li")).toHaveCount(1);
    await page
      .getByRole("navigation", { name: "Huvudnavigation" })
      .getByRole("button", { name: "Jobb", exact: true })
      .click();
    await expect(page.locator(".career-cards > article")).toContainText(
      "Skickad",
    );
    await page
      .getByText("Dokument, intervjuer och historik", { exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Planera från deadline", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Boka intervju", exact: true }),
    ).toBeVisible();
    await page.getByText("Deadlines och planering", { exact: true }).click();
    await page.getByRole("button", { name: "Deadlines", exact: true }).click();
    await expect(
      page.getByText(/Ansökningsplaneringen är bevarad som historik/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Förhandsvisa bakåtplanering",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Boka återstående delsteg",
        exact: true,
      }),
    ).toHaveCount(0);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
    );
    expect(saved.applications).toEqual(data.applications);
    expect(saved.deadlines).toEqual(data.deadlines);
    expect(
      saved.weeks["2026-11-09"].activities.find(
        (a: { id: string }) => a.id === "missed",
      ),
    ).toEqual(data.weeks["2026-11-09"].activities[0]);
  });
}
