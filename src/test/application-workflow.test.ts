import { describe, it, expect } from "vitest";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";
import {
  documentUrl,
  saveApplicationMaterials,
} from "../lib/application-materials";
import {
  scheduleApplicationInterview,
  saveInterviewNotes,
  interviewActivity,
} from "../lib/application-interviews";
import type { Activity, JobApplication } from "../lib/types";
const week = "2026-10-26",
  now = new Date("2026-10-29T07:00:00Z");
function fixture() {
  const d = createData();
  const a: JobApplication = {
    id: "a",
    role: "Utvecklare",
    organization: "Bolaget",
    status: "sent",
    deadline: "",
    nextAction: "Följ upp",
    followUpDate: "2026-10-30",
    notes: "Befintligt",
    contactIds: ["c"],
  };
  const done: Activity = {
    id: "done",
    title: "Klart",
    date: "2026-10-29",
    start: 510,
    end: 540,
    estimatedMinutes: 30,
    description: "",
    categoryId: "career",
    blockType: "flexible",
    priority: 3,
    status: "done",
    source: "manual",
  };
  d.applications = [a];
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
  d.weeks = {
    [week]: {
      week,
      generatedAt: "",
      weeklyRoutinesFrom: week,
      activities: [done],
    },
  };
  return d;
}
const input = () => ({
  title: "Intervju",
  date: "2026-10-30",
  start: 810,
  minutes: 60,
  preparationMinutes: 30,
  location: "https://meet.example.test/room",
  preparationNotes: "Läs annonsen",
  contactId: "c",
});
describe("dokumentunderlag", () => {
  it("bevarar annons och skickade versioner med historik utan att ändra kalender eller tidigare uppgifter", () => {
    const d = fixture(),
      original = structuredClone(d),
      payload = {
        advertisement: {
          url: "https://example.test/job",
          text: "Annonsen finns kvar här även om den tas bort.",
        },
        materials: [
          {
            id: "cv1",
            title: "CV",
            kind: "cv" as const,
            url: "https://drive.example.test/cv-v1",
            version: "1",
            sentOn: "2026-10-29",
          },
        ],
      };
    const next = saveApplicationMaterials(d, "a", payload, now);
    expect(next.weeks).toBe(d.weeks);
    expect(next.tasks).toBe(d.tasks);
    expect(d).toEqual(original);
    expect(decodeData(JSON.stringify(next)).applications).toEqual(
      next.applications,
    );
    expect(saveApplicationMaterials(next, "a", payload, now)).toBe(next);
    expect(next.applications![0].history?.[0].notes).toContain(
      "Dokumentunderlag uppdaterat",
    );
  });
  it("tillåter bara webblänkar utan inbäddade autentiseringsuppgifter", () => {
    expect(documentUrl("https://example.test/cv")).toBeTruthy();
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///etc/passwd",
      "https://user:pass@example.test/cv",
    ]) {
      expect(documentUrl(url)).toBeUndefined();
      expect(() =>
        saveApplicationMaterials(fixture(), "a", {
          materials: [
            { id: "x", title: "CV", kind: "cv", url, version: "", sentOn: "" },
          ],
        }),
      ).toThrow();
    }
  });
});
describe("intervjuflöde", () => {
  it("bokar intervju och förberedelse atomiskt i befintlig kalender före intervjun", () => {
    const d = fixture(),
      original = structuredClone(d),
      result = scheduleApplicationInterview(d, "a", input(), now);
    expect(result.errors).toEqual([]);
    expect(result.activities).toHaveLength(2);
    expect(d).toEqual(original);
    const interview = result.data.applications![0].interviews![0];
    const meeting = interviewActivity(
        result.data,
        interview.meetingActivityId,
      )!.activity,
      prep = interviewActivity(
        result.data,
        interview.preparationActivityId,
      )!.activity;
    expect(meeting.blockType).toBe("locked");
    expect(prep.blockType).toBe("protected");
    expect(
      prep.date < meeting.date ||
        (prep.date === meeting.date && prep.end <= meeting.start),
    ).toBe(true);
    expect(result.data.weeks[week].activities[0]).toEqual(
      d.weeks[week].activities[0],
    );
    expect(result.data.applications![0].status).toBe("interview");
    expect(decodeData(JSON.stringify(result.data)).applications).toEqual(
      result.data.applications,
    );
  });
  it("bevarar allt om mötet eller förberedelsen inte ryms", () => {
    const d = fixture();
    const occupied = scheduleApplicationInterview(
      d,
      "a",
      { ...input(), date: "2026-10-29", start: 510 },
      now,
    );
    expect(occupied.errors).toHaveLength(1);
    expect(occupied.data).toBe(d);
    const noPrep = fixture();
    noPrep.weeks[week].activities = [];
    const failed = scheduleApplicationInterview(
      noPrep,
      "a",
      { ...input(), date: "2026-10-29", start: 510 },
      new Date("2026-10-29T07:30:00Z"),
    );
    expect(failed.errors).toHaveLength(1);
    expect(failed.data).toBe(noPrep);
    expect(failed.activities).toEqual([]);
  });
  it("sparar utfall och nästa steg, markerar bara intervjun och dubbelregistrerar inte", () => {
    const booked = scheduleApplicationInterview(
      fixture(),
      "a",
      input(),
      now,
    ).data;
    const i = booked.applications![0].interviews![0];
    const notes = {
      preparationNotes: i.preparationNotes,
      outcomeNotes: "Avtalat att skicka referenser",
      nextAction: "Skicka referenser",
      followUpDate: "2026-11-02",
    };
    const completed = saveInterviewNotes(booked, "a", i.id, notes, true, now);
    expect(
      interviewActivity(completed, i.meetingActivityId)!.activity.status,
    ).toBe("done");
    expect(
      interviewActivity(completed, i.preparationActivityId)!.activity.status,
    ).toBe("planned");
    expect(completed.weeks[week].activities[0]).toEqual(
      booked.weeks[week].activities[0],
    );
    expect(completed.applications![0].nextAction).toBe("Skicka referenser");
    expect(saveInterviewNotes(completed, "a", i.id, notes, true, now)).toBe(
      completed,
    );
    expect(decodeData(JSON.stringify(completed)).applications).toEqual(
      completed.applications,
    );
  });
  it("använder kalenderns aktuella datum och avvisar genomfördmarkering om mötet saknas", () => {
    const d = scheduleApplicationInterview(fixture(), "a", input(), now).data,
      i = d.applications![0].interviews![0];
    d.weeks[week].activities = d.weeks[week].activities.filter(
      (a) => a.id !== i.meetingActivityId,
    );
    expect(() =>
      saveInterviewNotes(
        d,
        "a",
        i.id,
        {
          preparationNotes: "",
          outcomeNotes: "",
          nextAction: "",
          followUpDate: "",
        },
        true,
        now,
      ),
    ).toThrow(/Kalenderpasset saknas/);
  });
  it("avvisar korrupta dokument och intervjuer vid import", () => {
    const d = fixture();
    for (const extra of [
      { advertisement: { url: "javascript:alert(1)", text: "" } },
      { materials: null },
      { interviews: [{ id: "i", title: "Intervju", date: "2026-02-30" }] },
    ])
      expect(() =>
        decodeData(
          JSON.stringify({
            ...d,
            applications: [{ ...d.applications![0], ...extra }],
          }),
        ),
      ).toThrow();
  });
});
