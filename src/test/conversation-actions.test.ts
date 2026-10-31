import { it, expect } from "vitest";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";
import {
  careerActions,
  actionBookingSuggestions,
  bookCareerAction,
  relatedCareerActions,
  reviewCareerAgreement,
} from "../lib/career-actions";
import {
  recordingActionProposals,
  importRecordingActions,
} from "../lib/recording-actions";
import { saveReviewedRecording } from "../lib/recording-workspace";
import type {
  RecordingSession,
  RecordingSegment,
} from "../../supabase/functions/_shared/recording-schema";
const week = "2026-11-02",
  now = new Date("2026-11-02T08:00:00Z"),
  boundary = { date: week, minute: 540 };
function fixture() {
  const d = createData();
  d.settings = {
    ...d.settings,
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
  d.weeks = {
    [week]: {
      week,
      generatedAt: "",
      weeklyRoutinesFrom: week,
      activities: [
        {
          id: "done",
          date: week,
          title: "Avklarat",
          description: "",
          start: 480,
          end: 510,
          estimatedMinutes: 30,
          categoryId: "career",
          blockType: "flexible",
          status: "done",
          source: "manual",
          priority: 3,
        },
      ],
    },
  };
  d.applications = [
    {
      id: "a",
      role: "Analytiker",
      organization: "Bolaget",
      status: "interview",
      nextAction: "Läs annons",
      followUpDate: week,
      deadline: "",
      notes: "Bevarad anteckning",
    },
  ];
  d.contacts = [
    {
      id: "c",
      name: "Kim",
      organization: "Bolaget",
      nextAction: "",
      followUpDate: "",
      entries: [],
    },
  ];
  return d;
}
const segment: RecordingSegment = {
  index: 0,
  transcript: "Jag skickar länken på tisdag.",
  durationMs: 20000,
};
const session: RecordingSession = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Intervju med Kim",
  context: { applicationId: "a", contactId: "c" },
  state: "complete",
  startedAt: "2026-11-02T08:00:00Z",
  segmentCount: 1,
  transcriptRevision: 0,
  summaryRevision: 0,
  summary: {
    agreements: [
      {
        text: "Kim skickar länken",
        owner: "Kim",
        when: "tisdag",
        evidence: segment.transcript,
      },
    ],
    nextSteps: [],
    uncertainties: [],
  },
};
it("sparar en bevakning och föreslår tid efter bevakningsdatum utan att boka den andras arbete", () => {
  const d = fixture(),
    draft = recordingActionProposals(session, [segment])[0];
  const imported = importRecordingActions(
    d,
    session,
    [segment],
    [{ ...draft, kind: "waiting" }],
  );
  const options = actionBookingSuggestions(imported, draft.id, 30, boundary);
  expect(options[0].date).toBe("2026-11-03");
  expect(imported.weeks).toBe(d.weeks);
  const booked = bookCareerAction(
    imported,
    draft.id,
    options[0].date,
    options[0].start,
    30,
    now,
  );
  expect(booked.errors).toEqual([]);
  expect(booked.activities[0].title).toBe("Följ upp: Kim skickar länken");
  expect(booked.activities[0].applicationId).toBe("a");
  expect(booked.data.weeks[week].activities[0]).toEqual(
    d.weeks[week].activities[0],
  );
  expect(booked.data.applications![0].nextAction).toBe("Läs annons");
  expect(
    bookCareerAction(
      booked.data,
      draft.id,
      options[1].date,
      options[1].start,
      30,
      now,
    ).data,
  ).toBe(booked.data);
  expect(decodeData(JSON.stringify(booked.data))).toEqual(booked.data);
});
it("föreslår egna uppgifter före datumet och bevarar arbetsytan om ingen tid ryms", () => {
  const d = fixture(),
    draft = recordingActionProposals(session, [segment])[0],
    imported = importRecordingActions(d, session, [segment], [draft]);
  const before = structuredClone(imported),
    slots = actionBookingSuggestions(imported, draft.id, 30, boundary);
  expect(slots.every((s) => s.date <= "2026-11-03")).toBe(true);
  expect(slots[0].date).toBe(week);
  expect(imported).toEqual(before);
  const none = actionBookingSuggestions(imported, draft.id, 480, {
    date: "2026-11-03",
    minute: 1000,
  });
  expect(none).toEqual([]);
});
it("bevarar tidigare åtagande och kalenderpass när en överenskommelse ändras mellan samtal", () => {
  const d = fixture(),
    id = careerActions(d)[0].id;
  const next = reviewCareerAgreement(
    d,
    id,
    {
      kind: "changed",
      title: "Skicka arbetsprov",
      date: "2026-11-04",
      note: "Kim bad om ett arbetsprov",
      recordingId: session.id,
    },
    now,
  );
  expect(next.weeks).toBe(d.weeks);
  expect(next.applications![0].nextAction).toBe("");
  const action = next.careerActions![0];
  expect(action.id).toBe(id);
  expect(action.title).toBe("Skicka arbetsprov");
  expect(action.updates![0]).toMatchObject({
    kind: "changed",
    previous: { title: "Läs annons", date: week },
    recordingId: session.id,
  });
  expect(relatedCareerActions(next, { applicationId: "another" })).toEqual([]);
  const open = reviewCareerAgreement(
    next,
    id,
    { kind: "open", note: "Återstår", recordingId: session.id },
    now,
  );
  expect(
    reviewCareerAgreement(
      open,
      id,
      { kind: "open", note: "Återstår", recordingId: session.id },
      now,
    ),
  ).toBe(open);
  const done = reviewCareerAgreement(
    open,
    id,
    {
      kind: "fulfilled",
      note: "Arbetsprovet är skickat",
      recordingId: session.id,
    },
    now,
  );
  expect(done.careerActions![0].status).toBe("done");
  expect(done.careerActions![0].updates?.map((u) => u.kind)).toEqual([
    "changed",
    "open",
    "fulfilled",
  ]);
  expect(done.weeks).toBe(d.weeks);
  expect(decodeData(JSON.stringify(done))).toEqual(done);
});
it("sparar sammanfattningsversioner som nya anteckningar och nekar inaktuella AI-förslag", () => {
  const d = fixture(),
    first = saveReviewedRecording(d, session, "Första granskade texten", now);
  const revised = { ...session, summaryRevision: 1, transcriptRevision: 1 };
  const next = saveReviewedRecording(
    first,
    revised,
    "Rättad granskad text",
    now,
  );
  expect(next.applications![0].history?.map((e) => e.notes)).toEqual([
    "Samtal: Intervju med Kim\nFörsta granskade texten",
    "Samtal: Intervju med Kim\nRättad granskad text",
  ]);
  expect(saveReviewedRecording(next, revised, "Dublett", now)).toBe(next);
  expect(() =>
    saveReviewedRecording(
      next,
      { ...revised, summaryStale: true },
      "Inte granskad",
      now,
    ),
  ).toThrow();
  expect(
    recordingActionProposals({ ...revised, summaryStale: true }, [segment]),
  ).toEqual([]);
});
