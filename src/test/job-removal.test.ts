import { expect, it } from "vitest";
import { jobWorkspaceFixture, jobDate } from "./fixtures/job-workspace";
import { platsbankenUrl } from "./fixtures/platsbanken-ad";
import {
  dismissJobUrl,
  restoreDismissedJobs,
  removeJobApplication,
} from "../lib/job-removal";
import { careerActions } from "../lib/career-actions";
import { decodeData } from "../lib/storage";

it("sparar bortval och ångrar ett jobb utan att återställa andra bortval eller ändra originalet", () => {
  const original = jobWorkspaceFixture(),
    before = structuredClone(original);
  const first = dismissJobUrl(
    original,
    `${platsbankenUrl}/?utm_source=feed#ansok`,
  );
  const second = dismissJobUrl(
    first,
    "https://se.linkedin.com/jobs/view/utredare-123456/?trk=test",
  );
  expect(second.dismissedJobUrls).toEqual([
    platsbankenUrl,
    "https://www.linkedin.com/jobs/view/123456",
  ]);
  expect(dismissJobUrl(second, `${platsbankenUrl}?utm_source=other`)).toBe(
    second,
  );
  const restored = restoreDismissedJobs(
    second,
    `${platsbankenUrl}?utm_source=other`,
  );
  expect(restored.dismissedJobUrls).toEqual([
    "https://www.linkedin.com/jobs/view/123456",
  ]);
  expect(restoreDismissedJobs(restored).dismissedJobUrls).toEqual([]);
  expect(decodeData(JSON.stringify(second)).dismissedJobUrls).toEqual(
    second.dismissedJobUrls,
  );
  expect(original).toEqual(before);
});

it("tar bort jobbet och dess åtgärder och dagsval, utan att röra andra jobb, kalenderpass eller deadlines", () => {
  const original = jobWorkspaceFixture();
  original.applications![0].advertisement!.url = `${platsbankenUrl}?utm_source=old`;
  original.careerActions = [
    {
      id: "own-step",
      applicationId: "draft",
      title: "Bedöm rollen",
      owner: "Jag",
      date: jobDate,
      kind: "task",
      status: "open",
      reason: "",
    },
    {
      id: "other-step",
      applicationId: "waiting",
      title: "Skriv ett mejl",
      owner: "Jag",
      date: jobDate,
      kind: "task",
      status: "open",
      reason: "",
    },
  ];
  original.dailyCheckIns = {
    [jobDate]: {
      applicationIds: ["draft", "due"],
      contactIds: [],
      completedKeys: ["application:due"],
      deferredKeys: ["application:draft"],
      focus: { kind: "application", id: "draft", title: "Utredare" },
      updatedAt: "2026-11-23T08:00:00Z",
    },
  };
  original.weeks[jobDate].activities.push({
    id: "saved-pass",
    title: "Eget kalenderpass",
    description: "",
    categoryId: original.categories[0].id,
    date: jobDate,
    start: 600,
    end: 660,
    estimatedMinutes: 60,
    blockType: "flexible",
    priority: 1,
    status: "planned",
    source: "manual",
    applicationId: "draft",
    careerActionId: "own-step",
  });
  original.deadlines = [
    {
      id: "deadline",
      title: "Min deadline",
      date: "2026-11-27",
      minute: 960,
      categoryId: original.categories[0].id,
      applicationId: "draft",
      steps: [{ id: "deadline-step", title: "Följ upp", minutes: 30 }],
    },
  ];
  const before = structuredClone(original),
    next = removeJobApplication(original, "draft");
  expect(next.applications).toEqual(before.applications!.slice(1));
  expect(next.careerActions).toEqual([before.careerActions![1]]);
  expect(
    careerActions(next).some((action) => action.applicationId === "draft"),
  ).toBe(false);
  expect(next.dailyCheckIns![jobDate]).toMatchObject({
    applicationIds: ["due"],
    completedKeys: ["application:due"],
    deferredKeys: [],
    focus: { kind: "none", id: "none" },
  });
  expect(next.dismissedJobUrls).toEqual([platsbankenUrl]);
  expect(next.weeks).toEqual(before.weeks);
  expect(next.deadlines).toEqual(before.deadlines);
  expect(next.contacts).toEqual(before.contacts);
  expect(next.tasks).toEqual(before.tasks);
  expect(original).toEqual(before);
  expect(() => decodeData(JSON.stringify(next))).not.toThrow();
  expect(removeJobApplication(next, "draft")).toBe(next);
});

it("kan ta bort jobb utan annonslänk och bevarar befintliga bortval", () => {
  const original = dismissJobUrl(jobWorkspaceFixture(), platsbankenUrl);
  delete original.applications![0].advertisement;
  const next = removeJobApplication(original, "draft");
  expect(next.applications).toHaveLength(3);
  expect(next.dismissedJobUrls).toEqual([platsbankenUrl]);
});

it("nekar trasiga eller aktiva länkar i backupens bortval och accepterar äldre data", () => {
  const data = jobWorkspaceFixture();
  expect(() => decodeData(JSON.stringify(data))).not.toThrow();
  for (const value of [
    "bad",
    [null],
    [42],
    ["javascript:alert(1)"],
    ["https://user:secret@example.org/job"],
    ["https://example.org/" + "x".repeat(2048)],
  ])
    expect(() =>
      decodeData(JSON.stringify({ ...data, dismissedJobUrls: value })),
    ).toThrow("bortvalda jobb");
});
