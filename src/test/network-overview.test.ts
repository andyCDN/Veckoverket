import { describe, it, expect } from "vitest";
import { createData } from "../lib/defaults";
import {
  contactTimeline,
  logContact,
  networkGroups,
} from "../lib/network-overview";
import { decodeData } from "../lib/storage";
import type { NetworkContact } from "../lib/types";
const contact = (
  id: string,
  nextAction = "",
  date = "",
  waiting = false,
): NetworkContact => ({
  id,
  name: id,
  organization: "Studio",
  entries: [],
  nextAction,
  followUpDate: date,
  nextActionKind: waiting ? "waiting" : "task",
});

describe("kontaktöversikt", () => {
  it("grupperar egna steg och förfallna bevakningar före väntande och övriga, utan tomma grupper", () => {
    const data = createData();
    data.applications = [];
    data.careerActions = [];
    data.contacts = [
      contact("other"),
      contact("waiting", "Svar", "2026-11-08", true),
      contact("due", "Svar", "2026-11-04", true),
      contact("task", "Skicka portfolio", "2026-11-06"),
    ];
    const groups = networkGroups(data, { date: "2026-11-05", minute: 600 });
    expect(
      groups.map((g) => [g.title, g.contacts.map((c) => c.contact.id)]),
    ).toEqual([
      ["Att följa upp", ["due", "task"]],
      ["Väntar på svar", ["waiting"]],
      ["Övriga kontakter", ["other"]],
    ]);
    expect(
      networkGroups(
        { ...data, contacts: [] },
        { date: "2026-11-05", minute: 600 },
      ),
    ).toEqual([]);
  });
  it("sparar logg och nästa steg tillsammans, bevarar historik och kalender samt kan läsas in igen", () => {
    const data = createData();
    data.contacts = [contact("c", "Tidigare steg", "2026-11-06")];
    data.contacts[0].nextActionId = "stable";
    const next = logContact(data, "c", {
      date: "2026-11-05",
      channel: "E-post",
      notes: "Skickade portfölj",
      next: {
        title: "Svar på portfolio",
        date: "2026-11-12",
        kind: "waiting",
        owner: "Anna",
      },
    });
    expect(next.contacts![0]).toMatchObject({
      nextAction: "Svar på portfolio",
      followUpDate: "2026-11-12",
      nextActionKind: "waiting",
      nextActionId: "stable",
    });
    expect(next.contacts![0].entries[0].notes).toContain("Anna");
    expect(next.weeks).toBe(data.weeks);
    expect(data.contacts[0].entries).toEqual([]);
    expect(decodeData(JSON.stringify(next)).contacts).toEqual(next.contacts);
    const logged = logContact(next, "c", {
      date: "2026-11-06",
      channel: "Telefon",
      notes: "Kort avstämning",
    });
    expect(logged.contacts![0].nextAction).toBe("Svar på portfolio");
    expect(logged.contacts![0].entries).toHaveLength(2);
    expect(() =>
      logContact(next, "c", {
        date: "2026-11-06",
        channel: "Telefon",
        notes: "a".repeat(4000),
        next: {
          title: "Nästa steg",
          date: "2026-11-12",
          kind: "task",
          owner: "Jag",
        },
      }),
    ).toThrow("för långa");
    const sameDay = logContact(logged, "c", {
      date: "2026-11-06",
      channel: "Möte",
      notes: "Senaste avstämningen",
    });
    expect(contactTimeline(sameDay, sameDay.contacts![0])[0].notes).toBe(
      "Senaste avstämningen",
    );
  });
  it("samlar anteckningar, överenskommelser och kalenderpass i fallande datumordning", () => {
    const data = createData();
    const c = contact("c");
    c.entries = [
      { id: "e", date: "2026-11-04", channel: "Telefon", notes: "Samtal" },
    ];
    data.contacts = [c];
    data.careerActions = [
      {
        id: "a",
        title: "Skicka material",
        date: "2026-11-06",
        owner: "Jag",
        reason: "",
        status: "open",
        contactId: "c",
        updates: [
          {
            id: "u",
            date: "2026-11-05",
            kind: "changed",
            note: "Ny överenskommelse",
          },
        ],
      },
    ];
    data.weeks = {
      "2026-11-02": {
        week: "2026-11-02",
        generatedAt: "",
        activities: [
          {
            id: "pass",
            date: "2026-11-06",
            start: 600,
            end: 630,
            title: "Avstämning",
            categoryId: "networking",
            priority: 3,
            estimatedMinutes: 30,
            description: "",
            status: "planned",
            source: "manual",
            blockType: "locked",
            careerActionId: "a",
          },
        ],
      },
    };
    expect(contactTimeline(data, c).map((e) => e.id)).toEqual([
      "pass:2026-11-06:pass",
      "action:a:u",
      "log:e",
    ]);
  });
});
