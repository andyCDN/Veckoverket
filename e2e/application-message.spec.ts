import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
for (const mobile of [false, true]) {
  test(`inklistrat besked granskas, sparas och skyddas mot dubbletter ${mobile ? "mobil" : "dator"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const data = createData();
    data.applications = [
      {
        id: "a",
        organization: "Stadshuset",
        role: "Utredare",
        status: "sent",
        nextAction: "Följ upp",
        followUpDate: "",
        deadline: "",
        notes: "Bevara",
      },
    ];
    await page.addInitScript((value) => {
      if (!localStorage.getItem("veckoverket.workspace.v1"))
        localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value));
    }, data);
    await page.goto("./");
    await page
      .getByRole("navigation", { name: "Huvudnavigation" })
      .getByRole("button", { name: "Jobb", exact: true })
      .click();
    const before = await page.evaluate(() =>
      localStorage.getItem("veckoverket.workspace.v1"),
    );
    await page
      .getByRole("button", { name: "Klistra in besked", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const text =
      "Stadshuset vill bjuda dig på intervju för tjänsten som Utredare.";
    await dialog.getByLabel("Besked från arbetsgivaren").fill(text);
    await dialog
      .getByRole("button", { name: "Tolka besked", exact: true })
      .click();
    await expect(
      dialog.getByRole("combobox", { name: "Ansökan", exact: true }),
    ).toHaveValue("a");
    await expect(dialog.getByLabel("Ny status")).toHaveValue("interview");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("veckoverket.workspace.v1"),
      ),
    ).toBe(before);
    await dialog
      .getByRole("textbox", { name: "Nästa steg", exact: true })
      .fill("Ring och bekräfta tiden");
    await dialog.getByLabel("Uppföljningsdatum").fill("2026-11-15");
    await dialog
      .getByRole("button", { name: "Godkänn och uppdatera ansökan" })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!)
              .applications[0].status,
        ),
      )
      .toBe("interview");
    const saved = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!)
          .applications[0],
    );
    expect(saved.nextAction).toBe("Ring och bekräfta tiden");
    expect(saved.notes).toBe("Bevara");
    expect(saved.history.at(-1).notes).toContain(text);
    await page
      .getByRole("button", { name: "Klistra in besked", exact: true })
      .click();
    await dialog.getByLabel("Besked från arbetsgivaren").fill(text);
    await dialog
      .getByRole("button", { name: "Tolka besked", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("redan sparat");
    await expect(
      dialog.getByRole("button", { name: "Godkänn och uppdatera ansökan" }),
    ).toBeDisabled();
    // Editing the source discards the old proposal and never saves on cancellation.
    await dialog
      .getByLabel("Besked från arbetsgivaren")
      .fill("Ett oklart besked");
    await expect(
      dialog.getByRole("button", { name: "Tolka besked", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Tolka besked", exact: true })
      .click();
    await expect(dialog.getByLabel("Ny status")).toHaveValue("");
    await expect(
      dialog.getByRole("button", { name: "Godkänn och uppdatera ansökan" }),
    ).toBeDisabled();
    await page.screenshot({
      path: `test-results/application-message-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Stäng dialog" }).click();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("veckoverket.workspace.v1")!)
            .applications[0],
      ),
    ).toEqual(saved);
  });
}
