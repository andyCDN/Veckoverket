import { it, expect } from "vitest";
import { createData } from "../lib/defaults";
import {
  linkedInJobUrl,
  linkedInDrafts,
  importLinkedInJobs,
} from "../lib/linkedin-import";
import { careerActions } from "../lib/career-actions";
import { decodeData } from "../lib/storage";
it("normaliserar jobb-id från annons, landsdomän, slug och sparade jobblistor", () => {
  for (const url of [
    "https://www.linkedin.com/jobs/view/123456/?trk=abc",
    "https://se.linkedin.com/jobs/view/utvecklare-at-bolag-123456/",
    "https://www.linkedin.com/jobs/collections/saved/?currentJobId=123456",
    "linkedin.com/jobs/view/123456",
    "http://www.linkedin.com/comm/jobs/view/123456/",
    "https://www.linkedin.com/jobs/search/?currentJobId=123456",
  ])
    expect(linkedInJobUrl(url)).toBe(
      "https://www.linkedin.com/jobs/view/123456/",
    );
});
it("godtar inte generella jobblistor, förväxlingsdomäner, inloggningsuppgifter eller skript", () => {
  for (const url of [
    "https://www.linkedin.com/jobs/collections/saved/",
    "https://linkedin.com.evil.test/jobs/view/123/",
    "https://user:pass@linkedin.com/jobs/view/123/",
    "https://www.linkedin.com:8443/jobs/view/123/",
    "javascript:alert(1)",
    "https://www.linkedin.com/jobs/view/123abc",
    "https://www.linkedin.com/jobs/search/?currentJobId=xxx",
  ])
    expect(linkedInJobUrl(url)).toBeNull();
});
it("hittar dubbletter i registret och samma import utan att ändra befintliga ansökningar", () => {
  const d = createData();
  d.applications = [
    {
      id: "old",
      organization: "B",
      role: "R",
      status: "closed",
      deadline: "",
      nextAction: "",
      followUpDate: "",
      notes: "Bevara",
      advertisement: {
        url: "https://linkedin.com/jobs/view/123/?trackingId=abc",
        text: "Annons",
      },
    },
  ];
  const drafts = linkedInDrafts(
    "https://www.linkedin.com/jobs/view/123/\nhttps://www.linkedin.com/jobs/view/456/\nhttps://se.linkedin.com/jobs/view/title-456/?trk=def\ninte en länk",
    d.applications,
  );
  expect(drafts.map((x) => x.selected)).toEqual([false, true, false, false]);
  const result = importLinkedInJobs(
    d,
    drafts.map((x) => ({ ...x, role: "Utredare", organization: "Kommunen" })),
  );
  expect(result.added).toHaveLength(1);
  expect(result.data.applications![0]).toEqual(d.applications[0]);
  expect(d.applications).toHaveLength(1);
  expect(() => decodeData(JSON.stringify(result.data))).not.toThrow();
});
it("skapar en kanonisk ansökan med samma nästa steg, utan kalenderbokning", () => {
  const d = createData();
  d.applications = [];
  const drafts = linkedInDrafts(
    "https://se.linkedin.com/jobs/view/456/?trackingId=secret",
    [],
  );
  Object.assign(drafts[0], {
    role: " Utredare ",
    organization: " Kommunen ",
    deadline: "2026-12-01",
    nextAction: "Förbered ansökan",
    followUpDate: "2026-11-11",
  });
  const result = importLinkedInJobs(d, drafts),
    a = result.added[0];
  expect(a).toMatchObject({
    role: "Utredare",
    organization: "Kommunen",
    status: "draft",
    advertisement: { url: "https://www.linkedin.com/jobs/view/456/", text: "" },
  });
  expect(a.history?.[0].kind).toBe("created");
  expect(
    careerActions(result.data).find((step) => step.applicationId === a.id),
  ).toMatchObject({
    id: a.nextActionId,
    title: "Förbered ansökan",
    date: "2026-11-11",
  });
  expect(result.data.weeks).toBe(d.weeks);
  expect(importLinkedInJobs(result.data, drafts).added).toHaveLength(0);
});
it("kontrollerar hela batchen före sparning och bevarar bortvalda jobb", () => {
  const d = createData();
  d.applications = [];
  const drafts = linkedInDrafts(
    "https://linkedin.com/jobs/view/111/\nhttps://linkedin.com/jobs/view/222/",
    [],
  );
  Object.assign(drafts[0], { role: "R", organization: "O" });
  expect(() => importLinkedInJobs(d, drafts)).toThrow("Fyll i");
  expect(d.applications).toEqual([]);
  drafts[1].selected = false;
  expect(importLinkedInJobs(d, drafts).added).toHaveLength(1);
  drafts[0].deadline = "2026-02-31";
  expect(() => importLinkedInJobs(d, drafts)).toThrow("datum");
});
it("begränsar batchstorleken och tillåter jobb utan nästa steg", () => {
  expect(() => linkedInDrafts("", [])).toThrow();
  expect(() =>
    linkedInDrafts(
      Array(101).fill("https://linkedin.com/jobs/view/1/").join("\n"),
      [],
    ),
  ).toThrow("100");
  const d = createData();
  d.applications = [];
  const drafts = linkedInDrafts("https://linkedin.com/jobs/view/456/", []);
  Object.assign(drafts[0], { role: "R", organization: "O", nextAction: "" });
  const result = importLinkedInJobs(d, drafts);
  expect(result.added[0].followUpDate).toBe("");
  expect(careerActions(result.data)).toHaveLength(0);
});
