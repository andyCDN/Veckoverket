import { test, expect, type Page } from "@playwright/test";
import { mock, login, status, userA, week } from "./helpers";
import {
  icalHandler,
  type SavedFeed,
} from "../supabase/functions/_shared/ical-handler";
import { parseFeedWeek } from "../supabase/functions/_shared/ical-feed";

const url =
  "https://calendar.google.com/calendar/ical/test%40example.test/private-0123456789abcdef0123456789abcdef/basic.ics";
const feed = (title = "Bokat via iCal", hour = "10") =>
  `BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-CALNAME:Min privata kalender\nBEGIN:VEVENT\nUID:abcdef123@google.com\nSUMMARY:${title}\nDTSTART:20261029T${hour}0000Z\nDURATION:PT30M\nEND:VEVENT\nEND:VCALENDAR`;
async function backend(page: Page) {
  const saved = new Map<string, SavedFeed>();
  const calls: { action: string; week?: string }[] = [];
  let text = feed(),
    fail = false;
  const handler = icalHandler({
    origin: "http://localhost:3001",
    encryptionKey: btoa("12345678901234567890123456789012"),
    authenticate: async (token) => {
      try {
        return JSON.parse(
          Buffer.from(token.split(".")[1], "base64url").toString(),
        ).sub;
      } catch {
        return null;
      }
    },
    store: {
      load: async (id) => saved.get(id) ?? null,
      save: async (id, value) => {
        saved.set(id, value);
      },
      remove: async (id) => {
        saved.delete(id);
      },
      claim: async () => true,
    },
    read: async (_, selectedWeek) => {
      if (fail) throw new Error("Offline");
      return parseFeedWeek(text, selectedWeek);
    },
  });
  await page.route(
    "http://127.0.0.1:54321/functions/v1/calendar-ical",
    async (route) => {
      const request = route.request();
      if (request.method() === "POST") calls.push(request.postDataJSON());
      const response = await handler(
        new Request(request.url(), {
          method: request.method(),
          headers: request.headers(),
          ...(request.postData() ? { body: request.postData() } : {}),
        }),
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      });
    },
  );
  return {
    saved,
    calls,
    set text(value: string) {
      text = value;
    },
    set fail(value: boolean) {
      fail = value;
    },
  };
}
async function open(page: Page) {
  await page.locator(".calendar-tools-menu > summary").click();
  await page
    .getByRole("button", { name: "Öppna Google Kalender", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
test("ansluter en privat länk på mobil, behåller kategorier och status vid automatisk uppdatering och kan pausa/koppla från", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { get: () => true }),
  );
  const cloud = await mock(page),
    server = await backend(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await open(page);
  await page.getByLabel("Hemlig iCal-adress", { exact: true }).fill(url);
  await page
    .getByRole("button", { name: "Anslut och förhandsgranska", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Förhandsgranskning av Google-import",
  });
  await expect(preview).toContainText("Bokat via iCal");
  await expect(
    page.getByLabel("Hemlig iCal-adress", { exact: true }),
  ).toHaveValue("");
  await preview.getByRole("combobox").selectOption("learning");
  await preview.getByRole("checkbox").uncheck();
  await page.screenshot({ path: "test-results/ical-preview-mobile.png" });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.map((v) => v.id),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Importera kalenderhändelser", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  await page
    .getByRole("checkbox", { name: /^Genomförd: Bokat via iCal/ })
    .check();
  await status(page, "Sparat i molnet");
  expect(cloud.documents.get(userA)!.data.icalCalendar).toEqual({
    calendarId: "test@example.test",
    autoRefresh: true,
  });
  expect(JSON.stringify(cloud.documents.get(userA))).not.toContain("private-");
  expect(
    await page.evaluate(() =>
      JSON.stringify(localStorage).includes("private-"),
    ),
  ).toBe(false);
  expect(JSON.stringify([...server.saved.values()])).not.toContain("private-");
  const localActivities = structuredClone(
    cloud.documents
      .get(userA)!
      .data.weeks[week].activities.filter((a) => !a.external),
  );
  server.text = feed("Uppdaterad iCal-bokning", "11");
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: /^Genomförd: Uppdaterad iCal-bokning/ }),
  ).toBeChecked();
  await status(page, "Sparat i molnet");
  const booking = cloud.documents
    .get(userA)!
    .data.weeks[week].activities.find((a) => a.external)!;
  expect(booking).toMatchObject({
    categoryId: "learning",
    status: "done",
    start: 720,
    end: 750,
  });
  expect(
    cloud.documents
      .get(userA)!
      .data.weeks[week].activities.filter((a) => !a.external),
  ).toEqual(localActivities);
  server.fail = true;
  await page.clock.fastForward(16 * 60000);
  await expect(page.locator(".ical-sync-error")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /^Genomförd: Uppdaterad iCal-bokning/ }),
  ).toBeChecked();
  server.fail = false;
  await open(page);
  await page
    .getByRole("checkbox", {
      name: "Uppdatera automatiskt när appen är öppen",
      exact: true,
    })
    .uncheck();
  await page.getByRole("button", { name: "Stäng dialog", exact: true }).click();
  await status(page, "Sparat i molnet");
  const reads = server.calls.filter((c) => c.action === "read").length;
  await page.clock.fastForward(16 * 60000);
  expect(server.calls.filter((c) => c.action === "read")).toHaveLength(reads);
  await open(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Koppla från iCal-länken", exact: true })
    .click();
  await expect(
    page.getByText("Ansluten: Min privata kalender", { exact: false }),
  ).toHaveCount(0);
  expect(server.saved.size).toBe(0);
  await page.getByRole("button", { name: "Stäng dialog", exact: true }).click();
  await status(page, "Sparat i molnet");
  expect(cloud.documents.get(userA)!.data.icalCalendar).toBeUndefined();
  await expect(
    page.getByRole("checkbox", { name: /^Genomförd: Uppdaterad iCal-bokning/ }),
  ).toBeChecked();
  expect(cloud.errors).toEqual([]);
});
