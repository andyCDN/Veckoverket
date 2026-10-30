import { test, expect, type Page } from "@playwright/test";
import {
  mock,
  login,
  status,
  logout,
  plan,
  row,
  userA,
  userB,
  week,
} from "./helpers";
import type { GoogleEvent } from "../src/lib/google-calendar";
const calendarId = "calendar@example.test";
const googleToken = "test-google-token-memory-only";
function event(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "booking-1",
    summary: "Bokat i Google",
    start: { dateTime: "2026-10-26T09:00:00+01:00" },
    end: { dateTime: "2026-10-26T10:00:00+01:00" },
    htmlLink: "https://www.google.com/calendar/event?eid=test",
    ...overrides,
  };
}
async function googleMock(page: Page) {
  let events = [event()],
    fail = 0;
  const methods: string[] = [];
  await page.route("https://accounts.google.com/gsi/client", async (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{oauth2:{initTokenClient(options){window.__googleScopes=options.scope;return {requestAccessToken(params){window.__googlePrompt=params.prompt;if(window.__closeGooglePopup){options.error_callback();return;}setTimeout(()=>options.callback({access_token:${JSON.stringify(googleToken)},expires_in:3600,scope:options.scope}),0);}};},revoke(token,callback){window.__googleRevoked=true;callback();}}}};`,
    }),
  );
  await page.route(
    "https://www.googleapis.com/calendar/v3/**",
    async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      methods.push(request.method());
      if (request.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,OPTIONS",
          },
        });
      expect(request.headers().authorization).toBe(`Bearer ${googleToken}`);
      expect(url.search).not.toContain(googleToken);
      const fulfill = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(body),
        });
      if (url.pathname.endsWith("/calendarList"))
        return fulfill({
          items: [
            {
              id: calendarId,
              summary: "Min Googlekalender",
              primary: true,
              timeZone: "Europe/Stockholm",
              accessRole: "owner",
            },
          ],
        });
      if (fail) return fulfill({ error: { message: "Test failure" } }, fail);
      expect(url.searchParams.get("singleEvents")).toBe("true");
      return fulfill({ items: events });
    },
  );
  return {
    methods,
    set events(value: GoogleEvent[]) {
      events = value;
    },
    set fail(value: number) {
      fail = value;
    },
  };
}
async function open(page: Page) {
  if (
    !(await page
      .getByRole("button", { name: "Öppna Google Kalender", exact: true })
      .isVisible())
  ) {
    await page.locator(".calendar-tools-menu > summary").click();
  }
  await page
    .getByRole("button", { name: "Öppna Google Kalender", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator(".google-oauth-alternative > summary").click();
}
async function connect(page: Page) {
  await open(page);
  await page
    .getByRole("button", { name: "Anslut Google-konto", exact: true })
    .click();
  await expect(
    page.getByLabel("Min Googlekalender · huvudkalender"),
  ).toBeChecked();
}
async function preview(page: Page) {
  await page
    .getByRole("button", { name: "Förhandsgranska import", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Förhandsgranskning av Google-import" }),
  ).toBeVisible();
}
async function apply(page: Page) {
  await page
    .getByRole("button", { name: "Importera kalenderhändelser", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await status(page, "Sparat i molnet");
}

test("läser Google-bokningar, planerar runt dem och behåller avbockning vid uppdatering", async ({
  page,
}) => {
  const cloud = await mock(page),
    g = await googleMock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await connect(page);
  const scopes = await page.evaluate(
    () => (window as unknown as { __googleScopes: string }).__googleScopes,
  );
  expect(scopes.split(" ")).toEqual([
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ]);
  await preview(page);
  await apply(page);
  let imported = cloud.documents
    .get(userA)!
    .data.weeks[week].activities.filter((a) => a.external);
  expect(imported).toHaveLength(1);
  const entry = page.locator(`[data-activity-id="${imported[0].id}"]`);
  await expect(entry.locator(".session-remove")).toHaveCount(0);
  await entry.locator(".calendar-block").click();
  await expect(
    page.getByRole("link", { name: "Öppna i Google Kalender", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Namn", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await entry.getByRole("checkbox", { name: /^Genomförd:/ }).check();
  await status(page, "Sparat i molnet");
  g.events = [
    event({
      summary: "Uppdaterad Googlebokning",
      start: { dateTime: "2026-10-26T10:00:00+01:00" },
      end: { dateTime: "2026-10-26T11:00:00+01:00" },
    }),
  ];
  await open(page);
  await preview(page);
  await apply(page);
  imported = cloud.documents
    .get(userA)!
    .data.weeks[week].activities.filter((a) => a.external);
  expect(imported).toHaveLength(1);
  expect(imported[0]).toMatchObject({
    title: "Uppdaterad Googlebokning",
    start: 600,
    end: 660,
    status: "done",
  });
  expect(JSON.stringify(cloud.documents.get(userA))).not.toContain(googleToken);
  expect(
    await page.evaluate(
      (token) =>
        Object.values(localStorage).some((value) =>
          String(value).includes(token),
        ),
      googleToken,
    ),
  ).toBe(false);
  expect(
    g.methods.every((method) => method === "GET" || method === "OPTIONS"),
  ).toBe(true);
  await page.reload();
  await status(page, "Sparat i molnet");
  await expect(
    page.getByRole("checkbox", {
      name: /^Genomförd: Uppdaterad Googlebokning/,
    }),
  ).toBeChecked();
  await open(page);
  await expect(
    page.getByRole("button", { name: "Anslut Google-konto", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Förhandsgranska import", exact: true }),
  ).toHaveCount(0);
  expect(cloud.errors).toEqual([]);
});
test("kategoriserar Google-bokningar före och efter import och behåller valet vid uppdatering på mobil", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { get: () => true }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  const cloud = await mock(page),
    g = await googleMock(page);
  g.events = [
    event({
      start: { dateTime: "2026-10-30T13:00:00+01:00" },
      end: { dateTime: "2026-10-30T13:30:00+01:00" },
    }),
  ];
  await page.goto("./");
  await login(page);
  await connect(page);
  await preview(page);
  await page
    .getByRole("combobox", { name: /^Kategori för Bokat i Google/ })
    .selectOption("learning");
  await apply(page);
  await page.getByRole("button", { name: /^Visa fredag/ }).click();
  let imported = cloud.documents
    .get(userA)!
    .data.weeks[week].activities.find((a) => a.external)!;
  expect(imported.categoryId).toBe("learning");
  const entry = page.locator(`[data-activity-id="${imported.id}"]`);
  await expect(entry.locator(".block-category")).toContainText(
    "Lärande · Google",
  );
  await entry.locator(".calendar-block").click();
  const category = page.getByRole("combobox", {
    name: "Kategori",
    exact: true,
  });
  await expect(category).toHaveValue("learning");
  await category.selectOption("health");
  expect(
    await category.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
  ).toBeGreaterThanOrEqual(44);
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations.map((violation) => violation.id)).toEqual([]);
  await page
    .getByRole("button", { name: "Spara kategori", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  imported = cloud.documents
    .get(userA)!
    .data.weeks[week].activities.find((a) => a.external)!;
  expect(imported).toMatchObject({
    categoryId: "health",
    source: "external",
    blockType: "locked",
    start: 780,
    end: 810,
  });
  await entry.getByRole("checkbox", { name: /^Genomförd:/ }).check();
  await status(page, "Sparat i molnet");
  g.events = [
    event({
      summary: "Uppdaterad bokning",
      start: { dateTime: "2026-10-30T13:30:00+01:00" },
      end: { dateTime: "2026-10-30T14:00:00+01:00" },
    }),
  ];
  await open(page);
  await preview(page);
  await expect(
    page.getByRole("combobox", { name: /^Kategori för Uppdaterad bokning/ }),
  ).toHaveValue("health");
  await apply(page);
  expect(
    cloud.documents
      .get(userA)!
      .data.weeks[week].activities.find((a) => a.external),
  ).toMatchObject({
    categoryId: "health",
    status: "done",
    start: 810,
    end: 840,
  });
  await page.reload();
  await status(page, "Sparat i molnet");
  await page.getByRole("button", { name: /^Visa fredag/ }).click();
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Uppdaterad bokning" })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Kategori", exact: true }),
  ).toHaveValue("health");
  expect(
    g.methods.every((method) => method === "GET" || method === "OPTIONS"),
  ).toBe(true);
  expect(cloud.errors).toEqual([]);
});
test("avbokade Google-händelser tas bort medan egna aktiviteter bevaras", async ({
  page,
}) => {
  const original = plan("Egen plan");
  const personal = original.weeks[week].activities.find(
    (a) => a.date === week && a.start === 780,
  )!;
  personal.source = "manual";
  personal.title = "Mitt eget pass";
  const cloud = await mock(page, row(original)),
    g = await googleMock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await connect(page);
  await preview(page);
  await apply(page);
  g.events = [{ id: "booking-1", status: "cancelled" }];
  await open(page);
  await preview(page);
  await apply(page);
  const activities = cloud.documents.get(userA)!.data.weeks[week].activities;
  expect(activities.some((a) => a.external)).toBe(false);
  expect(activities.find((a) => a.id === personal.id)).toEqual(personal);
  expect(cloud.errors).toEqual([]);
});
test("ett Google-fel bevarar importen och en utgången anslutning behöver förnyas", async ({
  page,
}) => {
  const cloud = await mock(page),
    g = await googleMock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await connect(page);
  await preview(page);
  await apply(page);
  const before = structuredClone(cloud.documents.get(userA));
  g.fail = 500;
  await open(page);
  await page
    .getByRole("button", { name: "Förhandsgranska import", exact: true })
    .click();
  await expect(
    page.locator(".google-oauth-alternative .inline-error"),
  ).toContainText("kunde inte hämtas");
  await expect(
    page.getByRole("button", {
      name: "Importera kalenderhändelser",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(cloud.documents.get(userA)).toEqual(before);
  g.fail = 401;
  await page
    .getByRole("button", { name: "Förhandsgranska import", exact: true })
    .click();
  await expect(
    page.locator(".google-oauth-alternative .inline-error"),
  ).toContainText("gått ut");
  await expect(
    page.getByRole("button", { name: "Anslut Google-konto", exact: true }),
  ).toBeVisible();
  expect(cloud.errors).toEqual([]);
});
test("heldagar, helger och lediga poster visas utan att öppna för felaktig omplanering", async ({
  page,
}) => {
  const cloud = await mock(page),
    g = await googleMock(page);
  g.events = [
    event({
      id: "birthday",
      summary: "Heldagsnotering",
      start: { date: "2026-10-31" },
      end: { date: "2026-11-01" },
      transparency: "transparent",
    }),
    event({
      id: "weekend",
      summary: "Lördagsbokning",
      start: { dateTime: "2026-10-31T11:00:00+01:00" },
      end: { dateTime: "2026-10-31T12:00:00+01:00" },
    }),
    event({
      id: "evening",
      summary: "Kvällsbokning",
      start: { dateTime: "2026-10-27T18:00:00+01:00" },
      end: { dateTime: "2026-10-27T19:00:00+01:00" },
    }),
  ];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await connect(page);
  await preview(page);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const dialogScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    dialogScan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/google-calendar-import-mobile.png",
    fullPage: true,
  });
  await apply(page);
  await page.getByRole("button", { name: /^Visa lördag/ }).click();
  await expect(page.locator(".day-shell.is-selected")).toContainText(
    "Lördagsbokning",
  );
  await expect(page.locator(".day-shell.is-selected")).toContainText("Heldag");
  const data = cloud.documents.get(userA)!.data;
  expect(
    data.weeks[week].activities
      .filter((a) => !a.external)
      .every((a) => a.start >= 510 && a.end <= 930),
  ).toBe(true);
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
  expect(cloud.errors).toEqual([]);
});
test("Google-behörighet följer inte med till ett annat Veckoverket-konto", async ({
  page,
}) => {
  const cloud = await mock(page);
  cloud.documents.set(userB, row(plan("Andra kontot")));
  await googleMock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await connect(page);
  await preview(page);
  await apply(page);
  await logout(page);
  await login(page, "b@example.test");
  await status(page, "Sparat i molnet");
  await open(page);
  await expect(
    page.getByRole("button", { name: "Anslut Google-konto", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Förhandsgranska import", exact: true }),
  ).toHaveCount(0);
  expect(
    cloud.documents
      .get(userB)!
      .data.weeks[week].activities.some((a) => a.external),
  ).toBe(false);
  expect(cloud.errors).toEqual([]);
});
test("avbruten Google-inloggning och frånkoppling hanteras utan sidfel", async ({
  page,
}) => {
  const cloud = await mock(page);
  await googleMock(page);
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await open(page);
  await page.evaluate(() => {
    (window as unknown as { __closeGooglePopup: boolean }).__closeGooglePopup =
      true;
  });
  await page
    .getByRole("button", { name: "Anslut Google-konto", exact: true })
    .click();
  await expect(
    page.locator(".google-oauth-alternative .inline-error"),
  ).toContainText("stängdes");
  await page.evaluate(() => {
    (window as unknown as { __closeGooglePopup: boolean }).__closeGooglePopup =
      false;
  });
  await page
    .getByRole("button", { name: "Anslut Google-konto", exact: true })
    .click();
  await expect(
    page.getByLabel("Min Googlekalender · huvudkalender"),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Koppla från Google", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Anslut Google-konto", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __googleRevoked: boolean }).__googleRevoked,
    ),
  ).toBe(true);
  expect(cloud.errors).toEqual([]);
});
