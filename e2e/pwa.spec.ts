import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function ready(page: Page) {
  await page.goto("./");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
}
async function installButton(page: Page) {
  await page.locator(".calendar-tools-menu > summary").click();
  return page.getByRole("button", { name: "Installera appen", exact: true });
}

test("PWA-manifest, appikoner och webbläsarens installationskrav", async ({
  page,
}) => {
  await ready(page);
  const root = new URL(page.url());
  const link = page.locator('link[rel="manifest"]');
  const url = new URL((await link.getAttribute("href"))!, root);
  expect(url.pathname).toBe(`${root.pathname}manifest.webmanifest`);
  const response = await page.request.get(url.href);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "Veckoverket",
    display: "standalone",
    start_url: root.pathname,
    scope: root.pathname,
    id: root.pathname,
  });
  for (const icon of manifest.icons) {
    const image = await page.request.get(new URL(icon.src, root).href);
    expect(image.ok()).toBe(true);
    const bytes = await image.body();
    expect(bytes.toString("ascii", 1, 4)).toBe("PNG");
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(
      icon.sizes,
    );
  }
  expect(
    manifest.icons.some(
      (icon: { purpose: string }) => icon.purpose === "maskable",
    ),
  ).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    `${root.pathname}icons/veckoverket-180.png`,
  );
  // Playwright's isolated contexts are incognito, where Chrome blocks installs.
  // Check actual eligibility using a disposable regular browser profile.
  const profile = await mkdtemp(join(tmpdir(), "veckoverket-install-"));
  const regular = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const normalPage = await regular.newPage();
    await normalPage.goto(root.href);
    await expect(normalPage.locator(".calendar-grid")).toBeVisible();
    await normalPage.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined),
    );
    const client = await regular.newCDPSession(normalPage);
    const eligibility = await client.send("Page.getInstallabilityErrors");
    expect(eligibility.installabilityErrors).toEqual([]);
  } finally {
    await regular.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("appen startar offline med sparad plan utan att cachelagra konto-API:er", async ({
  page,
  context,
}) => {
  await ready(page);
  const root = new URL(page.url());
  const privatePath = `${root.pathname}rpc/private-workspace`;
  await page.route(`**${privatePath}`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: '{"private":"ACCOUNT_FIXTURE"}',
    }),
  );
  expect(
    await page.evaluate(
      async (path) =>
        (
          await fetch(path, {
            headers: { Authorization: "Bearer ACCOUNT_FIXTURE" },
          })
        ).json(),
      privatePath,
    ),
  ).toEqual({ private: "ACCOUNT_FIXTURE" });
  const entry = page.locator(".day-shell.is-selected .calendar-entry").first();
  const check = entry.getByRole("checkbox", { name: /^Genomförd:/ });
  await check.check();
  const cacheURLs = await page.evaluate(async () => {
    const result: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      result.push(...(await cache.keys()).map((request) => request.url));
    }
    return result;
  });
  expect(cacheURLs.length).toBeGreaterThan(5);
  expect(
    cacheURLs.every((value) => {
      const url = new URL(value);
      return (
        url.origin === root.origin &&
        url.pathname.startsWith(root.pathname) &&
        !url.search &&
        !url.pathname.includes("rpc/")
      );
    }),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await expect(check).toBeChecked();
  await check.uncheck();
  await page.reload();
  await expect(check).not.toBeChecked();
  await page.goto(
    new URL("inspelning/?contactId=PRIVATE_CONTEXT_FIXTURE", root).href,
  );
  await expect(
    page.getByRole("heading", { name: "Samtalsinspelning", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const worklet = await fetch(
        new URL(
          "pcm-capture.worklet.js",
          document.baseURI.replace(/inspelning\/.*$/, ""),
        ),
      );
      return worklet.ok && (await worklet.text()).includes("veckoverket-pcm");
    }),
  ).toBe(true);
  const recorderCache = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((q) => q.url));
    }
    return urls;
  });
  expect(
    recorderCache.some((url) => url.includes("PRIVATE_CONTEXT_FIXTURE")),
  ).toBe(false);
});

test("mobil installation använder webbläsarens dialog och visar Safari-instruktioner", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "userAgent", {
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
    }),
  );
  await ready(page);
  await (await installButton(page)).click();
  await expect(page.getByRole("dialog")).toContainText("Add to Home Screen");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        document.documentElement.dataset.installPrompted = "true";
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await (await installButton(page)).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-install-prompted",
    "true",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await page.locator(".calendar-tools-menu > summary").click();
  await expect(
    page.getByRole("button", { name: "Installera appen", exact: true }),
  ).toHaveCount(0);
});

test("en uppdaterad service worker väntar och lämnar ett öppet formulär orört", async ({
  page,
}) => {
  await ready(page);
  await page.locator(".day-shell.is-selected .calendar-block").first().click();
  await page.getByLabel("Namn", { exact: true }).fill("Pågående redigering");
  const scope = new URL(page.url()).pathname;
  await page.evaluate(async (path) => {
    await navigator.serviceWorker.register(`${path}sw.js?update-check=1`, {
      scope: path,
      updateViaCache: "none",
    });
  }, scope);
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.ready).waiting),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.controller?.scriptURL.includes("update-check"),
    ),
  ).toBe(false);
  await expect(page.getByLabel("Namn", { exact: true })).toHaveValue(
    "Pågående redigering",
  );
});
