import { test, expect, type Page } from "@playwright/test";
import { mock, plan, row, login, status, userA, week } from "./helpers";
import type { RecordingSession } from "../supabase/functions/_shared/recording-schema";
test.use({
  permissions: ["microphone"],
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
  viewport: { width: 390, height: 844 },
});
async function setup(page: Page) {
  const original = plan("Molnplan");
  original.weeks[week].activities[0].status = "done";
  original.applications = [
    {
      id: "application",
      organization: "Bolaget",
      role: "Analytiker",
      status: "interview",
      deadline: "",
      nextAction: "Behåll nästa steg",
      followUpDate: "",
      notes: "Befintlig anteckning",
    },
  ];
  original.contacts = [
    {
      id: "contact",
      name: "Kim",
      organization: "Bolaget",
      nextAction: "",
      followUpDate: "",
      entries: [],
    },
  ];
  const f = await mock(page, row(original));
  const sessions = new Map<string, RecordingSession>(),
    received = new Map<string, Set<number>>(),
    transcribed = new Map<string, Set<number>>();
  let seq = 0,
    offline = false,
    blockAI = false,
    failSummary = false,
    summaryCalls = 0,
    releaseAI = () => {},
    aiCalls = 0,
    wavUploads = 0;
  const summary = {
    agreements: [
      {
        text: "Länken skickas på fredag.",
        owner: "Kim",
        when: "Fredag",
        evidence: "Jag skickar länken på fredag.",
      },
    ],
    nextSteps: [],
    uncertainties: [],
  };
  await page.route(
    "**/storage/v1/object/interview-recordings/**",
    async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      if (offline) return route.abort("failed");
      expect(
        route.request().postDataBuffer()?.includes(Buffer.from("RIFF")),
      ).toBe(true);
      wavUploads++;
      return route.fulfill({
        json: { Id: "audio", Key: "audio" },
        headers: { "access-control-allow-origin": "*" },
      });
    },
  );
  await page.route("**/functions/v1/recording", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const b = route.request().postDataJSON(),
      s = sessions.get(b.id);
    const reply = (body: unknown) =>
      route.fulfill({
        json: body,
        headers: { "access-control-allow-origin": "*" },
      });
    if (b.action === "status") return reply({ ready: true, aiReady: true });
    if (b.action === "list") return reply({ sessions: [...sessions.values()] });
    if (b.action === "create") {
      const id = `33333333-3333-4333-8333-${String(++seq).padStart(12, "0")}`;
      const session: RecordingSession = {
        id,
        title: b.title,
        context: b.context,
        state: "active",
        startedAt: new Date().toISOString(),
        segmentCount: 0,
      };
      sessions.set(id, session);
      received.set(id, new Set());
      transcribed.set(id, new Set());
      return reply({ session });
    }
    if (!s) return reply({ error: "Saknas" });
    if (b.action === "acknowledge") {
      received.get(b.id)!.add(b.index);
      return reply({ received: true, sha256: b.sha256 });
    }
    if (b.action === "transcribe") {
      aiCalls++;
      if (blockAI)
        await new Promise<void>((r) => {
          releaseAI = r;
        });
      transcribed.get(b.id)!.add(b.index);
      return reply({ ready: true });
    }
    if (b.action === "get")
      return reply({
        session: s,
        nextIndex: received.get(b.id)!.size,
        pendingIndices: [...received.get(b.id)!].filter(
          (i) => !transcribed.get(b.id)!.has(i),
        ),
      });
    if (b.action === "stop") {
      expect(received.get(b.id)!.size).toBe(b.count);
      s.state = "stopped";
      s.segmentCount = b.count;
      return reply({ stopped: true });
    }
    if (b.action === "summarize") {
      summaryCalls++;
      if (failSummary)
        return reply({ error: "Sammanfattning tillfälligt fördröjd." });
      s.state = "complete";
      s.summary = summary;
      return reply({ done: true, summary });
    }
    if (b.action === "delete") {
      sessions.delete(b.id);
      return reply({ removed: true });
    }
    return reply({ error: "Okänd åtgärd" });
  });
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await page.goto("./inspelning/?applicationId=application&contactId=contact");
  await expect(
    page.getByRole("button", { name: "Starta inspelning", exact: true }),
  ).toBeEnabled();
  return {
    f,
    original,
    sessions,
    get summaryCalls() {
      return summaryCalls;
    },
    set failSummary(v: boolean) {
      failSummary = v;
    },
    get aiCalls() {
      return aiCalls;
    },
    get uploads() {
      return wavUploads;
    },
    set offline(v: boolean) {
      offline = v;
    },
    set blockAI(v: boolean) {
      blockAI = v;
    },
    unblock() {
      blockAI = false;
      releaseAI();
    },
  };
}
async function capturePart(page: Page) {
  await expect(
    page.getByText("● Inspelning pågår", { exact: false }),
  ).toBeVisible();
  await page.waitForTimeout(1100); // Real AudioWorklet frames, independent of mocked wall-clock.
  await page.getByRole("button", { name: "Pausa", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fortsätt", exact: true }),
  ).toBeVisible();
}
async function localAudio(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open("veckoverket-recording-audio", 1);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    return new Promise<{ raw: number; uploaded: number }>((resolve) => {
      const q = db.transaction("segments").objectStore("segments").getAll();
      q.onsuccess = () =>
        resolve({
          raw: q.result.filter((v) => v.blob instanceof Blob).length,
          uploaded: q.result.filter((v) => v.uploaded).length,
        });
    });
  });
}
test("fortsätter spela in och ladda upp medan AI står still och låter nästa samtal starta", async ({
  page,
}) => {
  test.setTimeout(45000);
  const f = await setup(page);
  f.blockAI = true;
  f.failSummary = true;
  await page
    .getByRole("button", { name: "Starta inspelning", exact: true })
    .click();
  await capturePart(page);
  await expect.poll(() => f.aiCalls).toBe(1);
  await expect.poll(() => localAudio(page)).toEqual({ raw: 0, uploaded: 1 });
  await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
  await capturePart(page);
  await expect.poll(() => f.uploads).toBe(2);
  await expect.poll(() => localAudio(page)).toEqual({ raw: 0, uploaded: 2 });
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Starta inspelning", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Samtalets rubrik" })
    .fill("Nästa samtal");
  await page
    .getByRole("button", { name: "Starta inspelning", exact: true })
    .click();
  f.unblock();
  await expect.poll(() => f.summaryCalls).toBe(1);
  f.failSummary = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => [...f.sessions.values()][0].state).toBe("complete");
  await expect(
    page.getByText("● Inspelning pågår", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Samtalets rubrik" }),
  ).toHaveValue("Nästa samtal");
  await expect(
    page.getByRole("heading", { name: "Granska sammanfattningen" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  expect(f.f.errors).toEqual([]);
});
test("återhämtar lokalt ljud efter nätfel och omladdning och sparar granskad text utan att ändra planen", async ({
  page,
}) => {
  test.setTimeout(45000);
  const f = await setup(page);
  f.offline = true;
  await page
    .getByRole("button", { name: "Starta inspelning", exact: true })
    .click();
  await capturePart(page);
  await expect.poll(() => localAudio(page)).toEqual({ raw: 1, uploaded: 0 });
  await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
  await capturePart(page);
  await expect.poll(() => localAudio(page)).toEqual({ raw: 2, uploaded: 0 });
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect.poll(() => localAudio(page)).toEqual({ raw: 2, uploaded: 0 });
  f.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => localAudio(page)).toEqual({ raw: 0, uploaded: 0 });
  await page
    .getByRole("button", { name: "Öppna inspelning", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Avsluta och sammanfatta sparat ljud",
      exact: true,
    })
    .click();
  const review = page.getByRole("textbox", {
    name: "Granskad sammanfattning",
    exact: true,
  });
  await expect(review).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/veckoverket-recorder-mobile.png",
    fullPage: true,
  });
  await review.fill("Kim skickar länken på fredag. Granskat.");
  const save = page.getByRole("button", {
    name: "Spara granskad sammanfattning i historiken",
    exact: true,
  });
  await save.click();
  await expect(
    page.getByText("Den granskade sammanfattningen är sparad", {
      exact: false,
    }),
  ).toBeVisible();
  const written = f.f.writes.length;
  await save.click();
  await expect(save).toBeEnabled();
  expect(f.f.writes).toHaveLength(written);
  const saved = f.f.documents.get(userA)!.data;
  expect(saved.weeks).toEqual(f.original.weeks);
  expect(saved.applications![0].nextAction).toBe("Behåll nästa steg");
  expect(saved.applications![0].notes).toBe("Befintlig anteckning");
  expect(saved.applications![0].history).toHaveLength(1);
  expect(saved.contacts![0].entries).toHaveLength(1);
  expect(f.f.errors).toEqual([]);
});
test("behåller ljud som inte kan skrivas lokalt och erbjuder nedladdning före återförsök", async ({
  page,
}) => {
  const f = await setup(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "segments")
        throw new DOMException("Full", "QuotaExceededError");
      return original.apply(this, args);
    };
    (window as unknown as { restoreWrites: () => void }).restoreWrites = () => {
      IDBObjectStore.prototype.add = original;
    };
  });
  await page
    .getByRole("button", { name: "Starta inspelning", exact: true })
    .click();
  await capturePart(page);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "kunde inte sparas lokalt",
  );
  await page
    .getByText("Väntande ljud och återhämtning", { exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Spara ljuddel 1 som inte kunde lagras lokalt",
      exact: true,
    })
    .click();
  expect((await download).suggestedFilename()).toBe("samtal-1.wav");
  expect(f.uploads).toBe(0);
  await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "kunde inte lagras lokalt",
  );
  await page.evaluate(() =>
    (window as unknown as { restoreWrites: () => void }).restoreWrites(),
  );
  await page
    .getByRole("button", { name: "Försök ladda upp igen", exact: true })
    .click();
  await expect.poll(() => f.uploads).toBe(1);
  await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
  await expect(
    page.getByText("● Inspelning pågår", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  expect(f.f.errors).toEqual([]);
});
