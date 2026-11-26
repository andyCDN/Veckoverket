import { afterEach, expect, it, vi } from "vitest";
import {
  fetchSourcePage,
  JOB_WATCH_SOURCES,
  matchesWatchProfile,
  parseStatligtAdvertisement,
  parseStatligtListing,
  scanWatchSource,
  sourceUrl,
  statligtPartitions,
} from "../../scripts/job-watch-sources.mjs";
import {
  statligtJob,
  statligtListing,
  statligtOriginal,
  sourceText,
} from "./fixtures/job-watch-sources";
import { validWatchJob } from "../lib/job-watch-feed";

const source = JOB_WATCH_SOURCES.find((s) => s.id === "jobba-statligt")!;
const second = {
  ...statligtJob,
  role: "Projektledare",
  url: statligtJob.url.replace("utredare-31781856", "projektledare-31781857"),
};
const groups = [
  {
    queryName: "Occupation",
    items: [
      { value: "440", hitCount: 1 },
      { value: "430", hitCount: 1 },
    ],
  },
];
afterEach(() => vi.unstubAllGlobals());

it("läser Jobba statligts offentliga sökmodell och bevarar annonsens egna länk", () => {
  expect(parseStatligtListing(statligtListing()).jobs).toEqual([
    { ...statligtJob, deadline: "" },
  ]);
  expect(parseStatligtListing(statligtListing([], 0)).count).toBe(0);
  for (const html of [
    "Access denied",
    statligtListing().replace("GovJobAdPage", "OtherPage"),
    statligtListing().replace("www.jobbastatligt.se", "evil.test"),
    statligtListing().replace("31781856", "invalid"),
  ])
    expect(() => parseStatligtListing(html)).toThrow();
});

it("delar större sökurval efter publicerade filter och behåller tidigare filter", () => {
  const listing = parseStatligtListing(
    statligtListing([statligtJob], 2, groups),
  );
  const params = new URLSearchParams({ display: "250", Area: "247" });
  const partitions = statligtPartitions(listing, params);
  expect(partitions.map((p: URLSearchParams) => p.get("Occupation"))).toEqual([
    "440",
    "430",
  ]);
  expect(
    partitions.every(
      (p: URLSearchParams) =>
        p.get("Area") === "247" && p.get("display") === "250",
    ),
  ).toBe(true);
  expect(params.has("Occupation")).toBe(false);
  expect(() => statligtPartitions({ ...listing, count: 3 }, params)).toThrow(
    "träffgräns",
  );
  const nested = [
    {
      queryName: "Occupation",
      items: [
        {
          value: "440",
          hitCount: 2,
          items: [
            { value: "441", hitCount: 1 },
            { value: "442", hitCount: 1 },
          ],
        },
      ],
    },
  ];
  expect(
    statligtPartitions(
      { ...listing, filters: nested },
      new URLSearchParams({ Occupation: "441,442" }),
    ).map((p: URLSearchParams) => p.get("Occupation")),
  ).toEqual(["441", "442"]);
  const parentGroups = [
    {
      ...nested[0],
      items: [...nested[0].items, { value: "450", hitCount: 1, items: [] }],
    },
  ];
  expect(
    statligtPartitions(
      { ...listing, count: 3, filters: parentGroups },
      new URLSearchParams(),
    ).map((p: URLSearchParams) => p.get("Occupation")),
  ).toEqual(["441,442", "450"]);
});

it("hämtar hela det uppdelade urvalet och kopplar rätt Platsbanken-original till varje annons", async () => {
  const read = vi.fn(async (url: string) => {
    if (url.includes("/sok?")) {
      const occupation = new URL(url).searchParams.get("Occupation");
      if (!occupation) return statligtListing([statligtJob], 2, groups);
      return statligtListing([occupation === "440" ? statligtJob : second]);
    }
    const id = url.split("/").at(-1)!;
    return JSON.stringify({
      ...statligtOriginal,
      id,
      headline: id === "31781856" ? statligtJob.role : second.role,
    });
  });
  const jobs = await scanWatchSource(source, "2026-11-26", read);
  expect(jobs).toHaveLength(2);
  expect(read).toHaveBeenCalledTimes(5);
  for (const job of jobs) {
    expect(validWatchJob(job)).toBe(true);
    expect(job.text).toBe(sourceText);
    expect(job.deadline).toBe("2026-12-06");
    expect(job.additionalUrls[0]).toContain(
      "arbetsformedlingen.se/platsbanken/annonser/",
    );
  }
  expect(jobs.map((job: typeof statligtJob) => job.url)).toEqual([
    statligtJob.url,
    second.url,
  ]);
  await expect(
    scanWatchSource(source, "2026-11-26", async () =>
      statligtListing([statligtJob], 2),
    ),
  ).rejects.toThrow("träffgräns");
});

it("läser fulltext, exakt ansökningsdag och ansökningslänk utan att gissa årtal från portalens kortdatum", () => {
  const job = parseStatligtAdvertisement(statligtOriginal, statligtJob)!;
  expect(job).toMatchObject({
    ...statligtJob,
    summary: sourceText,
    text: sourceText,
    applicationUrl: "https://example.org/apply",
    additionalUrls: [
      "https://arbetsformedlingen.se/platsbanken/annonser/31781856",
    ],
  });
  expect(
    parseStatligtAdvertisement(
      { ...statligtOriginal, application_deadline: "2027-01-05T23:59:59" },
      statligtJob,
    )?.deadline,
  ).toBe("2027-01-05");
  expect(
    parseStatligtAdvertisement(
      { ...statligtOriginal, application_deadline: null },
      statligtJob,
    )?.deadline,
  ).toBe("");
  expect(() =>
    parseStatligtAdvertisement(
      { ...statligtOriginal, id: "31781857" },
      statligtJob,
    ),
  ).toThrow("stämmer inte");
  expect(() =>
    parseStatligtAdvertisement(
      { ...statligtOriginal, application_deadline: "2026-02-31T00:00:00" },
      statligtJob,
    ),
  ).toThrow("ansökningsdag");
  expect(
    parseStatligtAdvertisement({ id: "31781856", removed: true }, statligtJob),
  ).toBeNull();
  expect(
    parseStatligtAdvertisement(
      {
        ...statligtOriginal,
        application_details: { url: "javascript:alert(1)" },
      },
      statligtJob,
    )?.applicationUrl,
  ).toBeUndefined();
});

it("granskar orten i originalet och hoppar över utgångna eller borttagna annonser", async () => {
  expect(matchesWatchProfile({ ...statligtJob, location: "Bromma" })).toBe(
    true,
  );
  for (const patch of [
    { workplace_address: { municipality: "Göteborg" } },
    { application_deadline: "2026-11-25T23:59:59" },
    { removed: true },
  ]) {
    const read = vi.fn(async (url: string) =>
      url.includes("/sok?")
        ? statligtListing()
        : JSON.stringify({ ...statligtOriginal, ...patch }),
    );
    expect(await scanWatchSource(source, "2026-11-26", read)).toEqual([]);
  }
  const outside = vi.fn(async () =>
    statligtListing([{ ...statligtJob, location: "Göteborg" }]),
  );
  expect(await scanWatchSource(source, "2026-11-26", outside)).toEqual([]);
  expect(outside).toHaveBeenCalledTimes(1);
});

it("kompletterar saknad myndighet i portalens lista från det exakta originalet", async () => {
  const read = async (url: string) =>
    url.includes("/sok?")
      ? statligtListing([{ ...statligtJob, organization: "" }])
      : JSON.stringify(statligtOriginal);
  const jobs = await scanWatchSource(source, "2026-11-26", read);
  expect(jobs).toHaveLength(1);
  expect(jobs[0].organization).toBe("Myndigheten");
  expect(validWatchJob(jobs[0])).toBe(true);
});

it("tillåter endast portalens annonser och det exakta publika ad-API:et utan kontouppgifter", async () => {
  expect(sourceUrl(statligtJob.url, source, true)).toBe(statligtJob.url);
  const earlyMonth = statligtJob.url.replace("/2611/", "/911/");
  expect(sourceUrl(earlyMonth, source, true)).toBe(earlyMonth);
  for (const url of [
    "https://www.jobbastatligt.se.evil.test/jobb/x",
    "https://user:password@www.jobbastatligt.se/jobb/x",
    "https://www.jobbastatligt.se/sok",
    "https://www.jobbastatligt.se/other",
  ])
    expect(sourceUrl(url, source, true)).toBeUndefined();
  const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  for (const url of [
    "https://jobsearch.api.jobtechdev.se/search?q=test",
    "https://jobsearch.api.jobtechdev.se.evil.test/ad/31781856",
    "https://user:secret@jobsearch.api.jobtechdev.se/ad/31781856",
  ])
    await expect(fetchSourcePage(url)).rejects.toThrow("Okänd");
  expect(fetcher).not.toHaveBeenCalled();
  await fetchSourcePage("https://jobsearch.api.jobtechdev.se/ad/31781856");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    redirect: "error",
  });
  expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
});
