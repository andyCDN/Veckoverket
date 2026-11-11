import { test, expect } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import { CV_AGENT_URL } from "../src/lib/cv-agent";
for (const mobile of [false, true]) {
  test(`CV-processen öppnas med kopierat underlag och manuell reserv ${mobile ? "mobil" : "dator"}`, async ({
    page,
    context,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const data = createData();
    data.applications = [
      {
        id: "a",
        organization: "Stadshuset",
        role: "Utredare",
        status: "draft",
        nextAction: "",
        followUpDate: "",
        deadline: "",
        notes: "Hemliga privata anteckningar",
        advertisement: {
          url: "https://example.org/annons",
          text: "Vi söker en utredare med erfarenhet av analys.",
        },
      },
    ];
    await page.addInitScript((value) => {
      localStorage.setItem("veckoverket.workspace.v1", JSON.stringify(value));
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { copied: string }).copied = text;
          },
        },
      });
    }, data);
    await context.route("https://chatgpt.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "CV-processen" }),
    );
    await page.goto("./");
    await page
      .getByRole("navigation", { name: "Huvudnavigation" })
      .getByRole("button", { name: "Jobb", exact: true })
      .click();
    const before = await page.evaluate(() =>
      localStorage.getItem("veckoverket.workspace.v1"),
    );
    await page.getByRole("button", { name: "Skapa CV för jobbet" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("textbox", { name: "Annonstext för CV", exact: true }),
    ).toHaveValue(data.applications[0].advertisement!.text);
    const prompt = dialog.getByRole("textbox", {
      name: "Underlag till CV-agenten",
    });
    await expect(prompt).toHaveValue(/Tjänst: Utredare/);
    expect(await prompt.inputValue()).not.toContain(
      "Hemliga privata anteckningar",
    );
    const popupPromise = context.waitForEvent("page");
    await dialog
      .getByRole("link", { name: "Kopiera och öppna CV-processen" })
      .click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(CV_AGENT_URL);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await expect(dialog.getByRole("status")).toContainText(
      "Underlaget är kopierat",
    );
    const copied = await page.evaluate(
      () => (window as unknown as { copied: string }).copied,
    );
    expect(copied).toContain(data.applications[0].advertisement!.text);
    expect(copied).not.toContain("Hemliga privata anteckningar");
    await popup.close();
    await page.evaluate(() =>
      Object.defineProperty(navigator.clipboard, "writeText", {
        value: async () => {
          throw new Error("blocked");
        },
      }),
    );
    await dialog
      .getByRole("button", { name: "Kopiera CV-underlag", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Kopieringen blockerades",
    );
    await dialog
      .getByRole("textbox", { name: "Annonstext för CV", exact: true })
      .fill("");
    await expect(
      dialog.getByRole("link", { name: "Kopiera och öppna CV-processen" }),
    ).toHaveCount(0);
    await expect(dialog.getByText(/Annonsen saknar sparad text/)).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Annonstext för CV", exact: true })
      .fill("Ny inklistrad annons: vi söker en analytiker.");
    await expect(prompt).toHaveValue(/Ny inklistrad annons/);
    await page.screenshot({
      path: `test-results/cv-agent-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Stäng dialog" }).click();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("veckoverket.workspace.v1"),
      ),
    ).toBe(before);
  });
}
