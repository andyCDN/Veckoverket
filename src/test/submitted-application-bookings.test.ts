import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createData } from "../lib/defaults";
import { nextSteps } from "../lib/next-steps";
import { followUps } from "../lib/follow-up";
import {
  bookDeadlineWork,
  deadlineWork,
  upcomingDeadlineWork,
} from "../lib/deadline-scheduling";
import { planDeadline } from "../lib/career-planning";
import { dailyChoices } from "../lib/daily-start";
import { decodeData } from "../lib/storage";
import type { Activity, ApplicationStatus } from "../lib/types";
const week = "2026-11-09",
  boundary = { date: "2026-11-11", minute: 600 };
function fixture(status: ApplicationStatus = "sent") {
  const data = createData();
  data.goals = [];
  data.tasks = [];
  data.habits = [];
  data.contacts = [];
  data.careerActions = [];
  data.applications = [
    {
      id: "kuf",
      organization: "KuF",
      role: "Chefssekreterare",
      status,
      deadline: "2026-11-13",
      nextAction: "",
      followUpDate: "",
      notes: "Bevara min anteckning",
    },
  ];
  data.deadlines = [
    {
      id: "submission",
      applicationId: "kuf",
      title: "Chefssekreterare · KuF",
      date: "2026-11-13",
      minute: 960,
      categoryId: "career",
      steps: [
        { id: "cv", title: "Anpassa CV", minutes: 30 },
        { id: "send", title: "Skicka ansökan", minutes: 15 },
      ],
    },
  ];
  const pass = (id: string, extra: Partial<Activity>): Activity => ({
    id,
    title: "Chefssekreterare · KuF",
    date: "2026-11-11",
    start: 660,
    end: 690,
    estimatedMinutes: 30,
    categoryId: "career",
    status: "skipped",
    source: "manual",
    blockType: "flexible",
    priority: 3,
    description: "",
    ...extra,
  });
  data.weeks = {
    [week]: {
      week,
      generatedAt: "",
      activities: [
        pass("explicit-missed", {
          deadlineId: "submission",
          deadlineStepId: "cv",
        }),
        pass("fallback-missed", {
          applicationId: "kuf",
          deadlineId: "application-deadline-kuf",
          deadlineStepId: "work",
        }),
        pass("completed", {
          status: "done",
          applicationId: "kuf",
          deadlineId: "submission",
          deadlineStepId: "send",
        }),
        pass("planned-preparation", {
          status: "planned",
          applicationId: "kuf",
          deadlineId: "submission",
          deadlineStepId: "cv",
        }),
        pass("network-missed", {
          title: "Kontakta nätverket",
          categoryId: "networking",
        }),
      ],
    },
  };
  return data;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("ansökningsplanering efter att ansökan skickats", () => {
  it.each(["sent", "interview", "offer", "rejected", "closed"] as const)(
    "återupplivar inte ansökningsarbete i status %s",
    (status) => {
      const data = fixture(status),
        before = structuredClone(data);
      expect(deadlineWork(data)).toEqual([]);
      expect(upcomingDeadlineWork(data, boundary.date)).toEqual([]);
      expect(followUps(data).map((item) => item.activity.id)).toEqual([
        "network-missed",
      ]);
      expect(
        nextSteps(data, week).filter((item) =>
          item.title.includes("Chefssekreterare"),
        ),
      ).toEqual([]);
      expect(
        dailyChoices(data, boundary).some(
          (item) => item.activity?.id === "planned-preparation",
        ),
      ).toBe(false);
      for (const id of ["submission", "application-deadline-kuf"]) {
        const result = bookDeadlineWork(data, id, boundary);
        expect(result.errors).toHaveLength(1);
        expect(result.activities).toEqual([]);
        expect(result.data).toBe(data);
      }
      const direct = planDeadline(data, data.deadlines![0], boundary, {
        onlyMissing: true,
      });
      expect(direct.errors[0]).toContain("inte längre ett utkast");
      expect(direct.data).toBe(data);
      expect(data).toEqual(before);
      expect(decodeData(JSON.stringify(data))).toEqual(before);
    },
  );
  it("behåller verkliga uppföljningar och intervjuer för en skickad ansökan", () => {
    const data = fixture();
    data.applications![0].nextAction = "Bekräfta intervjutid";
    data.applications![0].followUpDate = boundary.date;
    data.weeks[week].activities.push({
      ...data.weeks[week].activities[0],
      id: "interview",
      title: "Intervju",
      applicationId: "kuf",
      deadlineId: undefined,
      deadlineStepId: undefined,
    });
    expect(
      nextSteps(data, week).filter((item) => item.kind === "career"),
    ).toMatchObject([{ title: "Bekräfta intervjutid", label: "Boka tid" }]);
    expect(followUps(data).map((item) => item.activity.id)).toContain(
      "interview",
    );
  });
  it("följer aktuell status även för gamla data och återaktiverar planeringen om ansökan åter blir utkast", () => {
    const data = fixture();
    expect(deadlineWork(data)).toEqual([]);
    data.applications![0].status = "draft";
    expect(deadlineWork(data).map((item) => item.deadline.id)).toEqual([
      "submission",
    ]);
    expect(followUps(data).map((item) => item.activity.id)).toEqual([
      "explicit-missed",
      "fallback-missed",
      "network-missed",
    ]);
  });
  it("behåller fristående deadlines och äldre referenser utan kvarvarande ansökan", () => {
    const data = fixture();
    data.deadlines!.push({
      ...data.deadlines![0],
      id: "standalone",
      applicationId: undefined,
      title: "Fristående leverans",
    });
    expect(deadlineWork(data).map((item) => item.deadline.id)).toEqual([
      "standalone",
    ]);
    data.applications = [];
    expect(deadlineWork(data).map((item) => item.deadline.id)).toEqual([
      "standalone",
      "submission",
    ]);
  });
});
