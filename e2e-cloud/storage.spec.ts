import { test, expect } from "@playwright/test";
import {
  userA,
  userB,
  localKey,
  week,
  plan,
  row,
  mock,
  login,
  status,
  logout,
  renameFirst,
} from "./helpers";
test("installerad molnvy visar sparningsfel även i liggande läge", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { get: () => true }),
  );
  await page.setViewportSize({ width: 844, height: 390 });
  const f = await mock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await expect(page.locator(".storage-status")).not.toBeVisible();
  const entry = page.locator(".day-shell.is-selected .calendar-entry").first();
  const id = await entry.getAttribute("data-activity-id");
  f.offline = true;
  await entry.getByRole("checkbox", { name: /^Genomförd:/ }).check();
  await status(page, "Molnet har inte bekräftat ändringarna");
  await expect(
    page.locator(".storage-status.needs-attention"),
  ).toBeInViewport();
  f.offline = false;
  await page.getByRole("button", { name: "Försök igen", exact: true }).click();
  await status(page, "Sparat i molnet");
  expect(
    f.documents.get(userA)!.data.weeks[week].activities.find((a) => a.id === id)
      ?.status,
  ).toBe("done");
  expect(f.errors).toEqual([]);
});
test("inloggning, automatisk sparning, omladdning och separata konton", async ({
  page,
}) => {
  const f = await mock(page);
  f.documents.set(userB, row(plan("Andra kontot")));
  await page.goto("./");
  await expect(page.locator(".cloud-auth")).toBeVisible();
  await expect(page.locator(".calendar-grid")).toHaveCount(0);
  await login(page);
  await status(page, "Sparat i molnet");
  expect(f.writes).toHaveLength(0);
  await renameFirst(page, "Molnsparad aktivitet");
  await status(page, "Sparat i molnet");
  expect(
    f.documents
      .get(userA)!
      .data.weeks[week].activities.some(
        (a) => a.title === "Molnsparad aktivitet",
      ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Molnsparad aktivitet" }),
  ).toBeVisible();
  await logout(page);
  await login(page, "b@example.test");
  await status(page, "Sparat i molnet");
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Molnsparad aktivitet" }),
  ).toHaveCount(0);
  expect(f.documents.get(userB)!.data.profile.name).toBe("Andra kontot");
  expect(f.writes.every((write) => write.user === userA)).toBe(true);
  expect(f.errors).toEqual([]);
});

test("lokal plan flyttas först efter valt konto och uttryckligt val", async ({
  page,
}) => {
  const local = plan("Tidigare lokal plan");
  local.weeks[week].activities[0].title = "Min sparade händelse";
  const f = await mock(page, null, local);
  await page.goto("./");
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Flytta planen till molnet" }),
  ).toBeVisible();
  expect(f.writes).toHaveLength(0);
  await page
    .getByRole("button", {
      name: "Flytta min lokala plan till molnet",
      exact: true,
    })
    .click();
  await status(page, "Sparat i molnet");
  expect(f.documents.get(userA)!.data).toEqual(local);
  expect(f.writes).toHaveLength(1);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      localKey,
    ),
  ).toEqual(local);
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Min sparade händelse" }),
  ).toBeVisible();
  await page.locator(".calendar-completion input").first().check();
  await status(page, "Sparat i molnet");
  await logout(page);
  await login(page, "b@example.test");
  await status(page, "Sparat i molnet");
  await expect(
    page.getByRole("heading", { name: "Flytta planen till molnet" }),
  ).toHaveCount(0);
  expect(f.documents.get(userB)!.data.profile.name).not.toBe(
    "Tidigare lokal plan",
  );
  expect(f.errors).toEqual([]);
});

test("offlineändringar överlever omladdning och synkas när anslutningen återkommer", async ({
  page,
}) => {
  const f = await mock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  f.offline = true;
  await renameFirst(page, "Ändring under avbrott");
  await status(page, "Molnet har inte bekräftat ändringarna");
  expect(
    f.documents
      .get(userA)!
      .data.weeks[week].activities.some(
        (a) => a.title === "Ändring under avbrott",
      ),
  ).toBe(false);
  await page.reload();
  await expect(
    page
      .locator(".calendar-block")
      .filter({ hasText: "Ändring under avbrott" }),
  ).toBeVisible();
  f.offline = false;
  await page
    .locator(".storage-status")
    .getByRole("button", { name: "Försök igen", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(
    f.documents
      .get(userA)!
      .data.weeks[week].activities.some(
        (a) => a.title === "Ändring under avbrott",
      ),
  ).toBe(true);
  expect(f.errors).toEqual([]);
});

test("versionskonflikt bevarar båda versionerna tills användaren väljer", async ({
  page,
}) => {
  const f = await mock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  const other = structuredClone(f.documents.get(userA)!.data);
  other.weeks[week].activities[0].title = "Från andra enheten";
  f.documents.set(userA, row(other, 2));
  await renameFirst(page, "Från den här enheten");
  await status(page, "Olika versioner på enheterna");
  expect(f.documents.get(userA)!.data.weeks[week].activities[0].title).toBe(
    "Från andra enheten",
  );
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Från den här enheten" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Använd molnversionen", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  await expect(
    page.locator(".calendar-block").filter({ hasText: "Från andra enheten" }),
  ).toBeVisible();
  expect(f.errors).toEqual([]);
});

test("misslyckad första hämtning skapar ingen plan och skriver inget till molnet", async ({
  page,
}) => {
  const f = await mock(page);
  f.failLoad = true;
  await page.goto("./");
  await login(page);
  await expect(
    page.getByRole("button", { name: "Försök igen", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".calendar-grid")).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
  f.failLoad = false;
  await page.getByRole("button", { name: "Försök igen", exact: true }).click();
  await status(page, "Sparat i molnet");
  expect(f.writes).toHaveLength(0);
  expect(f.errors).toEqual([]);
});

test("inloggning och molnstatus fungerar på mobil och uppfyller tillgänglighetskontrollen", async ({
  page,
}) => {
  const f = await mock(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Installera appen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "Installera Veckoverket",
  );
  await page.keyboard.press("Escape");
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const signedIn of [false, true]) {
    if (signedIn) {
      await login(page);
      await status(page, "Sparat i molnet");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.failureSummary),
      })),
    ).toEqual([]);
  }
  await page
    .locator(".storage-status-line")
    .getByRole("button", { name: "Konto & molnlagring", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(f.errors).toEqual([]);
});

test("bakgrundshämtning uppdaterar planen när ingen redigering pågår", async ({
  page,
}) => {
  const f = await mock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  const newer = structuredClone(f.documents.get(userA)!.data);
  newer.weeks[week].activities[0].title = "Uppdaterad på annan enhet";
  f.documents.set(userA, row(newer, 2));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page
      .locator(".calendar-block")
      .filter({ hasText: "Uppdaterad på annan enhet" }),
  ).toBeVisible();
  expect(f.writes).toHaveLength(0);
  expect(f.errors).toEqual([]);
});
test("ett öppet formulär skyddas mot bakgrundsändringar och kontrolleras vid sparning", async ({
  page,
}) => {
  const f = await mock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await page.locator(".calendar-block").first().click();
  await page
    .getByRole("button", { name: "Ändra tid eller pass", exact: true })
    .click();
  await page
    .getByLabel("Namn", { exact: true })
    .fill("Min pågående redigering");
  const newer = structuredClone(f.documents.get(userA)!.data);
  newer.weeks[week].activities[0].title = "Nyare molnversion";
  f.documents.set(userA, row(newer, 2));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Namn", { exact: true })).toHaveValue(
    "Min pågående redigering",
  );
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await status(page, "Olika versioner på enheterna");
  expect(f.documents.get(userA)!.data.weeks[week].activities[0].title).toBe(
    "Nyare molnversion",
  );
  await page
    .getByRole("button", { name: "Spara enhetens version", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(
    f.documents
      .get(userA)!
      .data.weeks[week].activities.some(
        (a) => a.title === "Min pågående redigering",
      ),
  ).toBe(true);
  expect(f.errors).toEqual([]);
});
