import { test, expect, type Page } from "@playwright/test";
import { createData } from "../src/lib/defaults";
import { generateWeek } from "../src/lib/planner";
import type { AppData } from "../src/lib/types";
const api = "http://127.0.0.1:54321";
const userA = "11111111-1111-4111-8111-111111111111",
  userB = "22222222-2222-4222-8222-222222222222";
const localKey = "veckoverket.workspace.v1";
const week = "2026-10-26";
function plan(name: string) {
  const data = createData();
  data.profile.name = name;
  data.weeks[week] = generateWeek(week, data).plan;
  return data;
}
type Row = { data: AppData; revision: number; updated_at: string };
function row(data: AppData, revision = 1): Row {
  return {
    data: structuredClone(data),
    revision,
    updated_at: "2026-10-29T10:00:00Z",
  };
}
function session(id: string, email: string) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        aud: "authenticated",
        role: "authenticated",
        iat: now,
        exp: now + 3600,
        iss: `${api}/auth/v1`,
      }),
    ).toString("base64url"),
    "mock-signature",
  ].join(".");
  return {
    access_token: jwt,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: `refresh-${id}`,
    user: {
      id,
      email,
      aud: "authenticated",
      role: "authenticated",
      email_confirmed_at: "2026-10-29T10:00:00Z",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: "2026-10-29T10:00:00Z",
    },
  };
}
async function mock(
  page: Page,
  initial: Row | null = row(plan("Molnplan")),
  legacy?: AppData,
) {
  const documents = new Map<string, Row>();
  if (initial) documents.set(userA, initial);
  let offline = false,
    failLoad = false;
  const writes: { user: string; expected: number; data: AppData }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-29T10:00:00+01:00") });
  if (legacy)
    await page.addInitScript(
      ({ key, data }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(data));
      },
      { key: localKey, data: legacy },
    );
  await page.route(`${api}/**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
        },
      });
    const fulfill = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    if (url.pathname === "/auth/v1/token") {
      const body = request.postDataJSON();
      const id =
        body.email?.startsWith("b@") ||
        body.refresh_token === `refresh-${userB}`
          ? userB
          : userA;
      return fulfill(
        session(id, id === userA ? "a@example.test" : "b@example.test"),
      );
    }
    if (url.pathname === "/auth/v1/logout") return fulfill({});
    if (url.pathname === "/auth/v1/user")
      return fulfill(session(userA, "a@example.test").user);
    if (url.pathname === "/auth/v1/signup")
      return fulfill(session(userA, "a@example.test").user);
    if (url.pathname.startsWith("/rest/")) {
      if (offline || (failLoad && request.method() === "GET"))
        return route.abort("failed");
      const token = request.headers().authorization?.slice(7) ?? "";
      let id: string;
      try {
        id = JSON.parse(
          Buffer.from(token.split(".")[1], "base64url").toString(),
        ).sub;
      } catch {
        return fulfill({ message: "Unauthorized" }, 401);
      }
      if (url.pathname === "/rest/v1/workspaces") {
        const requested = url.searchParams.get("user_id")?.replace("eq.", "");
        return fulfill(
          requested === id && documents.has(id) ? [documents.get(id)] : [],
        );
      }
      if (url.pathname === "/rest/v1/rpc/save_workspace") {
        const body = request.postDataJSON();
        if (body.workspace_user_id !== id)
          return fulfill({ code: "42501", message: "Wrong owner" }, 403);
        writes.push({
          user: id,
          expected: body.expected_revision,
          data: structuredClone(body.workspace_data),
        });
        const revision = documents.get(id)?.revision ?? 0;
        if (body.expected_revision !== revision)
          return fulfill({ code: "40001", message: "Conflict" }, 409);
        const next = row(body.workspace_data, revision + 1);
        documents.set(id, next);
        return fulfill(next);
      }
    }
    return fulfill({ message: "Unknown test endpoint" }, 404);
  });
  return {
    documents,
    writes,
    errors,
    set offline(value: boolean) {
      offline = value;
    },
    set failLoad(value: boolean) {
      failLoad = value;
    },
  };
}
async function login(page: Page, email = "a@example.test") {
  await page.getByLabel("E-post", { exact: true }).fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
}
async function status(page: Page, text: string) {
  await expect(page.locator(".storage-status-line")).toContainText(text);
}
async function logout(page: Page) {
  await page
    .locator(".storage-status-line")
    .getByRole("button", { name: "Konto & molnlagring", exact: true })
    .click();
  await page.getByRole("button", { name: "Logga ut", exact: true }).click();
  await expect(page.locator(".cloud-auth")).toBeVisible();
}
async function renameFirst(page: Page, title: string) {
  await page.locator(".calendar-block").first().click();
  await page.getByLabel("Namn", { exact: true }).fill(title);
  await page
    .getByRole("button", { name: "Spara aktivitet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

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
