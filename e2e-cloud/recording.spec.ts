import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
test("rättar och söker transkription, bevarar original och kräver ny granskning utan att skriva över egna anteckningar", async ({
  page,
}) => {
  test.setTimeout(60000);
  const f = await setup(page, { enhanced: true, freeCalendar: true });
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
  await capturePart(page);
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  const review = page.getByRole("textbox", {
    name: "Granskad sammanfattning",
    exact: true,
  });
  await expect(review).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("button", {
      name: "Spara granskad sammanfattning i historiken",
      exact: true,
    })
    .click();
  await expect
    .poll(() => f.f.documents.get(userA)!.data.applications![0].history?.length)
    .toBe(1);
  const originalNotes =
    f.f.documents.get(userA)!.data.applications![0].history![0].notes;
  await review.fill("Mina egna formuleringar bevaras.");
  await page
    .getByText("Transkription · sök, lyssna och rätta", { exact: true })
    .click();
  const transcript = page.getByRole("region", { name: "Sökbar transkription" });
  await transcript.getByLabel("Sök i transkriptionen").fill("fredag");
  await expect(transcript).toContainText("1 av 1 ljuddelar");
  await transcript
    .getByRole("button", { name: "Rätta ljuddel 1", exact: true })
    .click();
  await transcript
    .getByLabel("Rättad text för ljuddel 1")
    .fill("Kim: Jag skickar länken på måndag.");
  await transcript
    .getByRole("button", { name: "Spara rättelse", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Spara granskad sammanfattning i historiken",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(review).toHaveValue("Mina egna formuleringar bevaras.");
  await transcript.getByLabel("Sök i transkriptionen").fill("måndag");
  await expect(transcript).toContainText("Kim: Jag skickar länken på måndag.");
  await transcript.getByText("Ursprunglig taltext", { exact: true }).click();
  await expect(transcript).toContainText("Kim: Jag skickar länken på fredag.");
  await transcript
    .getByText("Tidigare sammanfattningar", { exact: true })
    .click();
  await expect(transcript).toContainText("Version 1");
  await page
    .getByRole("button", { name: "Uppdatera sammanfattningen", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Behåll min text och markera den som granskad",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Behåll min text och markera den som granskad",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Spara granskad sammanfattning i historiken",
      exact: true,
    })
    .click();
  await expect
    .poll(() => f.f.documents.get(userA)!.data.applications![0].history?.length)
    .toBe(2);
  const saved = f.f.documents.get(userA)!.data;
  expect(saved.applications![0].history![0].notes).toBe(originalNotes);
  expect(saved.applications![0].history![1].notes).toContain(
    "Mina egna formuleringar bevaras.",
  );
  expect(saved.weeks).toEqual(f.original.weeks);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(f.f.errors).toEqual([]);
});
test("förhandsvisar en bevakningsbokning och följer ett ändrat åtagande genom nästa samtal med bevarad kalender", async ({
  page,
}) => {
  test.setTimeout(60000);
  const f = await setup(page, { enhanced: true, freeCalendar: true });
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
  await capturePart(page);
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  const actions = page.getByRole("region", { name: "Åtgärder från samtalet" });
  await expect(actions).toBeVisible();
  await actions
    .getByRole("combobox", { name: "Typ av nästa steg", exact: true })
    .selectOption("waiting");
  await actions
    .getByRole("button", { name: "Föreslå kalenderbokning", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("En bevakning av Kim bokas");
  expect(f.f.documents.get(userA)!.data.careerActions).toBeUndefined();
  expect(f.f.documents.get(userA)!.data.weeks).toEqual(f.original.weeks);
  await modal.getByRole("radio").first().check();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await modal.screenshot({ path: "/tmp/veckoverket-recording-booking.png" });
  await modal
    .getByRole("button", {
      name: "Spara åtgärd och kalenderbokning",
      exact: true,
    })
    .click();
  await expect(modal).toHaveCount(0);
  const first = structuredClone(f.f.documents.get(userA)!.data),
    action = first.careerActions![0];
  expect(action.kind).toBe("waiting");
  const pass = Object.values(first.weeks)
    .flatMap((w) => w.activities)
    .find((a) => a.careerActionId === action.id)!;
  expect(pass.title).toBe("Följ upp: Länken skickas på fredag.");
  expect(pass.date).toBe("2026-10-30");
  expect(first.applications![0].nextAction).toBe("Behåll nästa steg");
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
  await capturePart(page);
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  await expect(actions).toBeVisible();
  await page.locator(".recording-follow-up > summary").click();
  const agreement = page.locator(".recording-agreement").filter({
    has: page.getByRole("heading", {
      name: "Länken skickas på fredag.",
      exact: true,
    }),
  });
  await agreement
    .getByRole("button", { name: "Följ upp överenskommelsen", exact: true })
    .click();
  await agreement
    .getByLabel("Utfall för överenskommelsen")
    .selectOption("changed");
  await agreement.getByLabel("Ändrat åtagande").fill("Kim skickar en ny länk");
  await agreement.getByLabel("Nytt datum").fill("2026-11-02");
  await agreement
    .getByLabel("Anteckning om uppföljningen")
    .fill("Den första länken fungerade inte");
  await agreement
    .getByRole("button", {
      name: "Spara uppföljning av överenskommelsen",
      exact: true,
    })
    .click();
  await expect
    .poll(() => f.f.documents.get(userA)!.data.careerActions![0].title)
    .toBe("Kim skickar en ny länk");
  expect(f.f.documents.get(userA)!.data.weeks).toEqual(first.weeks);
  expect(
    f.f.documents.get(userA)!.data.careerActions![0].updates![0].previous
      ?.title,
  ).toBe("Länken skickas på fredag.");
  const changed = page.locator(".recording-agreement").filter({
    has: page.getByRole("heading", {
      name: "Kim skickar en ny länk",
      exact: true,
    }),
  });
  await changed
    .getByRole("button", { name: "Följ upp överenskommelsen", exact: true })
    .click();
  await changed
    .getByLabel("Utfall för överenskommelsen")
    .selectOption("fulfilled");
  await changed
    .getByLabel("Anteckning om uppföljningen")
    .fill("Länken har kommit");
  await changed
    .getByRole("button", {
      name: "Spara uppföljning av överenskommelsen",
      exact: true,
    })
    .click();
  await expect
    .poll(() => f.f.documents.get(userA)!.data.careerActions![0].status)
    .toBe("done");
  expect(f.f.documents.get(userA)!.data.weeks).toEqual(first.weeks);
  expect(f.f.errors).toEqual([]);
});
test("lämnar verifierat ljud i serverkön och återläser resultatet efter att inspelningssidan stängts", async ({
  page,
}) => {
  const f = await setup(page, { enhanced: true, serverQueue: true });
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
  await capturePart(page);
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  await expect(
    page.getByText(
      "Alla ljuddelar är verifierade i molnet. Servern fortsätter bearbetningen även om du stänger sidan.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(f.aiCalls).toBe(0);
  const id = [...f.sessions.keys()][0];
  await page.goto("./");
  f.completeOnServer(id);
  expect(f.sessions.get(id)!.summary).toBeDefined();
  await page.goto(`./inspelning/?recordingId=${id}`);
  await expect(
    page.getByRole("textbox", { name: "Granskad sammanfattning", exact: true }),
  ).toHaveValue(/Länken skickas på fredag/);
  expect(f.aiCalls).toBe(0);
  expect(f.f.documents.get(userA)!.data.weeks).toEqual(f.original.weeks);
  expect(f.f.errors).toEqual([]);
});
async function setup(
  page: Page,
  options: {
    enhanced?: boolean;
    serverQueue?: boolean;
    freeCalendar?: boolean;
  } = {},
) {
  const original = plan("Molnplan");
  original.weeks[week].activities[0].status = "done";
  if (options.freeCalendar)
    original.weeks[week].activities = original.weeks[week].activities.slice(
      0,
      1,
    );
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
  const texts = new Map<string, Map<number, string>>(),
    versions = new Map<
      string,
      { revision: number; summary: unknown; created_at: string }[]
    >();
  const summaryFor = (s: RecordingSession) =>
    s.transcriptRevision
      ? {
          ...summary,
          agreements: [
            {
              ...summary.agreements[0],
              text: "Länken skickas på måndag.",
              when: "Måndag",
              evidence: "Jag skickar länken på måndag.",
            },
          ],
        }
      : summary;
  let seq = 0,
    offline = false,
    blockAI = false,
    failSummary = false,
    summaryCalls = 0,
    releaseAI = () => {},
    aiCalls = 0,
    wavUploads = 0;
  let aiFailure = "",
    aiDiagnostics = true;
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
      if (route.request().method() === "GET")
        return route.fulfill({
          body: Buffer.from(
            "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=",
            "base64",
          ),
          contentType: "audio/wav",
          headers: { "access-control-allow-origin": "*" },
        });
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
    if (b.action === "status")
      return reply({
        ready: true,
        aiReady: true,
        deferredCategorization: true,
        aiDiagnostics,
        transcriptEditing: options.enhanced === true,
        durableQueue: options.serverQueue === true,
      });
    if (b.action === "check-ai")
      return reply(
        aiFailure
          ? { error: aiFailure, code: "ai_credit_exhausted" }
          : { aiReady: true, transcription: true, summary: true },
      );
    if (b.action === "list") return reply({ sessions: [...sessions.values()] });
    if (b.action === "create") {
      const id = `33333333-3333-4333-8333-${String(++seq).padStart(12, "0")}`;
      const session: RecordingSession = {
        id,
        title: b.title,
        context: b.context,
        state: "active",
        startedAt: "2026-10-29T09:00:00Z",
        segmentCount: 0,
        ...(options.enhanced
          ? { transcriptRevision: 0, summaryRevision: 0, summaryStale: false }
          : {}),
      };
      sessions.set(id, session);
      received.set(id, new Set());
      transcribed.set(id, new Set());
      texts.set(id, new Map());
      versions.set(id, []);
      return reply({ session });
    }
    if (!s) return reply({ error: "Saknas" });
    if (b.action === "acknowledge") {
      received.get(b.id)!.add(b.index);
      return reply({ received: true, sha256: b.sha256 });
    }
    if (b.action === "categorize") {
      s.title = b.title;
      s.context = b.context;
      return reply({ session: s });
    }
    if (b.action === "transcribe") {
      aiCalls++;
      if (aiFailure)
        return reply({ error: aiFailure, code: "ai_credit_exhausted" });
      if (blockAI)
        await new Promise<void>((r) => {
          releaseAI = r;
        });
      transcribed.get(b.id)!.add(b.index);
      if (!texts.get(b.id)!.has(b.index))
        texts.get(b.id)!.set(b.index, "Kim: Jag skickar länken på fredag.");
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
      if (options.serverQueue)
        s.job = {
          state: "queued",
          attempts: 0,
          nextAttemptAt: new Date().toISOString(),
        };
      return reply({ stopped: true });
    }
    if (b.action === "summarize") {
      summaryCalls++;
      if (failSummary)
        return reply({ error: "Sammanfattning tillfälligt fördröjd." });
      s.state = "complete";
      s.summary = summaryFor(s);
      s.summaryRevision = s.transcriptRevision ?? 0;
      s.summaryStale = false;
      return reply({ done: true, summary: s.summary });
    }
    if (b.action === "correct-transcript") {
      expect(options.enhanced).toBe(true);
      if (b.revision !== (s.transcriptRevision ?? 0))
        return reply({ error: "Transkriptionen har ändrats." });
      if (s.summary)
        versions.get(b.id)!.push({
          revision: s.summaryRevision ?? 0,
          summary: structuredClone(s.summary),
          created_at: new Date().toISOString(),
        });
      texts.get(b.id)!.set(b.index, b.text);
      s.transcriptRevision = (s.transcriptRevision ?? 0) + 1;
      s.summaryStale = true;
      s.state = "stopped";
      return reply({ session: s });
    }
    if (b.action === "delete") {
      sessions.delete(b.id);
      return reply({ removed: true });
    }
    return reply({ error: "Okänd åtgärd" });
  });
  await page.route("**/rest/v1/recording_segments?**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("user_id")).toBe(`eq.${userA}`);
    const id = params.get("session_id")?.replace(/^eq\./, "") ?? "";
    return route.fulfill({
      json: [...(transcribed.get(id) ?? [])].map((index) => ({
        segment_index: index,
        transcript:
          texts.get(id)?.get(index) ?? "Kim: Jag skickar länken på fredag.",
        original_transcript: "Kim: Jag skickar länken på fredag.",
        transcript_revision: sessions.get(id)?.transcriptRevision ?? 0,
        duration_ms: 20000,
      })),
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.route(
    "**/rest/v1/recording_summary_versions?**",
    async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      const params = new URL(route.request().url()).searchParams;
      expect(params.get("user_id")).toBe(`eq.${userA}`);
      return route.fulfill({
        json:
          versions.get(params.get("session_id")?.replace(/^eq\./, "") ?? "") ??
          [],
        headers: { "access-control-allow-origin": "*" },
      });
    },
  );
  await page.route(
    "**/storage/v1/object/authenticated/interview-recordings/**",
    async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      return route.fulfill({
        body: Buffer.from(
          "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=",
          "base64",
        ),
        contentType: "audio/wav",
        headers: { "access-control-allow-origin": "*" },
      });
    },
  );
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await page.goto("./inspelning/?applicationId=application&contactId=contact");
  await expect(
    page.getByRole("button", { name: "Spela in", exact: true }),
  ).toBeEnabled();
  return {
    f,
    original,
    sessions,
    completeOnServer(id: string) {
      const s = sessions.get(id)!;
      for (const i of received.get(id)!) {
        transcribed.get(id)!.add(i);
        texts.get(id)!.set(i, "Kim: Jag skickar länken på fredag.");
      }
      s.state = "complete";
      s.summary = summaryFor(s);
      s.summaryRevision = s.transcriptRevision ?? 0;
      s.summaryStale = false;
      s.job = {
        state: "complete",
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
      };
    },
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
    set aiFailure(v: string) {
      aiFailure = v;
    },
    set aiDiagnostics(v: boolean) {
      aiDiagnostics = v;
    },
    unblock() {
      blockAI = false;
      releaseAI();
    },
  };
}
test("granskar åtgärder med ljudhänvisning, importerar en gång och bevarar befintliga nästa steg", async ({
  page,
}) => {
  const f = await setup(page);
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
  await capturePart(page);
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Åtgärder från samtalet" });
  await expect(
    review.getByRole("button", {
      name: "Öppna citatets ljuddel 1",
      exact: true,
    }),
  ).toBeVisible();
  expect(f.f.documents.get(userA)!.data.careerActions).toBeUndefined();
  await review
    .getByRole("button", { name: "Öppna citatets ljuddel 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lyssna på ljuddelen", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Ljuddel 1", exact: true })
      .locator("audio"),
  ).toHaveAttribute("src", /^blob:/);
  await review
    .getByRole("checkbox", { name: "Spara förslag 1 som nästa steg" })
    .check();
  await review
    .getByLabel("Åtgärd 1", { exact: true })
    .fill("Kontrollera att länken kommit");
  await review
    .getByLabel("Ansvarig för förslag 1", { exact: true })
    .fill("Jag");
  await review
    .getByLabel("Datum för förslag 1", { exact: true })
    .fill("2026-10-30");
  await review
    .getByRole("button", { name: "Spara valda nästa steg", exact: true })
    .click();
  await expect
    .poll(() => f.f.documents.get(userA)!.data.careerActions?.length)
    .toBe(1);
  const saved = f.f.documents.get(userA)!.data,
    sessionId = [...f.sessions.keys()][0];
  expect(saved.applications![0].nextAction).toBe("Behåll nästa steg");
  expect(saved.contacts![0].entries).toEqual([]);
  expect(saved.weeks).toEqual(f.original.weeks);
  expect(saved.careerActions![0]).toMatchObject({
    title: "Kontrollera att länken kommit",
    owner: "Jag",
    source: { recordingId: sessionId, segmentIndexes: [0] },
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "/tmp/veckoverket-recorder-review-v2.png",
    fullPage: true,
  });
  await page.goto(`./inspelning/?recordingId=${sessionId}&segment=0`);
  await expect(
    page.getByRole("region", { name: "Ljuddel 1", exact: true }),
  ).toBeVisible();
  await expect(
    review.getByRole("checkbox", { name: "Spara förslag 1 som nästa steg" }),
  ).toBeDisabled();
  await expect(
    review.getByRole("button", { name: "Spara valda nästa steg", exact: true }),
  ).toBeDisabled();
  await page.goto("./");
  await status(page, "Sparat i molnet");
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Jobb & nätverk", exact: true })
    .click();
  await page.getByRole("button", { name: "Nästa steg", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Kontrollera att länken kommit",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Öppna citatets ljuddel 1", exact: true }),
  ).toHaveAttribute("href", new RegExp(`recordingId=${sessionId}&segment=0`));
  expect(f.f.errors).toEqual([]);
});
test("visar AI-felets orsak, behåller ljudet och återupptar analysen efter ett lyckat anslutningstest", async ({
  page,
}) => {
  const f = await setup(page);
  f.aiFailure =
    "OpenAI-projektets API-kredit eller budget är slut. Kontrollera API-faktureringen.";
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
  await capturePart(page);
  await expect.poll(() => localAudio(page)).toEqual({ raw: 0, uploaded: 1 });
  await expect(page.getByText(/API-kredit eller budget är slut/)).toBeVisible();
  await page.getByText("Felsök AI-analysen", { exact: true }).click();
  await page
    .getByRole("button", { name: "Kontrollera AI-anslutningen", exact: true })
    .click();
  await expect(
    page.locator(".recording-diagnostics [role=status]"),
  ).toContainText("API-kredit");
  expect(await localAudio(page)).toEqual({ raw: 0, uploaded: 1 });
  f.aiFailure = "";
  await page
    .getByRole("button", { name: "Kontrollera AI-anslutningen", exact: true })
    .click();
  await expect(
    page.locator(".recording-diagnostics [role=status]"),
  ).toContainText("Både transkribering och sammanfattning");
  await expect.poll(() => localAudio(page)).toEqual({ raw: 0, uploaded: 0 });
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Granska sammanfattningen" }),
  ).toBeVisible();
  expect(f.f.documents.get(userA)!.data.weeks).toEqual(f.original.weeks);
});

test("förklarar när en äldre serverfunktion behöver uppdateras för AI-diagnostik", async ({
  page,
}) => {
  const f = await setup(page);
  f.aiDiagnostics = false;
  await page.getByText("Felsök AI-analysen", { exact: true }).click();
  await page
    .getByRole("button", { name: "Kontrollera AI-anslutningen", exact: true })
    .click();
  await expect(
    page.locator(".recording-diagnostics [role=status]"),
  ).toContainText("serverfunktion behöver uppdateras");
  await expect(
    page.getByRole("button", { name: "Spela in", exact: true }),
  ).toBeEnabled();
});
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
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
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
    page.getByRole("button", { name: "Spela in", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
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
  ).toHaveCount(0);
  expect([...f.sessions.values()][1].context).toEqual({});
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
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
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
  await page.locator(".recording-archive > summary").click();
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
  await page
    .getByRole("combobox", { name: "Kategori", exact: true })
    .selectOption("career");
  await page
    .getByRole("combobox", { name: "Ansökan", exact: true })
    .selectOption("application");
  await page
    .getByRole("combobox", { name: "Kontakt", exact: true })
    .selectOption("contact");
  await page
    .getByRole("textbox", { name: "Samtalets rubrik", exact: true })
    .fill("Intervju med Kim");
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
  await page.getByRole("button", { name: "Spela in", exact: true }).click();
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

test("stor inspelningsknapp startar utan kategori och kategorisering sker efter stopp", async ({
  page,
}) => {
  test.setTimeout(45000);
  const f = await setup(page);
  await page.goto("./inspelning/");
  const start = page.getByRole("button", {
    name: "Spela in",
    exact: true,
  });
  await expect(start).toBeEnabled();
  await expect(
    page.locator('.recording-steps [aria-current="step"]'),
  ).toContainText("Spela in");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const box = await start.boundingBox();
  expect(box!.width).toBeGreaterThan(300);
  expect(box!.height).toBeGreaterThan(280);
  expect(box!.y + box!.height).toBeLessThan(844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/veckoverket-recorder-riso-start.png",
    fullPage: true,
  });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(start).toBeInViewport();
  }
  await page.screenshot({
    path: "/tmp/veckoverket-recorder-riso-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await start.click();
  await capturePart(page);
  expect([...f.sessions.values()][0].context).toEqual({});
  await page
    .getByRole("button", { name: "Stoppa och sammanfatta", exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Kategorisera inspelningen",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Kategori", exact: true })
    .selectOption("networking");
  await page
    .getByRole("textbox", { name: "Samtalets rubrik", exact: true })
    .fill("Nätverkssamtal med Kim");
  await page
    .getByRole("button", { name: "Spara kategorisering", exact: true })
    .click();
  await expect(
    page.getByText("Kategoriseringen är sparad.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => [...f.sessions.values()][0].context.categoryId)
    .toBe("networking");
  await expect.poll(() => [...f.sessions.values()][0].state).toBe("complete");
  await page.reload();
  await page.locator(".recording-archive > summary").click();
  await page
    .getByRole("button", { name: "Öppna inspelning", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Kategori", exact: true }),
  ).toHaveValue("networking");
  await expect(
    page.getByRole("textbox", { name: "Samtalets rubrik", exact: true }),
  ).toHaveValue("Nätverkssamtal med Kim");
  expect(f.f.documents.get(userA)!.data.weeks).toEqual(f.original.weeks);
  expect(f.f.writes).toHaveLength(0);
  expect(f.f.errors).toEqual([]);
});
