import { expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { actionBookings, actionWorkflow } from "../lib/action-workflow";
import { bookCareerAction, careerActions } from "../lib/career-actions";
import type { Activity, AppData } from "../lib/types";

const boundary = { date: "2026-11-05", minute: 600 };
function fixture() {
  const data = createData();
  data.settings = {
    ...data.settings,
    start: 480,
    end: 1020,
    lunchStart: 720,
    lunchEnd: 780,
    familyStart: 1020,
    familyEnd: 1080,
    buffer: 0,
    musicMornings: 0,
    trainingSessions: 0,
  };
  data.applications = [
    {
      id: "a",
      organization: "Stadshuset",
      role: "Utredare",
      status: "sent",
      nextAction: "Skicka arbetsprov",
      nextActionId: "step",
      nextActionKind: "task",
      nextActionOwner: "Jag",
      followUpDate: "2026-11-06",
      deadline: "",
      notes: "",
    },
  ];
  for (const week of ["2026-11-02", "2026-11-09"])
    data.weeks[week] = {
      week,
      generatedAt: "",
      weeklyRoutinesFrom: week,
      activities: [],
    };
  return data;
}
const step = (data: AppData) => careerActions(data)[0];
const activity = (patch: Partial<Activity> = {}): Activity => ({
  id: "pass",
  title: "Skicka arbetsprov",
  applicationId: "a",
  date: "2026-11-05",
  start: 660,
  end: 690,
  estimatedMinutes: 30,
  categoryId: "career",
  description: "",
  priority: 3,
  blockType: "flexible",
  source: "manual",
  status: "planned",
  ...patch,
});

it("links a booking to the existing next step and rejects a second booking without changing data", () => {
  const data = fixture();
  const result = bookCareerAction(
    data,
    "step",
    "2026-11-05",
    660,
    30,
    boundary,
  );
  expect(result.errors).toEqual([]);
  expect(result.activities[0]).toMatchObject({
    careerActionId: "step",
    applicationId: "a",
    title: "Skicka arbetsprov",
  });
  expect(actionWorkflow(result.data, step(result.data), boundary).primary).toBe(
    "Öppna bokat pass",
  );
  const again = bookCareerAction(
    result.data,
    "step",
    "2026-11-05",
    800,
    30,
    boundary,
  );
  expect(again.errors).toHaveLength(1);
  expect(again.data).toBe(result.data);
  expect(data.weeks["2026-11-02"].activities).toHaveLength(0);
});

it("recognizes an older matching booking without rewriting it or attaching unrelated passes", () => {
  const data = fixture();
  const old = activity();
  data.weeks["2026-11-02"].activities = [
    old,
    activity({ id: "other", applicationId: "another-application" }),
  ];
  expect(actionBookings(data, step(data))).toEqual([old]);
  const result = bookCareerAction(
    data,
    "step",
    "2026-11-05",
    800,
    30,
    boundary,
  );
  expect(result.errors).toHaveLength(1);
  expect(result.data).toBe(data);
  expect(old.careerActionId).toBeUndefined();
});

it("requires explicit task completion after a completed calendar pass", () => {
  const data = fixture();
  data.weeks["2026-11-02"].activities = [
    activity({ careerActionId: "step", status: "done" }),
  ];
  expect(actionWorkflow(data, step(data), boundary)).toMatchObject({
    stage: "confirm",
    primary: "Markera nästa steg klart",
  });
  expect(data.applications![0].nextAction).toBe("Skicka arbetsprov");
  expect(careerActions(data)[0].status).toBe("open");
});

it("treats a waiting date as a lower bound, permitting a later follow-up and rejecting earlier work", () => {
  const data = fixture();
  data.applications![0].nextActionKind = "waiting";
  data.applications![0].nextActionOwner = "Kim";
  const before = bookCareerAction(
    data,
    "step",
    "2026-11-05",
    660,
    30,
    boundary,
  );
  expect(before.errors).toHaveLength(1);
  const later = bookCareerAction(data, "step", "2026-11-09", 660, 30, boundary);
  expect(later.errors).toEqual([]);
  expect(later.activities[0].title).toBe("Följ upp: Skicka arbetsprov");
  expect(data.weeks["2026-11-09"].activities).toHaveLength(0);
});

it("asks for a new date for overdue work and a monitoring date for undated waiting", () => {
  const data = fixture();
  data.applications![0].followUpDate = "2026-11-04";
  expect(actionWorkflow(data, step(data), boundary).primary).toBe(
    "Välj nytt datum",
  );
  data.applications![0].nextActionKind = "waiting";
  data.applications![0].followUpDate = "";
  expect(actionWorkflow(data, step(data), boundary).primary).toBe(
    "Välj bevakningsdatum",
  );
  expect(
    bookCareerAction(data, "step", "2026-11-05", 660, 30, boundary).errors,
  ).toHaveLength(1);
});

it("keeps waiting open after a completed follow-up instead of inferring that a reply arrived", () => {
  const data = fixture();
  data.applications![0].nextActionKind = "waiting";
  data.weeks["2026-11-02"].activities = [
    activity({ careerActionId: "step", status: "done" }),
  ];
  expect(actionWorkflow(data, step(data), boundary)).toMatchObject({
    stage: "unbooked",
    primary: "Boka ny uppföljning",
  });
  expect(careerActions(data)[0].status).toBe("open");
});
