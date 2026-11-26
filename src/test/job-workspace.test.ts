import { expect, it } from "vitest";
import { jobWorkspace, markApplicationSent } from "../lib/job-workspace";
import { jobWorkspaceFixture } from "./fixtures/job-workspace";
import { decodeData } from "../lib/storage";
import { careerActions } from "../lib/career-actions";
import { actionBookings } from "../lib/action-workflow";
const boundary = { date: "2026-11-23", minute: 540 };
it("samlar nästa steg, väntan och arkiv och ignorerar gamla ansökningsdeadlines för skickade jobb", () => {
  const data = jobWorkspaceFixture(),
    before = structuredClone(data);
  const rows = jobWorkspace(data, boundary);
  expect(rows.find((r) => r.application.id === "draft")).toMatchObject({
    lane: "todo",
    primary: "Fortsätt ansökan",
  });
  expect(rows.find((r) => r.application.id === "waiting")).toMatchObject({
    lane: "waiting",
    date: "2026-11-26",
    primary: "Visa ansökan",
  });
  expect(rows.find((r) => r.application.id === "due")).toMatchObject({
    lane: "todo",
    primary: "Följ upp",
  });
  expect(rows.find((r) => r.application.id === "closed")).toMatchObject({
    lane: "closed",
    primary: "Visa ansökan",
  });
  expect(data).toEqual(before);
  expect(
    jobWorkspace(data, { date: "2026-11-26", minute: 540 }).find(
      (r) => r.application.id === "waiting",
    )?.lane,
  ).toBe("todo");
});
it("låter konkreta uppgifter styra före framtida väntan och bevarar flera steg på samma jobb", () => {
  const data = jobWorkspaceFixture();
  data.careerActions = [
    {
      id: "sample",
      applicationId: "waiting",
      title: "Skicka arbetsprov",
      date: "2026-11-24",
      owner: "Jag",
      kind: "task",
      status: "open",
      reason: "Begärt arbetsprov",
    },
  ];
  const row = jobWorkspace(data, boundary).find(
    (r) => r.application.id === "waiting",
  )!;
  expect(row.lane).toBe("todo");
  expect(row.step?.id).toBe("sample");
  expect(row.steps).toHaveLength(2);
  data.applications![1].status = "rejected";
  expect(
    jobWorkspace(data, boundary).find((r) => r.application.id === "waiting")
      ?.lane,
  ).toBe("closed");
});
it("väljer förberedelse, dokument och intervju efter verkligt underlag och aktuella kalenderpass", () => {
  const data = jobWorkspaceFixture(),
    job = data.applications![0];
  delete job.advertisement;
  expect(
    jobWorkspace(data, boundary).find((r) => r.application.id === "draft")
      ?.primary,
  ).toBe("Förbered ansökan");
  job.advertisement = { url: "https://example.org/annons", text: "Annons" };
  job.materials!.push({
    id: "cv",
    title: "CV",
    kind: "cv",
    url: "https://example.org/cv",
    version: "1",
    sentOn: "",
  });
  expect(
    jobWorkspace(data, boundary).find((r) => r.application.id === "draft")
      ?.primary,
  ).toBe("Fortsätt ansökan");
  job.status = "interview";
  job.nextAction = "";
  expect(
    jobWorkspace(data, boundary).find((r) => r.application.id === "draft")
      ?.primary,
  ).toBe("Boka intervju");
  job.interviews = [
    {
      id: "i",
      title: "Intervju",
      date: "2026-11-25",
      start: 600,
      end: 660,
      meetingActivityId: "meeting",
      location: "",
      preparationNotes: "",
      outcomeNotes: "",
    },
  ];
  expect(
    jobWorkspace(data, boundary).find((r) => r.application.id === "draft")
      ?.primary,
  ).toBe("Förbered intervju");
  expect(
    jobWorkspace(data, { date: "2026-11-26", minute: 540 }).find(
      (r) => r.application.id === "draft",
    )?.primary,
  ).toBe("Följ upp intervjun");
});
it("markerar skickat med ny bevakningsidentitet utan att skriva om bokningar eller dokument", () => {
  const data = jobWorkspaceFixture();
  data.weeks["2026-11-23"].activities.push({
    id: "old-work",
    title: "Förbered ansökan",
    date: "2026-11-23",
    start: 600,
    end: 660,
    estimatedMinutes: 60,
    description: "",
    priority: 3,
    categoryId: "career",
    source: "manual",
    status: "planned",
    blockType: "flexible",
    applicationId: "draft",
    careerActionId: "step-draft",
  });
  const before = structuredClone(data),
    next = markApplicationSent(
      data,
      "draft",
      "2026-11-26",
      new Date("2026-11-23T09:00:00Z"),
    );
  expect(data).toEqual(before);
  expect(next.weeks).toBe(data.weeks);
  const job = next.applications![0];
  expect(job.status).toBe("sent");
  expect(job.nextActionKind).toBe("waiting");
  expect(job.nextActionId).not.toBe("step-draft");
  expect(job.advertisement).toEqual(data.applications![0].advertisement);
  expect(job.materials).toEqual(data.applications![0].materials);
  expect(
    job.history?.some((e) => e.kind === "status" && e.status === "sent"),
  ).toBe(true);
  const action = careerActions(next).find((a) => a.applicationId === "draft")!;
  expect(actionBookings(next, action)).toEqual([]);
  expect(
    jobWorkspace(next, boundary).find((r) => r.application.id === "draft")
      ?.lane,
  ).toBe("waiting");
  expect(() => decodeData(JSON.stringify(next))).not.toThrow();
});
it("kräver aktuell status och giltigt bevakningsdatum och tillåter att vänta utan datum", () => {
  const data = jobWorkspaceFixture(),
    now = new Date("2026-11-23T09:00:00Z");
  expect(() => markApplicationSent(data, "waiting", "", now)).toThrow("utkast");
  expect(() => markApplicationSent(data, "draft", "2026-11-22", now)).toThrow(
    "datum",
  );
  expect(() => markApplicationSent(data, "draft", "2026-02-30", now)).toThrow(
    "datum",
  );
  const next = markApplicationSent(data, "draft", "", now);
  expect(next.applications![0].nextAction).toBe("");
  expect(
    jobWorkspace(next, boundary).find((r) => r.application.id === "draft")
      ?.lane,
  ).toBe("waiting");
});
