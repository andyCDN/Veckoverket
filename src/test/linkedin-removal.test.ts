import { describe, expect, it, vi } from "vitest";
import { createData } from "../lib/defaults";
import {
  linkedInSeriesCounts,
  RETIRED_LINKEDIN_PASS,
} from "../lib/activity-exclusions";
import { removeLinkedInFromCloud } from "../lib/linkedin-removal";
import type { CloudDocument, CloudTransport } from "../lib/workspace-sync";
import type { Activity } from "../lib/types";

function fixture() {
  const data = createData();
  const week = "2026-11-16";
  const base: Activity = {
    id: "base",
    title: RETIRED_LINKEDIN_PASS,
    description: "",
    date: week,
    start: 510,
    end: 570,
    estimatedMinutes: 60,
    categoryId: "career",
    blockType: "flexible",
    priority: 3,
    status: "planned",
    source: "recurring",
    recurrenceId: "series",
  };
  data.recurring = [
    {
      ...base,
      id: "series",
      weekdays: [0, 1, 2, 3, 4],
      startsOn: "2026-01-05",
    },
  ];
  data.weeks[week] = {
    week,
    generatedAt: "",
    activities: [
      { ...base, id: "planned" },
      { ...base, id: "done", status: "done", title: "Omdöpt ansökningstid" },
      {
        ...base,
        id: "meeting",
        title: "Eget möte",
        recurrenceId: undefined,
        source: "manual",
      },
    ],
  };
  data.weeks["2026-01-05"] = {
    week: "2026-01-05",
    generatedAt: "",
    activities: [{ ...base, id: "old", date: "2026-01-05", status: "skipped" }],
  };
  return data;
}
function backend() {
  let document: CloudDocument = {
    data: fixture(),
    revision: 1,
    updatedAt: "2026-11-20T10:00:00Z",
  };
  const save = vi.fn(async (data, expected) => {
    if (expected !== document.revision)
      throw Object.assign(new Error("Conflict"), { name: "CloudConflict" });
    document = {
      ...document,
      data: structuredClone(data),
      revision: document.revision + 1,
    };
    return structuredClone(document);
  }) as ReturnType<typeof vi.fn<CloudTransport["save"]>>;
  const transport: CloudTransport = {
    load: vi.fn(async () => structuredClone(document)),
    save,
  };
  return {
    transport,
    save,
    get document() {
      return document;
    },
    set document(next: CloudDocument) {
      document = next;
    },
  };
}

describe("direkt rensning av den sparade molnplanen", () => {
  it("raderar hela serien och kontrollerar genom en ny läsning att noll tillfällen finns kvar", async () => {
    const f = backend();
    const original = structuredClone(f.document.data);
    const report = await removeLinkedInFromCloud(f.transport);
    expect(report).toEqual({
      removedBookings: 3,
      removedRules: 1,
      remainingBookings: 0,
      remainingRules: 0,
    });
    expect(linkedInSeriesCounts(f.document.data)).toEqual({
      bookings: 0,
      rules: 0,
    });
    expect(f.document.data.weeks["2026-11-16"].activities).toEqual([
      original.weeks["2026-11-16"].activities[2],
    ]);
    expect(f.transport.load).toHaveBeenCalledTimes(2);
    expect(f.save).toHaveBeenCalledTimes(1);
    await expect(removeLinkedInFromCloud(f.transport)).resolves.toMatchObject({
      removedBookings: 0,
      removedRules: 0,
    });
    expect(f.save).toHaveBeenCalledTimes(1);
  });

  it("läser om vid versionskonflikt och behåller den andra enhetens ändringar", async () => {
    const f = backend();
    f.save.mockImplementationOnce(async () => {
      f.document = {
        ...f.document,
        revision: 2,
        data: { ...f.document.data, profile: { name: "Nyare namn" } },
      };
      throw Object.assign(new Error("Conflict"), { name: "CloudConflict" });
    });
    await expect(removeLinkedInFromCloud(f.transport)).resolves.toMatchObject({
      remainingBookings: 0,
    });
    expect(f.document.data.profile.name).toBe("Nyare namn");
    expect(f.save).toHaveBeenCalledTimes(2);
  });

  it("rapporterar inte lyckat resultat om servern inte har sparat raderingen", async () => {
    const f = backend();
    f.save.mockImplementation(async () => structuredClone(f.document));
    await expect(removeLinkedInFromCloud(f.transport)).rejects.toThrow(
      "Planen ändrades",
    );
    expect(linkedInSeriesCounts(f.document.data).bookings).toBe(3);
  });

  it("skapar inte en tom ersättningsplan när kontot saknar en molnplan", async () => {
    const f = backend();
    f.transport.load = vi.fn(async () => null);
    await expect(removeLinkedInFromCloud(f.transport)).rejects.toThrow(
      "Ingen sparad molnplan",
    );
    expect(f.save).not.toHaveBeenCalled();
  });
});
