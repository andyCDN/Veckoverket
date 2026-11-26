import { afterEach, expect, it, vi } from "vitest";
import { applicationFlowFixture } from "./fixtures/application-flow";
import { jobDate } from "./fixtures/job-workspace";
import { platsbankenAd, platsbankenUrl } from "./fixtures/platsbanken-ad";
import {
  applicationStage,
  suggestedFollowUpDate,
  updateApplicationPreparation,
  updateApplicationFollowUp,
} from "../lib/application-flow";
import {
  applicationAdvertisementUrls,
  jobMatches,
  mergeJobAdvertisement,
  sameJobTitle,
} from "../lib/job-identity";
import {
  assignJobsToSession,
  jobSearchSessions,
  jobSessionApplications,
} from "../lib/job-search-sessions";
import { readJobAdvertisement } from "../lib/job-ad-reader";
import { markApplicationSent, jobWorkspace } from "../lib/job-workspace";
import { decodeData } from "../lib/storage";
import { linkedInDrafts, importLinkedInJobs } from "../lib/linkedin-import";
import { removeJobApplication } from "../lib/job-removal";

const now = new Date("2026-11-23T08:00:00Z"),
  boundary = { date: jobDate, minute: 540 },
  target = { week: jobDate, activityId: "search-pass" };
afterEach(() => {
  vi.unstubAllGlobals();
});
it("flerimport kräver granskning av samma titel och arbetsgivare även mellan olika källor", () => {
  const data = applicationFlowFixture();
  const draft = linkedInDrafts(
    "https://www.linkedin.com/jobs/view/888888/",
    [],
  )[0];
  draft.role = "Utredare";
  draft.organization = "Kommunen";
  expect(() => importLinkedInJobs(data, [draft])).toThrow(
    "Möjlig dubblett mellan annonskällor",
  );
  draft.separateConfirmed = true;
  expect(importLinkedInJobs(data, [draft]).added).toHaveLength(1);
  expect(data.applications).toHaveLength(5);
});
it("ändrar bevakningen för skickade ansökningar utan att skriva om dokument eller egna nästa steg", () => {
  const data = markApplicationSent(
      applicationFlowFixture(),
      "draft",
      "2026-11-30",
      now,
    ),
    before = structuredClone(data);
  const changed = updateApplicationFollowUp(data, "draft", "2026-12-02", now);
  expect(changed.applications![0].status).toBe("sent");
  expect(changed.applications![0].followUpDate).toBe("2026-12-02");
  expect(changed.applications![0].materials).toEqual(
    before.applications![0].materials,
  );
  expect(changed.weeks).toEqual(before.weeks);
  expect(
    updateApplicationFollowUp(changed, "draft", "", now).applications![0]
      .nextAction,
  ).toBe("");
  data.applications![0].nextAction = "Be om referenser";
  data.applications![0].nextActionKind = "task";
  expect(
    updateApplicationFollowUp(data, "draft", "2026-12-03", now).applications![0]
      .nextAction,
  ).toBe("Be om referenser");
  expect(() =>
    updateApplicationFollowUp(data, "draft", "2026-11-22", now),
  ).toThrow("uppföljningsdatum");
  expect(() =>
    updateApplicationFollowUp(data, "second", "2026-11-30", now),
  ).toThrow("väntan på svar");
});
it("går från CV till ansökan utan att öppnad sida tolkas som skickad och bevarar underlag", () => {
  const original = applicationFlowFixture(),
    before = structuredClone(original);
  expect(applicationStage(original.applications![0])).toBe("cv");
  const ready = updateApplicationPreparation(
    original,
    "draft",
    "cv-ready",
    "https://example.org/cv-v2",
    now,
  );
  expect(applicationStage(ready.applications![0])).toBe("apply");
  expect(
    jobWorkspace(ready, boundary).find((row) => row.application.id === "draft")
      ?.next,
  ).toBe("Öppna ansökningssidan");
  expect(ready.applications![0].materials).toHaveLength(2);
  expect(ready.applications![0].materials![0]).toEqual(
    before.applications![0].materials![0],
  );
  const opened = updateApplicationPreparation(
    ready,
    "draft",
    "application-opened",
    "",
    now,
  );
  expect(applicationStage(opened.applications![0])).toBe("send");
  expect(opened.applications![0].status).toBe("draft");
  expect(opened.weeks).toEqual(before.weeks);
  expect(original).toEqual(before);
  const newer = updateApplicationPreparation(
    ready,
    "draft",
    "cv-ready",
    "https://example.org/cv-v3",
    now,
  );
  expect(newer.applications![0].materials).toHaveLength(3);
  expect(
    newer.applications![0].materials!.some(
      (material) => material.url === "https://example.org/cv-v2",
    ),
  ).toBe(true);
  expect(() => decodeData(JSON.stringify(opened))).not.toThrow();
  expect(() =>
    updateApplicationPreparation(
      original,
      "draft",
      "cv-ready",
      "javascript:alert(1)",
      now,
    ),
  ).toThrow("giltig länk");
  expect(() =>
    updateApplicationPreparation(original, "waiting", "cv-ready", "", now),
  ).toThrow("inte längre ett utkast");
});
it("föreslår sju dagar framåt och stänger förberedelseuppgifter men behåller andra uppgifter och kalenderutfall", () => {
  const data = applicationFlowFixture();
  data.careerActions = [
    {
      id: "cv-step",
      title: "Anpassa CV",
      applicationId: "draft",
      date: jobDate,
      owner: "Jag",
      reason: "",
      status: "open",
      kind: "task",
    },
    {
      id: "reference",
      title: "Be om referenser",
      applicationId: "draft",
      date: "2026-11-30",
      owner: "Jag",
      reason: "",
      status: "open",
      kind: "task",
    },
  ];
  expect(suggestedFollowUpDate("2026-11-26")).toBe("2026-12-03");
  const next = markApplicationSent(
    data,
    "draft",
    suggestedFollowUpDate(jobDate),
    now,
  );
  expect(next.applications![0]).toMatchObject({
    status: "sent",
    followUpDate: "2026-11-30",
    nextActionKind: "waiting",
  });
  expect(next.careerActions![0].status).toBe("done");
  expect(next.careerActions![1]).toEqual(data.careerActions[1]);
  expect(next.weeks).toEqual(data.weeks);
  expect(() => markApplicationSent(data, "draft", "2026-11-22", now)).toThrow(
    "uppföljningsdatum",
  );
  expect(
    markApplicationSent(data, "draft", "", now).applications![0].nextAction,
  ).toBe("");
});
it("kopplar en ordnad jobbkö till ett befintligt pass och bevarar tider, regler och antal pass", () => {
  const data = applicationFlowFixture(),
    before = structuredClone(data);
  const next = assignJobsToSession(data, target, ["second", "draft"], boundary);
  expect(next.weeks[jobDate].activities).toHaveLength(1);
  const { jobApplicationIds, ...unchanged } = next.weeks[jobDate].activities[0];
  expect(jobApplicationIds).toEqual(["second", "draft"]);
  expect(unchanged).toEqual(before.weeks[jobDate].activities[0]);
  expect(next.settings).toEqual(before.settings);
  expect(next.recurring).toEqual(before.recurring);
  expect(next.applications).toEqual(before.applications);
  expect(data).toEqual(before);
  const sent = markApplicationSent(next, "second", "2026-11-30", now);
  expect(
    jobSessionApplications(sent, sent.weeks[jobDate].activities[0])
      .filter((job) => job.status === "draft")
      .map((job) => job.id),
  ).toEqual(["draft"]);
  expect(() => decodeData(JSON.stringify(next))).not.toThrow();
});
it("nekar nya eller passerade pass, intervjuer, dubbletter och utgångna eller redan skickade jobb", () => {
  const data = applicationFlowFixture();
  for (const ids of [["missing"], ["waiting"], ["draft", "draft"]])
    expect(() => assignJobsToSession(data, target, ids, boundary)).toThrow(
      "aktuella utkast",
    );
  expect(() =>
    assignJobsToSession(
      data,
      { week: jobDate, activityId: "new-pass" },
      ["draft"],
      boundary,
    ),
  ).toThrow("befintligt");
  expect(() =>
    assignJobsToSession(data, target, ["draft"], {
      date: jobDate,
      minute: 631,
    }),
  ).toThrow("befintligt");
  data.applications![0].deadline = "2026-11-22";
  expect(() => assignJobsToSession(data, target, ["draft"], boundary)).toThrow(
    "aktuella utkast",
  );
  data.weeks[jobDate].activities[0].applicationId = "draft";
  expect(jobSearchSessions(data, boundary)).toEqual([]);
});
it("identifierar samma tjänst på olika källor utan att slå ihop olika roller eller arbetsgivare", () => {
  const data = applicationFlowFixture(),
    existing = data.applications![0];
  const incoming = {
    ...structuredClone(existing),
    id: "incoming",
    role: "UTREDARE – till Kommunen",
    organization: "Kommunen",
    advertisement: {
      url: "https://www.linkedin.com/jobs/view/123456/",
      text: "En annan källas text",
    },
  };
  expect(sameJobTitle(existing, incoming)).toBe(true);
  expect(jobMatches(incoming, data.applications!)).toMatchObject([
    { job: { id: "draft" }, reason: "title" },
  ]);
  expect(
    sameJobTitle(existing, { role: "Handläggare", organization: "Kommunen" }),
  ).toBe(false);
  expect(
    sameJobTitle(existing, { role: "Utredare", organization: "Regionen" }),
  ).toBe(false);
  expect(
    sameJobTitle(
      { role: "Designer", organization: "Formbolaget AB" },
      { role: "DESIGNER", organization: "Formbolaget" },
    ),
  ).toBe(true);
});
it("samlar annonskällor under befintlig ansökan med bevarad status, egna texter, dokument och kalender", () => {
  const data = applicationFlowFixture();
  data.applications![0].status = "sent";
  const before = structuredClone(data),
    incoming = {
      ...structuredClone(data.applications![0]),
      id: "incoming",
      advertisement: {
        url: platsbankenUrl,
        text: "Ny text",
        additionalUrls: ["https://www.linkedin.com/jobs/view/123456/?trk=new"],
      },
    };
  const next = mergeJobAdvertisement(data, "draft", incoming, now),
    job = next.applications![0];
  expect(next.applications).toHaveLength(data.applications!.length);
  expect(job.status).toBe("sent");
  expect(job.advertisement!.text).toBe(
    before.applications![0].advertisement!.text,
  );
  expect(applicationAdvertisementUrls(job)).toContain(platsbankenUrl);
  expect(job.materials).toEqual(before.applications![0].materials);
  expect(job.history!.slice(0, -1)).toEqual(before.applications![0].history);
  expect(next.weeks).toEqual(before.weeks);
  expect(data).toEqual(before);
  expect(
    jobMatches(
      {
        ...incoming,
        advertisement: {
          url: "https://se.linkedin.com/jobs/view/123456/",
          text: "",
        },
      },
      next.applications!,
    )[0].reason,
  ).toBe("url");
  expect(
    linkedInDrafts(
      "https://www.linkedin.com/jobs/view/123456/",
      next.applications!,
    )[0].issue,
  ).toContain("Finns redan");
  const draft = linkedInDrafts(
    "https://www.linkedin.com/jobs/view/123456/",
    [],
  )[0];
  draft.role = "Utredare";
  draft.organization = "Kommunen";
  expect(importLinkedInJobs(next, [draft]).added).toHaveLength(0);
  expect(() => decodeData(JSON.stringify(next))).not.toThrow();
});
it("raderade jobb försvinner även ur passkön och samtliga annonskällor väljs bort", () => {
  let data = assignJobsToSession(
    applicationFlowFixture(),
    target,
    ["draft", "second"],
    boundary,
  );
  data = mergeJobAdvertisement(
    data,
    "draft",
    {
      ...data.applications![0],
      id: "new",
      advertisement: { url: platsbankenUrl, text: "" },
    },
    now,
  );
  const next = removeJobApplication(data, "draft");
  expect(next.weeks[jobDate].activities[0].jobApplicationIds).toEqual([
    "second",
  ]);
  expect(next.weeks[jobDate].activities[0].start).toBe(540);
  expect(next.dismissedJobUrls).toContain(platsbankenUrl);
  expect(next.dismissedJobUrls).toContain("https://example.org/jobs/utredare");
});
it("läser en entydig Platsbanken-annons från jobbspaningens titel och organisation utan kontotoken", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      hits: [
        {
          ...platsbankenAd,
          application_details: { url: "https://example.org/apply" },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const details = await readJobAdvertisement(
    "https://www.naturvardsverket.se/jobs/project",
    new AbortController().signal,
    {
      role: "Projektledare för regeringsuppdrag",
      organization: "Naturvårdsverket",
    },
  );
  expect(details.description).toBe(platsbankenAd.description.text);
  expect(details.additionalUrls).toEqual([platsbankenUrl]);
  expect(details.applicationUrl).toBe("https://example.org/apply");
  expect(String(fetcher.mock.calls[0][0])).toContain(
    "https://jobsearch.api.jobtechdev.se/search?",
  );
  expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(
    /Authorization|apikey/,
  );
  expect(fetcher.mock.calls[0][1]?.credentials).toBe("omit");
});
it("väljer inte mellan flera likadana annonser eller en annan arbetsgivare", async () => {
  for (const hits of [
    [platsbankenAd, { ...platsbankenAd, id: "999" }],
    [{ ...platsbankenAd, employer: { name: "En annan myndighet" } }],
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ hits })),
    );
    await expect(
      readJobAdvertisement(
        "https://example.org/ad",
        new AbortController().signal,
        {
          role: "Projektledare för regeringsuppdrag",
          organization: "Naturvårdsverket",
        },
      ),
    ).rejects.toThrow("Ingen entydig annons");
  }
});
it("validerar nya arbetssteg, källor och passköer vid backupinläsning", () => {
  const data = applicationFlowFixture();
  for (const queue of [
    ["draft", "draft"],
    [42],
    "draft",
    Array(21).fill("draft"),
  ])
    expect(() =>
      decodeData(
        JSON.stringify({
          ...data,
          weeks: {
            [jobDate]: {
              ...data.weeks[jobDate],
              activities: [
                {
                  ...data.weeks[jobDate].activities[0],
                  jobApplicationIds: queue,
                },
              ],
            },
          },
        }),
      ),
    ).toThrow();
  for (const advertisement of [
    { url: platsbankenUrl, text: "", additionalUrls: ["javascript:alert(1)"] },
    { url: platsbankenUrl, text: "", applicationUrl: "javascript:alert(1)" },
  ])
    expect(() =>
      decodeData(
        JSON.stringify({
          ...data,
          applications: [{ ...data.applications![0], advertisement }],
        }),
      ),
    ).toThrow("Annonsunderlaget");
  expect(() =>
    decodeData(
      JSON.stringify({
        ...data,
        applications: [
          { ...data.applications![0], preparation: { cvReadyAt: "bad" } },
        ],
      }),
    ),
  ).toThrow("arbetssteg");
});
