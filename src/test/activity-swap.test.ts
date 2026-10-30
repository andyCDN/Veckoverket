import { expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { swapActivities } from "../lib/activity-swap";
import type { Activity } from "../lib/types";
const week = "2026-11-02";
function fixture() {
  const data = createData();
  data.settings.autoPlanning = true;
  const make = (
    id: string,
    date: string,
    start: number,
    end: number,
    extra: Partial<Activity> = {},
  ): Activity => ({
    id,
    title: id,
    description: "Anteckning",
    categoryId: "career",
    date,
    start,
    end,
    estimatedMinutes: end - start,
    blockType: "protected",
    priority: 3,
    status: "planned",
    source: "generated",
    ...extra,
  });
  const first = make("first-pass", week, 510, 600, {
      applicationId: "application",
      goalId: "goal",
    }),
    second = make("second-pass", "2026-11-03", 630, 690, {
      categoryId: "learning",
      contactId: "contact",
    }),
    done = make("completed-pass", "2026-11-04", 510, 600, { status: "done" });
  data.weeks = {
    [week]: { week, generatedAt: "", activities: [first, second, done] },
    "2026-10-26": { week: "2026-10-26", generatedAt: "", activities: [] },
  };
  return { data, first, second, done, make };
}
it("swaps starts atomically, keeps durations and links, and leaves all other bookings unchanged with automatic planning enabled", () => {
  const f = fixture(),
    before = structuredClone(f.data);
  const result = swapActivities(f.data, week, f.first.id, f.second.id);
  expect(result.error).toBeUndefined();
  expect(result.data.weeks[week].activities).toEqual([
    { ...f.first, date: f.second.date, start: 630, end: 720, source: "manual" },
    { ...f.second, date: f.first.date, start: 510, end: 570, source: "manual" },
    f.done,
  ]);
  expect(result.data.weeks["2026-10-26"]).toBe(f.data.weeks["2026-10-26"]);
  expect(f.data).toEqual(before);
});
it("rejects completed, skipped, locked, imported and immovable targets without changing the plan", () => {
  for (const patch of [
    { status: "done" },
    { status: "skipped" },
    { blockType: "locked" },
    { categoryId: "family" },
    { categoryId: "music" },
  ]) {
    const f = fixture();
    Object.assign(f.second, patch);
    expect(swapActivities(f.data, week, f.first.id, f.second.id).data).toBe(
      f.data,
    );
    expect(
      swapActivities(f.data, week, f.first.id, f.second.id).error,
    ).toBeTruthy();
  }
  const f = fixture();
  f.second.external = {
    provider: "google-calendar",
    calendarId: "c",
    eventId: "e",
    allDay: false,
    busy: true,
    originalStart: "",
    originalEnd: "",
  };
  expect(swapActivities(f.data, week, f.first.id, f.second.id).data).toBe(
    f.data,
  );
});
it("rejects a longer pass that would overlap a third booking, without replanning it", () => {
  const f = fixture();
  f.data.weeks[week].activities.push(
    f.make("third-pass", f.second.date, 700, 760),
  );
  const result = swapActivities(f.data, week, f.first.id, f.second.id);
  expect(result.error).toContain("överlappar");
  expect(result.data).toBe(f.data);
});
it("uses the saved week's availability and buffer rules", () => {
  const f = fixture();
  f.data.weeks[week].rules = { ...f.data.settings, end: 700 };
  const result = swapActivities(f.data, week, f.first.id, f.second.id);
  expect(result.error).toContain("tillgängliga tid");
  expect(result.data).toBe(f.data);
});
it("keeps deadline steps before their due time and in their original order", () => {
  const f = fixture();
  f.first.deadlineId = "deadline";
  f.first.deadlineStepId = "work";
  f.data.deadlines = [
    {
      id: "deadline",
      title: "Ansökan",
      date: week,
      minute: 900,
      categoryId: "career",
      steps: [{ id: "work", title: "Arbeta", minutes: 90 }],
    },
  ];
  expect(swapActivities(f.data, week, f.first.id, f.second.id).error).toContain(
    "efter sin deadline",
  );
  f.data.deadlines[0].date = "2026-11-06";
  f.data.deadlines[0].steps.push({ id: "send", title: "Skicka", minutes: 60 });
  f.second.deadlineId = "deadline";
  f.second.deadlineStepId = "send";
  expect(swapActivities(f.data, week, f.first.id, f.second.id).error).toContain(
    "ordningen",
  );
});
it("keeps interview preparation before the interview", () => {
  const f = fixture();
  f.data.applications = [
    {
      id: "application",
      organization: "Bolaget",
      role: "Roll",
      status: "interview",
      deadline: "",
      nextAction: "",
      followUpDate: "",
      notes: "",
      interviews: [
        {
          id: "interview",
          title: "Intervju",
          date: week,
          start: 800,
          end: 860,
          location: "",
          meetingActivityId: "meeting",
          preparationActivityId: f.first.id,
          preparationNotes: "",
          outcomeNotes: "",
        },
      ],
    },
  ];
  expect(swapActivities(f.data, week, f.first.id, f.second.id).error).toContain(
    "före intervjun",
  );
});
