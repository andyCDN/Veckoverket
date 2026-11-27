import { describe, expect, it } from "vitest";
import { jobWorkspaceFixture, jobDate } from "./fixtures/job-workspace";
import { reviewJobFixture } from "./fixtures/job-review";
import { decodeData } from "../lib/storage";
import {
  clearJobDecision,
  decideWatchJob,
  decisionForJob,
  toggleWeeklyJob,
  updateDismissalReason,
  weeklyJobIds,
} from "../lib/job-search";
import { removeJobApplication, restoreDismissedJobs } from "../lib/job-removal";
import { orderedJobReviews } from "../lib/job-review";
const now = new Date("2026-11-23T08:00:00Z");

it("sparar högst tre val per vecka och låter användaren ändra dem utan att ändra kalender eller ansökningar", () => {
  const before = jobWorkspaceFixture();
  let next = before;
  for (const id of ["draft", "waiting", "due"])
    next = toggleWeeklyJob(next, jobDate, id);
  expect(weeklyJobIds(next, jobDate)).toEqual(["draft", "waiting", "due"]);
  expect(weeklyJobIds(next, "2026-11-30")).toEqual([]);
  const four = {
    ...next,
    applications: [
      ...next.applications!,
      { ...next.applications![0], id: "four" },
    ],
  };
  expect(() => toggleWeeklyJob(four, jobDate, "four")).toThrow("Tre jobb");
  expect(() => toggleWeeklyJob(next, jobDate, "closed")).toThrow("pågående");
  expect(() => toggleWeeklyJob(next, "2026-11-24", "draft")).toThrow(
    "giltig vecka",
  );
  next = toggleWeeklyJob(next, jobDate, "waiting");
  expect(weeklyJobIds(next, jobDate)).toEqual(["draft", "due"]);
  expect(decodeData(JSON.stringify(next)).jobSearch).toEqual(next.jobSearch);
  expect(next.weeks).toEqual(before.weeks);
  expect(next.applications).toEqual(before.applications);
  expect(before.jobSearch).toBeUndefined();
});

it("rensar borttagna jobb ur veckans val och döljer avslutade val utan att ändra andra veckor", () => {
  let data = toggleWeeklyJob(jobWorkspaceFixture(), jobDate, "draft");
  data = toggleWeeklyJob(data, "2026-11-30", "draft");
  const closed = {
    ...data,
    applications: data.applications!.map((job) =>
      job.id === "draft" ? { ...job, status: "closed" as const } : job,
    ),
  };
  expect(weeklyJobIds(closed, jobDate)).toEqual([]);
  expect(removeJobApplication(data, "draft").jobSearch?.weeklyPicks).toEqual({
    [jobDate]: [],
    "2026-11-30": [],
  });
});

it("sparar ett återkomstdatum inom annonsens öppettid och hittar beslutet via andra annonskällor", () => {
  const data = jobWorkspaceFixture();
  const job = reviewJobFixture({
    additionalUrls: [
      "https://example.org/second#ansok",
      "https://example.org/second",
    ],
  });
  const next = decideWatchJob(
    data,
    job,
    { kind: "later", revisitOn: "2026-11-25" },
    now,
  );
  expect(
    decisionForJob(next.jobSearch?.decisions, [
      "https://example.org/second#annat",
    ]),
  ).toMatchObject({
    kind: "later",
    revisitOn: "2026-11-25",
    additionalUrls: ["https://example.org/second"],
  });
  expect(() =>
    decideWatchJob(data, job, { kind: "later", revisitOn: "2026-11-23" }, now),
  ).toThrow("efter idag");
  expect(() =>
    decideWatchJob(data, job, { kind: "later", revisitOn: "2026-12-07" }, now),
  ).toThrow("sista ansökningsdag");
  expect(() =>
    decideWatchJob(data, job, { kind: "later", revisitOn: "2026-02-30" }, now),
  ).toThrow();
  expect(
    clearJobDecision(next, "https://example.org/second").jobSearch?.decisions,
  ).toEqual([]);
  expect(decodeData(JSON.stringify(next)).jobSearch).toEqual(next.jobSearch);
  expect(next.weeks).toEqual(data.weeks);
  expect(next.applications).toEqual(data.applications);
});

it("bedömer tidigaste återkomstdag i Stockholm även efter midnatt svensk tid", () => {
  const data = jobWorkspaceFixture(),
    job = reviewJobFixture();
  expect(() =>
    decideWatchJob(
      data,
      job,
      { kind: "later", revisitOn: "2026-11-24" },
      new Date("2026-11-23T23:30:00Z"),
    ),
  ).toThrow();
  expect(
    decideWatchJob(
      data,
      job,
      { kind: "later", revisitOn: "2026-11-25" },
      new Date("2026-11-23T23:30:00Z"),
    ).jobSearch?.decisions?.[0].revisitOn,
  ).toBe("2026-11-25");
});

it("bortval ersätter uppskjutning och återställning tar med samtliga annonslänkar", () => {
  const job = reviewJobFixture({
    additionalUrls: ["https://example.org/alias"],
  });
  const data = jobWorkspaceFixture();
  const later = decideWatchJob(
    data,
    job,
    { kind: "later", revisitOn: "2026-11-25" },
    now,
  );
  const dismissed = decideWatchJob(later, job, { kind: "dismissed" }, now);
  const explained = updateDismissalReason(dismissed, job.url, "role");
  expect(explained.jobSearch?.decisions).toHaveLength(1);
  expect(explained.jobSearch?.decisions?.[0]).toMatchObject({
    kind: "dismissed",
    reason: "role",
  });
  expect(explained.dismissedJobUrls).toEqual([
    job.url,
    "https://example.org/alias",
  ]);
  const restored = restoreDismissedJobs(explained, "https://example.org/alias");
  expect(restored.dismissedJobUrls).toEqual([]);
  expect(restored.jobSearch?.decisions).toEqual([]);
});

it("låter endast explicit bortvald inriktning påverka liknande rollers prioritet", () => {
  const data = jobWorkspaceFixture(),
    job = reviewJobFixture();
  const other = reviewJobFixture({
    url: "https://example.org/other",
    role: "Kommunikatör",
    text: job.text!.replace("påverkansarbete", "kommunikationsarbete"),
  });
  const base = orderedJobReviews([job])[0].review.score;
  const role = decideWatchJob(
    data,
    job,
    { kind: "dismissed", reason: "role" },
    now,
  );
  expect(orderedJobReviews([job], [], role.jobSearch)[0].review.score).toBe(
    base - 20,
  );
  expect(
    orderedJobReviews([other], [], role.jobSearch)[0].review.interest,
  ).toBeUndefined();
  const location = updateDismissalReason(role, job.url, "location");
  expect(orderedJobReviews([job], [], location.jobSearch)[0].review.score).toBe(
    base,
  );
  expect(
    updateDismissalReason(role, job.url).jobSearch?.decisions?.[0].reason,
  ).toBeUndefined();
});

describe("backup med jobbsökarval", () => {
  it.each([
    null,
    [],
    { weeklyPicks: [] },
    { weeklyPicks: { [jobDate]: ["1", "2", "3", "4"] } },
    { weeklyPicks: { [jobDate]: ["1", "1"] } },
    { weeklyPicks: { "2026-11-24": [] } },
    { decisions: [null] },
    { decisions: [{ url: "javascript:alert(1)" }] },
  ])("avvisar trasig data %j", (jobSearch) => {
    expect(() =>
      decodeData(JSON.stringify({ ...jobWorkspaceFixture(), jobSearch })),
    ).toThrow();
  });
  it("läser äldre backup utan jobbsökarval", () =>
    expect(() =>
      decodeData(JSON.stringify(jobWorkspaceFixture())),
    ).not.toThrow());
});
