import { expect, it } from "vitest";
import {
  advertisementRequirements,
  orderedJobReviews,
} from "../lib/job-review";
import {
  compareJobRequirements,
  cvEvidenceSuggestions,
  removeJobCvProfile,
  saveJobCvCheck,
  saveJobCvProfile,
} from "../lib/job-cv-match";
import { jobWorkspaceFixture } from "./fixtures/job-workspace";
import { reviewJobFixture, reviewText } from "./fixtures/job-review";
import { decodeData } from "../lib/storage";
import { readJobNavigation } from "../lib/use-job-navigation";

const cv =
  "Kandidatexamen i statsvetenskap, Universitetet, 2010.\nPolitiskt arbete 2012–2022: politisk rådgivning och remissvar.\nProjektledning och EU-samordning i ideell organisation.";
const job = reviewJobFixture(),
  requirements = advertisementRequirements(reviewText);
const now = new Date("2026-11-23T08:00:00Z");

it("föreslår verkliga CV-utdrag men styrker aldrig krav enbart genom gemensamma ord", () => {
  const data = saveJobCvProfile(jobWorkspaceFixture(), cv, now);
  const result = compareJobRequirements(
    requirements,
    [job.url],
    data.jobSearch?.cvProfile,
  );
  expect(result.map((item) => item.verdict)).toEqual([
    "review",
    "review",
    "review",
  ]);
  expect(result[0].suggestions[0]).toContain("Kandidatexamen i statsvetenskap");
  for (const item of result)
    for (const excerpt of item.suggestions) expect(cv).toContain(excerpt);
  expect(
    compareJobRequirements(requirements, [job.url]).every(
      (item) => item.verdict === "review",
    ),
  ).toBe(true);
  expect(cvEvidenceSuggestions("Du har erfarenhet av arbete.", cv)).toEqual([]);
  expect(
    cvEvidenceSuggestions(
      "Du har erfarenhet av EU-samordning.",
      "Jag saknar erfarenhet av EU-samordning.",
    ),
  ).toEqual([]);
});

it("sparar en bekräftelse med kontrollerbart CV-utdrag och delar den mellan annonskällor", () => {
  const before = jobWorkspaceFixture();
  let data = saveJobCvProfile(before, cv, now);
  const evidence = "Kandidatexamen i statsvetenskap, Universitetet, 2010.";
  data = saveJobCvCheck(
    data,
    [job.url, "https://example.org/alias"],
    requirements[0],
    "supported",
    evidence,
  );
  const result = compareJobRequirements(
    requirements,
    ["https://example.org/alias", job.url],
    data.jobSearch?.cvProfile,
  );
  expect(result[0]).toMatchObject({ verdict: "supported", evidence });
  expect(
    orderedJobReviews([job], [], data.jobSearch)[0].review.score,
  ).toBeGreaterThan(orderedJobReviews([job])[0].review.score);
  expect(decodeData(JSON.stringify(data)).jobSearch).toEqual(data.jobSearch);
  expect(data.weeks).toEqual(before.weeks);
  expect(data.applications).toEqual(before.applications);
  expect(before.jobSearch).toBeUndefined();
});

it("kräver att bekräftat textstöd faktiskt finns i CV:t och bevarar hela annonskravet", () => {
  const data = saveJobCvProfile(jobWorkspaceFixture(), cv, now);
  expect(() =>
    saveJobCvCheck(
      data,
      [job.url],
      requirements[0],
      "supported",
      "Juristexamen från 2014.",
    ),
  ).toThrow("CV-jämförelse");
  expect(() =>
    saveJobCvCheck(data, [job.url], requirements[0], "supported", ""),
  ).toThrow();
  const saved = saveJobCvCheck(data, [job.url], requirements[0], "missing");
  expect(saved.jobSearch?.cvProfile?.checks[0].requirement).toBe(
    requirements[0].text,
  );
  expect(
    compareJobRequirements(
      [{ ...requirements[0], text: requirements[0].text + " Minst fem år." }],
      [job.url],
      saved.jobSearch?.cvProfile,
    )[0].verdict,
  ).toBe("review");
});

it("sorterar bort bekräftat saknat obligatoriskt stöd men inte en saknad merit", () => {
  const profile = saveJobCvProfile(jobWorkspaceFixture(), cv, now);
  const missing = saveJobCvCheck(
    profile,
    [job.url],
    requirements[0],
    "missing",
  );
  expect(orderedJobReviews([job], [], missing.jobSearch)[0].review.kind).toBe(
    "outside",
  );
  const merit = saveJobCvCheck(profile, [job.url], requirements[2], "missing");
  expect(orderedJobReviews([job], [], merit.jobSearch)[0].review.kind).toBe(
    "priority",
  );
  const reset = saveJobCvCheck(missing, [job.url], requirements[0], "review");
  expect(reset.jobSearch?.cvProfile?.checks).toEqual([]);
});

it("ogiltigförklarar bedömningarna när CV-texten ändras och kan ta bort hela underlaget", () => {
  let data = saveJobCvProfile(jobWorkspaceFixture(), cv, now);
  data = saveJobCvCheck(data, [job.url], requirements[0], "missing");
  expect(saveJobCvProfile(data, cv, now)).toBe(data);
  expect(
    saveJobCvProfile(data, cv + "\nNy roll 2026.", now).jobSearch?.cvProfile
      ?.checks,
  ).toEqual([]);
  expect(removeJobCvProfile(data).jobSearch?.cvProfile).toBeUndefined();
});

it("läser inte in förfalskade textstöd, felaktiga statusar eller orimligt stora CV-filer från backup", () => {
  const data = saveJobCvProfile(jobWorkspaceFixture(), cv, now);
  const profile = data.jobSearch!.cvProfile!;
  for (const cvProfile of [
    null,
    {},
    { ...profile, text: "x".repeat(60001) },
    { ...profile, updatedAt: "invalid" },
    { ...profile, checks: [null] },
    {
      ...profile,
      checks: [
        {
          jobKey: job.url,
          kind: "required",
          requirement: "Examen",
          verdict: "supported",
          evidence: "Juristexamen",
        },
      ],
    },
  ])
    expect(() =>
      decodeData(JSON.stringify({ ...data, jobSearch: { cvProfile } })),
    ).toThrow();
});

it("tolkar bara avgränsad navigeringsdata och ignorerar trasig browserlagring", () => {
  const state = {
    tab: "applications",
    lane: "todo",
    query: "Kommunen",
    detailId: "draft",
    lastId: "draft",
    scrolls: { applications: 500, "job:draft": 900 },
  };
  expect(readJobNavigation(JSON.stringify(state))).toEqual(state);
  for (const value of [
    "{",
    "null",
    JSON.stringify({ ...state, tab: "admin" }),
    JSON.stringify({ ...state, scrolls: { applications: -10 } }),
    JSON.stringify({ ...state, query: "x".repeat(301) }),
  ])
    expect(readJobNavigation(value)).toBeNull();
});
