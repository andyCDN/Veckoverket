import { test, expect } from "@playwright/test";
import { STORAGE_KEY } from "../src/lib/storage";
import { startupFailureWorkspace } from "../src/test/fixtures/startup-failure";
import { initializePersonalSchedule } from "../src/lib/initialize-personal-schedule";
import { overfilledWorkspace } from "../src/test/fixtures/overfilled-week";
import AxeBuilder from "@axe-core/playwright";

for (const width of [1440, 390])
  test(`ett fel i automatisk schemauppdatering lämnar huvudsidan och importen tillgängliga vid ${width}px`, async ({
    page,
  }) => {
    const data = startupFailureWorkspace();
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date("2026-11-21T10:00:00+01:00") });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      ({ key, data }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(data));
      },
      { key: STORAGE_KEY, data },
    );
    await page.goto("./");
    const alert = page.getByRole("alert", {
      name: "Veckoplanens uppdatering stoppades",
    });
    await expect(alert).toBeVisible();
    await alert.getByText("Visa felorsak", { exact: true }).click();
    await expect(alert).toContainText(
      "Välj en giltig vecka som börjar på en måndag",
    );
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!),
        STORAGE_KEY,
      ),
    ).toEqual(data);
    await alert
      .getByRole("link", { name: "Öppna schemaimporten", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Importera veckoschema", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Veckans arbetsflöde" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!),
        STORAGE_KEY,
      ),
    ).toEqual(data);
    expect(errors).toEqual([]);
  });

test("ett oväntat startfel visar felorsak och kan hämta appen igen utan att rensa plan eller inloggning", async ({
  page,
  baseURL,
}) => {
  test.skip(
    !baseURL?.includes(":4173"),
    "Körs mot Pages-bygget; Next.js utvecklingsöverlägg fångar avsiktliga startfel.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date("2026-11-21T10:00:00+01:00") });
  const data = initializePersonalSchedule(overfilledWorkspace(), {
    date: "2026-11-21",
    minute: 600,
  });
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
      if (!sessionStorage.getItem("startup-fault-fired")) {
        sessionStorage.setItem("startup-fault-fired", "true");
        localStorage.setItem("auth-must-stay", "session-fixture");
        window.matchMedia = () => {
          throw new Error("STARTUP_TEST: webbläsarfel");
        };
      }
    },
    { key: STORAGE_KEY, data },
  );
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "Veckoverket kunde inte öppnas",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText("Visa felorsak", { exact: true }).click();
  await expect(
    page.getByText("STARTUP_TEST: webbläsarfel", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      STORAGE_KEY,
    ),
  ).toEqual(data);
  const oldCache = await page.evaluate(async () => {
    const name = `veckoverket-pwa-${encodeURIComponent(location.pathname)}-outdated`;
    await caches.open(name);
    await caches.open("separate-app-cache");
    return name;
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Hämta appen på nytt", exact: true })
    .click();
  await expect(page).toHaveURL(/\?reload=/);
  await expect(
    page.getByRole("region", { name: "Veckans arbetsflöde" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      STORAGE_KEY,
    ),
  ).toEqual(data);
  expect(
    await page.evaluate(() => localStorage.getItem("auth-must-stay")),
  ).toBe("session-fixture");
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).not.toContain(oldCache);
  expect(cacheNames).toContain("separate-app-cache");
});
