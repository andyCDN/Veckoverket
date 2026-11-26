import { afterEach, expect, it, vi } from "vitest";
import {
  fetchSourcePage,
  htmlText,
  ideellaPageBody,
  matchesWatchProfile,
  parseIdeellaListing,
  parseStockholmListing,
  parseWatchAdvertisement,
  refreshWatchFeed,
  scanWatchSource,
  sourceUrl,
} from "../../scripts/job-watch-sources.mjs";
import { JOB_WATCH_SOURCES, type JobWatchFeed } from "../lib/job-watch-config";
import {
  parseJobWatchFeed,
  uniqueWatchJobs,
  validWatchJob,
} from "../lib/job-watch-feed";
import {
  ideellaCard,
  ideellaListing,
  sourceAdvertisement,
  sourceJob,
  sourceText,
  stockholmJob,
  stockholmListing,
} from "./fixtures/job-watch-sources";

afterEach(() => vi.unstubAllGlobals());

it("läser Ideella jobbs kort och samma publika Visa fler-fråga som webbplatsen", () => {
  const listing = parseIdeellaListing(ideellaListing);
  expect(listing.jobs).toEqual([sourceJob]);
  expect(listing.pages).toBe(2);
  const body = ideellaPageBody(listing, 2);
  expect(body.get("action")).toBe("get_newsfeeds_posts");
  expect(body.get("current_pages")).toBe("2");
  expect(body.get("query[meta_query][0][value]")).toBe("approved");
  expect(
    parseIdeellaListing(
      ideellaCard({ ...sourceJob, organization: "Kultur &amp; Miljö" }),
    ).jobs[0].organization,
  ).toBe("Kultur & Miljö");
});

it("läser Stockholms stads sidantal, titel, förvaltning och sista ansökningsdag", () => {
  expect(parseStockholmListing(stockholmListing([stockholmJob], 23))).toEqual({
    jobs: [stockholmJob],
    count: 23,
    pages: 23,
  });
  expect(parseStockholmListing(stockholmListing([], 0))).toEqual({
    jobs: [],
    count: 0,
    pages: 1,
  });
  expect(parseIdeellaListing("<h5>0 jobb</h5>").jobs).toEqual([]);
  expect(
    parseStockholmListing(
      stockholmListing().replace(stockholmJob.organization, ""),
    ).jobs[0].organization,
  ).toBe("Stockholms stad");
});

it("behandlar ändrat HTML, blockerade svar och saknad sidindelning som fel", () => {
  for (const html of [
    "<html>Access denied</html>",
    "",
    ideellaListing.replace('data-total-pages="2"', 'data-total-pages="oops"'),
    ideellaListing.replace('"nonce":"public123"', '"changed":"public123"'),
  ])
    expect(() => parseIdeellaListing(html)).toThrow();
  for (const html of [
    "<html>Access denied</html>",
    stockholmListing().replace(
      'data-param-ads-count="1"',
      'data-param-ads-count="501"',
    ),
    stockholmListing().replace("2026-12-06", "2026-02-31"),
  ])
    expect(() => parseStockholmListing(html)).toThrow();
});

it("läser verifierad fulltext och ansökningslänk från båda annonskällorna", () => {
  for (const job of [sourceJob, stockholmJob]) {
    const result = parseWatchAdvertisement(sourceAdvertisement(job), job);
    expect(result).toMatchObject({
      ...job,
      text: sourceText,
      summary: sourceText,
    });
    expect(result.applicationUrl).toMatch(/^https:\/\//);
    expect(validWatchJob(result)).toBe(true);
    expect(() =>
      parseWatchAdvertisement(
        sourceAdvertisement({ ...job, role: "Annat jobb" }),
        job,
      ),
    ).toThrow("verifieras");
  }
  expect(
    htmlText(
      "<p>Krav &amp; uppgifter</p><script>secret()</script><p>Mer<br>text</p>",
    ),
  ).toBe("Krav & uppgifter\nMer\ntext");
  expect(
    parseWatchAdvertisement(
      sourceAdvertisement().replace(
        "https://example.org/apply",
        "javascript:alert(1)",
      ),
      sourceJob,
    ).applicationUrl,
  ).toBeUndefined();
});

it("läser varje källa hela vägen till sista sidan innan relevanta annonser hämtas", async () => {
  const next = {
    ...sourceJob,
    role: "Projektledare",
    url: "https://ideellajobb.se/jobs/projektledare/",
  };
  const read = vi.fn(
    async (url: string, options?: { body?: URLSearchParams }) => {
      if (url === JOB_WATCH_SOURCES[0].url) return ideellaListing;
      if (url.endsWith("admin-ajax.php")) {
        expect(options?.body?.get("current_pages")).toBe("2");
        return JSON.stringify({ data: ideellaCard(next), next_page: false });
      }
      return sourceAdvertisement(url === next.url ? next : sourceJob);
    },
  );
  const jobs = await scanWatchSource(JOB_WATCH_SOURCES[0], "2026-11-26", read);
  expect(jobs.map((j: typeof sourceJob) => j.role)).toEqual([
    sourceJob.role,
    next.role,
  ]);
  expect(read).toHaveBeenCalledTimes(4);
  const later = {
    ...stockholmJob,
    role: "Strateg",
    url: "https://jobba.stockholm/lediga-jobb/platsannonser/strateg-12346",
  };
  const cityRead = vi.fn(async (url: string) => {
    if (url === JOB_WATCH_SOURCES[1].url)
      return stockholmListing([stockholmJob], 2);
    if (url.includes("sida=2")) return stockholmListing([later], 2);
    return sourceAdvertisement(url === later.url ? later : stockholmJob);
  });
  expect(
    await scanWatchSource(JOB_WATCH_SOURCES[1], "2026-11-26", cityRead),
  ).toHaveLength(2);
  expect(cityRead).toHaveBeenCalledWith(
    `${JOB_WATCH_SOURCES[1].url}?sida=2&sortera=nyast`,
  );
  await expect(
    scanWatchSource(JOB_WATCH_SOURCES[1], "2026-11-26", async () =>
      stockholmListing([stockholmJob], 2),
    ),
  ).rejects.toThrow("Alla sidor");
});

it("väljer relevanta roller i Stockholm eller på distans och läser inte utgångna annonser", async () => {
  for (const role of [
    "Projektledare",
    "Politiskt sakkunnig",
    "Administrativ handläggare",
    "Verksamhetschef",
    "Strategisk kommunikatör",
    "Chefssekreterare",
  ])
    expect(matchesWatchProfile({ ...sourceJob, role })).toBe(true);
  for (const job of [
    { ...sourceJob, role: "Lagerarbetare" },
    { ...sourceJob, role: "Enhetschef till vård- och omsorgsboende" },
    { ...sourceJob, location: "Göteborg" },
  ])
    expect(matchesWatchProfile(job)).toBe(false);
  expect(matchesWatchProfile({ ...sourceJob, location: "Distans" })).toBe(true);
  const read = vi.fn(async () =>
    ideellaCard({ ...sourceJob, deadline: "2026-11-25" }),
  );
  expect(
    await scanWatchSource(JOB_WATCH_SOURCES[0], "2026-11-26", read),
  ).toEqual([]);
  expect(read).toHaveBeenCalledTimes(1);
});

it("hämtar endast tillåtna offentliga källor utan kontouppgifter", async () => {
  for (const url of [
    undefined,
    "javascript:alert(1)",
    "https://ideellajobb.se.evil.test/jobs/roll/",
    "https://me:secret@ideellajobb.se/jobs/roll/",
    "https://ideellajobb.se:8443/jobs/roll/",
    "https://ideellajobb.se/jobs/",
  ])
    expect(sourceUrl(url, JOB_WATCH_SOURCES[0], true)).toBeUndefined();
  expect(sourceUrl("/jobs/roll/", JOB_WATCH_SOURCES[0], true)).toBe(
    "https://ideellajobb.se/jobs/roll/",
  );
  const fetcher = vi.fn().mockResolvedValue(new Response("<html>OK</html>"));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchSourcePage("https://evil.test/")).rejects.toThrow("Okänd");
  expect(fetcher).not.toHaveBeenCalled();
  await fetchSourcePage(JOB_WATCH_SOURCES[0].url);
  expect(fetcher).toHaveBeenCalledWith(
    JOB_WATCH_SOURCES[0].url,
    expect.objectContaining({ credentials: "omit", redirect: "error" }),
  );
  expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
});

it("försöker igen efter tillfälligt nätavbrott eller serverfel och begränsar försöken", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("fetch failed"))
    .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response("Fullständig sida"));
  vi.stubGlobal("fetch", fetcher);
  const pause = vi.fn(async () => {});
  expect(await fetchSourcePage(JOB_WATCH_SOURCES[1].url, {}, pause)).toBe(
    "Fullständig sida",
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(pause.mock.calls).toEqual([[1000], [3000]]);
  fetcher.mockReset().mockRejectedValue(new TypeError("fetch failed"));
  await expect(
    fetchSourcePage(JOB_WATCH_SOURCES[1].url, {}, pause),
  ).rejects.toThrow("/lediga-jobb/: fetch failed");
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("upprepar inte nekad åtkomst, borttagna sidor eller en källas anropsgräns", async () => {
  const fetcher = vi.fn(),
    pause = vi.fn(async () => {});
  vi.stubGlobal("fetch", fetcher);
  for (const status of [403, 404, 429]) {
    fetcher.mockReset().mockResolvedValue(new Response("Error", { status }));
    await expect(
      fetchSourcePage(JOB_WATCH_SOURCES[0].url, {}, pause),
    ).rejects.toThrow(`HTTP ${status}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
  expect(pause).not.toHaveBeenCalled();
});

it("bevarar befintligt urval och senaste lyckade källa när en källa misslyckas", async () => {
  const prior = "2026-11-25T08:00:00Z",
    now = new Date("2026-11-26T08:00:00Z");
  const manual = {
    ...sourceJob,
    sourceId: undefined,
    url: "https://example.org/manual",
  };
  const previous: JobWatchFeed = {
    updatedAt: prior,
    jobs: [
      manual,
      sourceJob,
      {
        ...sourceJob,
        url: "https://ideellajobb.se/jobs/utgangen/",
        deadline: "2026-11-25",
      },
    ],
    sources: [
      {
        id: "ideella-jobb",
        checkedAt: prior,
        lastSuccessfulAt: prior,
        status: "ok",
        count: 2,
      },
    ],
  };
  const before = structuredClone(previous),
    log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = await refreshWatchFeed(
      previous,
      now,
      async (source: { id: string }, day: string) => {
        expect(day).toBe("2026-11-26");
        if (source.id === "ideella-jobb") throw new Error("HTTP 503");
        return source.id === "stockholms-stad" ? [stockholmJob] : [];
      },
    );
    expect(previous).toEqual(before);
    expect(result.jobs).toEqual([manual, sourceJob, stockholmJob]);
    expect(result.sources[0]).toEqual({
      id: "ideella-jobb",
      checkedAt: now.toISOString(),
      lastSuccessfulAt: prior,
      status: "error",
      count: 1,
    });
    expect(result.sources[1].status).toBe("ok");
    const failed = await refreshWatchFeed(previous, now, async () => {
      throw new Error("Offline");
    });
    expect(failed.updatedAt).toBe(prior);
    expect(
      failed.sources.every((s: { status: string }) => s.status === "error"),
    ).toBe(true);
  } finally {
    log.mockRestore();
  }
});

it("rensar utgångna och borttagna källannonser vid en lyckad hämtning, även med noll träffar", async () => {
  const previous = {
    updatedAt: "2026-11-25T08:00:00Z",
    jobs: [sourceJob, stockholmJob],
  };
  const result = await refreshWatchFeed(
    previous,
    new Date("2026-11-26T23:30:00Z"),
    async (_source: unknown, day: string) => {
      expect(day).toBe("2026-11-27");
      return [];
    },
  );
  expect(result.jobs).toEqual([]);
  expect(
    result.sources.every(
      (s: { status: string; count: number }) =>
        s.status === "ok" && s.count === 0,
    ),
  ).toBe(true);
});

it("samlar samma offentliga annons från flera källor och bevarar fulltext, ansökningslänk och källänkar", () => {
  const curated = {
    ...sourceJob,
    sourceId: undefined,
    url: "https://example.org/original",
    summary: "Eget urval",
  };
  const complete = {
    ...sourceJob,
    text: sourceText,
    applicationUrl: "https://example.org/apply",
  };
  expect(uniqueWatchJobs([curated, complete])).toEqual([
    {
      ...curated,
      sourceId: sourceJob.sourceId,
      text: sourceText,
      applicationUrl: complete.applicationUrl,
      additionalUrls: [sourceJob.url],
    },
  ]);
  expect(
    uniqueWatchJobs([
      complete,
      { ...complete, url: "https://ideellajobb.se/jobs/andra-rekryteringen/" },
    ]),
  ).toHaveLength(2);
  expect(
    uniqueWatchJobs([curated, { ...complete, deadline: "2026-12-07" }]),
  ).toHaveLength(2);
  expect(
    uniqueWatchJobs([curated, { ...complete, deadline: "" }]),
  ).toHaveLength(2);
});

it("godtar gamla rapporter och avvisar ogiltiga källfält och länkar", () => {
  expect(parseJobWatchFeed({ jobs: [sourceJob], updatedAt: "oops" })).toEqual({
    jobs: [sourceJob],
    updatedAt: null,
    sources: [],
  });
  for (const patch of [
    { deadline: "2026-02-31" },
    { sourceId: "unknown" },
    { applicationUrl: "javascript:alert(1)" },
    { additionalUrls: ["file:///private"] },
  ])
    expect(validWatchJob({ ...sourceJob, ...patch })).toBe(false);
  expect(() => parseJobWatchFeed({})).toThrow("Ogiltig");
  expect(
    parseJobWatchFeed({
      jobs: [],
      sources: [null, { id: "ideella-jobb", checkedAt: "bad" }],
    }).sources,
  ).toEqual([]);
});
