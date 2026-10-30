import { describe, it, expect } from "vitest";
import { createData } from "../lib/defaults";
import { saveApplication } from "../lib/applications";
import {
  careerActions,
  saveCareerAction,
  completeCareerAction,
  bookCareerAction,
} from "../lib/career-actions";
import {
  evidenceSegments,
  importRecordingActions,
  proposedActionDate,
  recordingActionProposals,
} from "../lib/recording-actions";
import { replanDay } from "../lib/career-planning";
import { saveInterviewNotes } from "../lib/application-interviews";
import { decodeData } from "../lib/storage";
import { validatePlan } from "../lib/planner";
import type { Activity } from "../lib/types";
import type {
  RecordingSession,
  RecordingSegment,
} from "../../supabase/functions/_shared/recording-schema";
const week = "2026-10-26",
  date = "2026-10-29",
  now = new Date("2026-10-29T09:00:00Z"),
  boundary = { date, minute: 600 };
const activity = (
  id: string,
  start: number,
  end: number,
  patch: Partial<Activity> = {},
): Activity => ({
  id,
  title: id,
  date,
  start,
  end,
  estimatedMinutes: end - start,
  description: "",
  categoryId: "career",
  blockType: "flexible",
  priority: 3,
  status: "planned",
  source: "manual",
  ...patch,
});
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
    buffer: 10,
    musicMornings: 0,
    trainingSessions: 0,
  };
  data.weeks = {
    [week]: {
      week,
      activities: [activity("done", 480, 510, { status: "done" })],
      generatedAt: "",
      weeklyRoutinesFrom: week,
    },
  };
  data.applications = [
    {
      id: "a",
      organization: "Bolaget",
      role: "Analytiker",
      status: "sent",
      deadline: "",
      nextAction: "Följ upp ansökan",
      followUpDate: date,
      notes: "Bevara anteckning",
    },
  ];
  data.contacts = [
    {
      id: "c",
      name: "Kim",
      organization: "Bolaget",
      nextAction: "Ring Kim",
      followUpDate: "2026-10-28",
      entries: [
        {
          id: "old",
          date: "2026-10-27",
          channel: "Telefon",
          notes: "Tidigare samtal",
        },
      ],
    },
  ];
  return data;
}
const segments: RecordingSegment[] = [
  { index: 0, transcript: "Kim: Jag skickar", durationMs: 20000 },
  {
    index: 1,
    transcript: "länken på fredag. Vi hörs igen.",
    durationMs: 15000,
  },
];
const session: RecordingSession = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Samtal med Kim",
  state: "complete",
  startedAt: "2026-10-29T09:00:00Z",
  segmentCount: 2,
  context: { applicationId: "a", contactId: "c" },
  summary: {
    agreements: [
      {
        text: "Skicka länken",
        owner: "Kim",
        when: "Fredag",
        evidence: "Jag skickar länken på fredag.",
      },
    ],
    nextSteps: [],
    uncertainties: [],
  },
};
describe("sammanhängande nästa steg", () => {
  it("låter en ny uppföljning bokas efter avklarad åtgärd utan att ändra den äldre bokningen", () => {
    const data = fixture(),
      booked = bookCareerAction(data, "application:a", date, 600, 30, now),
      completed = completeCareerAction(booked.data, "application:a", now);
    const app = completed.applications![0];
    completed.applications = [
      saveApplication(
        app,
        { ...app, nextAction: "Ny uppföljning", followUpDate: date },
        now,
      ),
    ];
    expect(
      careerActions(completed).filter((a) => a.status === "done"),
    ).toHaveLength(1);
    const action = careerActions(completed).find(
      (a) => a.applicationId === "a" && a.status === "open",
    )!;
    expect(action.id).not.toBe("application:a");
    const result = bookCareerAction(completed, action.id, date, 650, 30, now);
    expect(result.errors).toEqual([]);
    expect(result.data.weeks[week].activities).toContainEqual(
      booked.activities[0],
    );
  });
  it("kan rundresa maximala anteckningslängder utan ogiltig historik", () => {
    const data = fixture(),
      a = careerActions(data).find((a) => a.applicationId === "a")!;
    const next = saveCareerAction(
      data,
      {
        ...a,
        title: "a".repeat(4000),
        reason: "b".repeat(4000),
        owner: "c".repeat(200),
      },
      now,
    );
    expect(
      decodeData(JSON.stringify(next)).applications![0].nextActionReason,
    ).toHaveLength(4000);
  });
  it("samlar äldre ansökningar och kontakter utan att migrera eller ändra planer", () => {
    const data = fixture(),
      original = structuredClone(data),
      actions = careerActions(data);
    expect(actions.map((a) => a.title)).toEqual([
      "Ring Kim",
      "Följ upp ansökan",
    ]);
    const next = saveCareerAction(
      data,
      {
        ...actions[1],
        owner: "Jag",
        reason: "Rekryteraren bad om återkoppling",
        date: "2026-10-30",
      },
      now,
    );
    expect(next.applications![0]).toMatchObject({
      nextAction: "Följ upp ansökan",
      nextActionReason: "Rekryteraren bad om återkoppling",
      followUpDate: "2026-10-30",
    });
    expect(next.weeks).toBe(data.weeks);
    expect(next.contacts).toBe(data.contacts);
    expect(data).toEqual(original);
    expect(decodeData(JSON.stringify(next))).toEqual(next);
  });
  it("loggar kontaktens genomförande en gång och ändrar inga kalenderutfall", () => {
    const data = fixture(),
      next = completeCareerAction(data, "contact:c", now);
    expect(next.contacts![0].nextAction).toBe("");
    expect(next.contacts![0].entries).toHaveLength(2);
    expect(next.contacts![0].entries[0]).toEqual(data.contacts![0].entries[0]);
    expect(completeCareerAction(next, "contact:c", now)).toBe(next);
    expect(next.weeks).toBe(data.weeks);
  });
  it("bokar runt befintliga tider, avvisar dubbelbokning och bevarar länkar", () => {
    const data = fixture(),
      booked = bookCareerAction(data, "application:a", date, 600, 30, now);
    expect(booked.errors).toEqual([]);
    expect(booked.activities[0]).toMatchObject({
      applicationId: "a",
      careerActionId: "application:a",
      categoryId: "career",
    });
    expect(
      bookCareerAction(booked.data, "application:a", date, 650, 30, now).data,
    ).toBe(booked.data);
    expect(bookCareerAction(data, "contact:c", date, 730, 30, now).data).toBe(
      data,
    );
    expect(booked.data.applications).toBe(data.applications);
    expect(booked.data.weeks[week].activities[0]).toBe(
      data.weeks[week].activities[0],
    );
  });
});
describe("granskade åtgärder från samtal", () => {
  it("hittar citat över två ljuddelar men inte över saknade delar", () => {
    expect(evidenceSegments(segments, "Jag skickar länken på fredag.")).toEqual(
      [0, 1],
    );
    expect(
      evidenceSegments(
        [
          { ...segments[0], index: 0 },
          { ...segments[1], index: 2 },
        ],
        "Jag skickar länken på fredag.",
      ),
    ).toEqual([]);
    expect(evidenceSegments(segments, "Anställningen är klar.")).toEqual([]);
  });
  it("föreslår endast tydliga datum utifrån samtalets datum i Stockholm", () => {
    expect(proposedActionDate("Fredag", session.startedAt)).toBe("2026-10-30");
    expect(proposedActionDate("nästa måndag", session.startedAt)).toBe(
      "2026-11-02",
    );
    expect(proposedActionDate("imorgon", "2026-10-29T23:30:00Z")).toBe(
      "2026-10-31",
    );
    expect(proposedActionDate("nästa vecka", session.startedAt)).toBe("");
    expect(proposedActionDate("2026-02-30", session.startedAt)).toBe("");
  });
  it("importerar valda åtgärder en gång utan att skriva över nästa steg, historik eller planer", () => {
    const data = fixture(),
      original = structuredClone(data),
      proposals = recordingActionProposals(session, segments);
    const next = importRecordingActions(data, session, segments, [
      { ...proposals[0], title: "Kontrollera att länken kommit", owner: "Jag" },
    ]);
    expect(next.careerActions![0]).toMatchObject({
      title: "Kontrollera att länken kommit",
      owner: "Jag",
      date: "2026-10-30",
      source: { segmentIndexes: [0, 1] },
    });
    expect(next.applications).toBe(data.applications);
    expect(next.contacts).toBe(data.contacts);
    expect(next.weeks).toBe(data.weeks);
    expect(importRecordingActions(next, session, segments, proposals)).toBe(
      next,
    );
    const done = completeCareerAction(next, next.careerActions![0].id, now);
    expect(importRecordingActions(done, session, segments, proposals)).toBe(
      done,
    );
    expect(data).toEqual(original);
    expect(decodeData(JSON.stringify(done))).toEqual(done);
  });
  it("avvisar obelagda förslag och försvunna kopplingar atomiskt", () => {
    const data = fixture(),
      proposal = recordingActionProposals(session, segments)[0],
      original = structuredClone(data);
    expect(() => importRecordingActions(data, session, [], [proposal])).toThrow(
      /verifieras/,
    );
    expect(() =>
      importRecordingActions({ ...data, contacts: [] }, session, segments, [
        proposal,
      ]),
    ).toThrow(/finns inte/);
    expect(() =>
      importRecordingActions(data, session, segments, [
        { ...proposal, id: "fabricated" },
      ]),
    ).toThrow();
    expect(data).toEqual(original);
  });
});
describe("omplanering med konsekvenser", () => {
  it("prioriterar deadline före högre allmän prioritet och bevarar delstegens ordning", () => {
    const data = fixture();
    data.deadlines = [
      {
        id: "d",
        title: "Skicka",
        date,
        minute: 710,
        categoryId: "career",
        steps: [
          { id: "prepare", title: "Förbered", minutes: 30 },
          { id: "send", title: "Skicka", minutes: 30 },
        ],
      },
    ];
    data.weeks[week].activities.push(
      activity("general", 800, 830, { priority: 5 }),
      activity("send", 900, 930, {
        priority: 5,
        deadlineId: "d",
        deadlineStepId: "send",
      }),
      activity("prepare", 850, 880, {
        priority: 1,
        deadlineId: "d",
        deadlineStepId: "prepare",
      }),
    );
    const original = structuredClone(data),
      result = replanDay(data, boundary),
      activities = result.data.weeks[week].activities;
    expect(result.errors).toEqual([]);
    expect(activities.find((a) => a.id === "prepare")!.start).toBe(600);
    expect(activities.find((a) => a.id === "send")!.start).toBe(640);
    expect(activities.find((a) => a.id === "general")!.start).toBe(680);
    expect(validatePlan(activities, data.settings)).toEqual([]);
    expect(data).toEqual(original);
  });
  it("redovisar alla oplacerade pass och återlämnar originalplanen", () => {
    const data = fixture();
    data.weeks[week].activities.push(
      activity("one", 900, 1200),
      activity("two", 950, 1250),
    );
    const result = replanDay(data, { date, minute: 970 }); // Already started: no mutation.
    expect(result.data).toBe(data);
    data.weeks[week].activities = [
      activity("one", 1000, 1200),
      activity("two", 1010, 1210),
    ];
    const failed = replanDay(data, { date, minute: 990 });
    expect(failed.unplaced?.map((a) => a.id)).toEqual(["one", "two"]);
    expect(failed.data).toBe(data);
    expect(failed.activities).toEqual([]);
  });
  it("väljer jobbsök vid lika prioritet när nätverkande redan upptagit tiden", () => {
    const data = fixture();
    data.weeks[week].activities = [
      activity("network-done", 480, 540, {
        categoryId: "networking",
        status: "done",
      }),
      activity("network", 800, 830, { categoryId: "networking" }),
      activity("career", 850, 940),
    ];
    const result = replanDay(data, boundary);
    expect(
      result.data.weeks[week].activities.find((a) => a.id === "career")!.start,
    ).toBe(600);
    expect(
      result.data.weeks[week].activities.map((a) => a.end - a.start),
    ).toEqual([60, 30, 90]);
  });
});
describe("samlat intervjuunderlag", () => {
  it("sparar förberedelsepunkter, återkoppling och nästa steg utan att ändra äldre pass", () => {
    const data = fixture();
    data.weeks[week].activities.push(
      activity("meeting", 800, 860, { blockType: "locked" }),
    );
    data.applications![0].interviews = [
      {
        id: "i",
        title: "Intervju",
        date,
        start: 800,
        end: 860,
        location: "Kontoret",
        meetingActivityId: "meeting",
        preparationNotes: "Läs annons",
        outcomeNotes: "",
      },
    ];
    const input = {
      preparationNotes: "Läs annons",
      outcomeNotes: "Nytt samtal",
      feedbackNotes: "Arbetsprov efterfrågas",
      nextAction: "Skicka arbetsprov",
      followUpDate: "2026-10-30",
      nextActionOwner: "Jag",
      nextActionReason: "Överenskommet i intervjun",
      preparationChecklist: [{ id: "cv", title: "Gå igenom CV", done: true }],
    };
    const next = saveInterviewNotes(data, "a", "i", input, false, now);
    expect(next.weeks).toBe(data.weeks);
    expect(next.applications![0].interviews![0]).toMatchObject({
      feedbackNotes: input.feedbackNotes,
      preparationChecklist: input.preparationChecklist,
    });
    expect(
      next.applications![0].history?.filter((e) => e.kind === "feedback"),
    ).toHaveLength(1);
    expect(saveInterviewNotes(next, "a", "i", input, false, now)).toBe(next);
    expect(decodeData(JSON.stringify(next))).toEqual(next);
    const invalid = structuredClone(next);
    invalid.applications![0].interviews![0].preparationChecklist![0].done =
      "yes" as unknown as boolean;
    expect(() => decodeData(JSON.stringify(invalid))).toThrow(
      /förberedelsepunkt/,
    );
  });
});
