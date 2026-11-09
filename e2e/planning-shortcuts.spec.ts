import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createData } from "../src/lib/defaults";

for (const width of [1440, 390, 320])
  test(`checkar öppnar popup och dragbokning nås från veckovyn vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: new Date("2026-11-02T07:00:00Z") });
    const data = createData();
    data.settings = {
      ...data.settings,
      days: [1, 2, 3],
      start: 480,
      end: 960,
      autoPlanning: false,
    };
    data.weeks = {
      "2026-11-02": {
        week: "2026-11-02",
        generatedAt: "",
        weeklyRoutinesFrom: "2026-11-02",
        rules: data.settings,
        activities: [],
      },
    };
    await page.addInitScript((data) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(data));
    }, data);
    await page.goto("./");
    const shortcuts = page.getByRole("region", {
      name: "Planera och checka in",
    });
    await shortcuts
      .getByRole("button", { name: "Måndagscheck", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Måndagscheck");
    await dialog
      .getByLabel(/^Veckans startplan/)
      .fill("Fokus på två viktiga leveranser.");
    await dialog.getByRole("button", { name: "Klar", exact: true }).click();
    await shortcuts
      .getByRole("button", { name: "Fredagscheck", exact: true })
      .click();
    await expect(dialog).toHaveAccessibleName("Fredagscheck");
    await dialog
      .getByLabel(/^Sammanfattning av veckan/)
      .fill("Leveranserna är klara.");
    await dialog
      .getByRole("button", { name: "Stäng checken", exact: true })
      .click();
    const stored = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!),
      );
    expect((await stored()).weeks["2026-11-02"].activities).toEqual([]);
    await shortcuts
      .getByRole("button", { name: "Måndagscheck", exact: true })
      .click();
    await expect(dialog.getByLabel(/^Veckans startplan/)).toHaveValue(
      "Fokus på två viktiga leveranser.",
    );
    await dialog
      .getByRole("button", { name: "Stäng dialog", exact: true })
      .click();
    await shortcuts.getByText("Fler alternativ", { exact: true }).click();
    await shortcuts
      .getByRole("button", { name: "Dra och boka", exact: true })
      .click();
    await expect(dialog).toHaveAccessibleName("Dra och boka");
    await dialog
      .getByRole("combobox", { name: "Välj dag", exact: true })
      .selectOption("2026-11-03");
    const surface = dialog.getByRole("group", { name: "Markera tidsperiod" });
    await surface.scrollIntoViewIfNeeded();
    const box = (await surface.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = (minute: number) => box.y + ((minute - 480) / 480) * box.height;
    if (width === 390) {
      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y: y(660) }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y(705) }],
      });
      await expect(surface).toContainText("11:00–11:45");
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await page.mouse.move(x, y(660));
      await page.mouse.down();
      await page.mouse.move(x, y(705), { steps: 8 });
      await expect(surface).toContainText("11:00–11:45");
      await page.mouse.up();
    }
    dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Start", { exact: true })).toHaveValue(
      "11:00",
    );
    await expect(dialog.getByLabel("Slut", { exact: true })).toHaveValue(
      "11:45",
    );
    await dialog
      .getByLabel("Namn", { exact: true })
      .fill("Dragbokad fokusstund");
    await dialog
      .getByRole("button", { name: "Spara pass", exact: true })
      .click();
    expect((await stored()).weeks["2026-11-02"].activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Dragbokad fokusstund",
          date: "2026-11-03",
          start: 660,
          end: 705,
        }),
      ]),
    );
    await page.reload();
    await shortcuts
      .getByRole("button", { name: "Fredagscheck", exact: true })
      .click();
    await expect(page.getByLabel(/^Sammanfattning av veckan/)).toHaveValue(
      "Leveranserna är klara.",
    );
    await page
      .getByRole("button", { name: "Stäng checken", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include(".planning-shortcuts").analyze())
        .violations,
    ).toEqual([]);
  });
