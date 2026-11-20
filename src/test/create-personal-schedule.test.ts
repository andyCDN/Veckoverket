import { describe, expect, it, vi } from "vitest";
import { createData } from "../lib/defaults";
import {
  createPersonalSchedule,
  createPersonalScheduleInCloud,
  scheduleSlotCount,
} from "../lib/create-personal-schedule";
import { generateWeek } from "../lib/planner";
import { decodeData } from "../lib/storage";
import { upgradePersonalWeek } from "../lib/personal-week";
import { templateSettings } from "../lib/week-template";
import {
  linkedInSeriesCounts,
  RETIRED_LINKEDIN_PASS,
} from "../lib/activity-exclusions";
import type { Activity } from "../lib/types";
import type { CloudDocument, CloudTransport } from "../lib/workspace-sync";

const week = "2026-11-23";
function appointment(patch: Partial<Activity> = {}): Activity {
  return {
    id: "meeting",
    title: "Eget möte",
    description: "Bevara",
    date: week,
    start: 720,
    end: 825,
    estimatedMinutes: 105,
    categoryId: "family",
    source: "manual",
    status: "planned",
    priority: 5,
    blockType: "locked",
    ...patch,
  };
}
function fixture() {
  const data = createData();
  data.weeks = {
    "2026-11-16": generateWeek("2026-11-16", data).plan,
    [week]: generateWeek(week, data).plan,
  };
  return data;
}

describe("skapa det begärda veckoschemat i den verkliga planen", () => {
  it("uppdaterar även en redan sparad senare vecka som hade hoppat över schemapass", () => {
    const data = fixture(),
      future = "2026-11-30";
    data.settings = templateSettings(data.settings);
    data.weeks[future] = generateWeek(future, data).plan;
    data.weeks[future].activities = data.weeks[future].activities.filter(
      (a) => a.title !== "Kompetensutveckling",
    );
    const installed = createPersonalSchedule(data, week).data;
    const migrated = upgradePersonalWeek(installed, {
      date: "2026-11-20",
      minute: 600,
    });
    expect(scheduleSlotCount(migrated.weeks[future])).toBe(19);
    expect(migrated.weeks[future].rules?.keepTemplateSlots).toBe(true);
    expect(
      upgradePersonalWeek(migrated, { date: "2026-11-20", minute: 600 }),
    ).toBe(migrated);
  });
  it("ersätter det gamla upplägget med exakt användarens tider och håller luckorna samt fredag–söndag fria", () => {
    const data = fixture(),
      original = structuredClone(data);
    const result = createPersonalSchedule(data, week);
    expect(
      result.data.weeks[week].activities.map((a) => [
        a.date,
        a.start,
        a.end,
        a.title,
      ]),
    ).toEqual([
      [week, 510, 540, "Veckoincheck"],
      [week, 540, 630, "Söka jobb"],
      [week, 630, 690, "Träna"],
      [week, 690, 750, "Lunch"],
      [week, 750, 840, "Kompetensutveckling"],
      [week, 840, 900, "Nätverksförfrågningar"],
      ["2026-11-24", 510, 600, "Söka jobb"],
      ["2026-11-24", 600, 690, "Kompetensutveckling"],
      ["2026-11-24", 690, 750, "Lunch"],
      ["2026-11-25", 510, 600, "Söka jobb"],
      ["2026-11-25", 600, 690, "Kompetensutveckling"],
      ["2026-11-25", 690, 750, "Lunch"],
      ["2026-11-25", 750, 810, "Träna"],
      ["2026-11-25", 900, 930, "Hämta"],
      ["2026-11-26", 510, 600, "Söka jobb"],
      ["2026-11-26", 600, 660, "Träna"],
      ["2026-11-26", 660, 720, "Kompetensutveckling"],
      ["2026-11-26", 720, 780, "Lunch"],
      ["2026-11-26", 780, 810, "Stänga veckan"],
    ]);
    expect(result.report).toEqual({ week, slots: 19, conflicts: [] });
    expect(result.data.weeks["2026-11-16"]).toBe(data.weeks["2026-11-16"]);
    expect(data).toEqual(original);
    const stored = decodeData(JSON.stringify(result.data));
    expect(createPersonalSchedule(stored, week).data).toBe(stored);
    expect(
      generateWeek("2026-11-30", result.data).plan.activities,
    ).toHaveLength(19);
  });

  it("visar alla 19 schemapass även när ett eget möte krockar med lunch och kompetensutveckling", () => {
    const data = fixture(),
      meeting = appointment();
    data.weeks[week].activities.push(meeting);
    const result = createPersonalSchedule(data, week);
    expect(result.data.weeks[week].activities).toContain(meeting);
    expect(result.report.slots).toBe(19);
    expect(result.report.conflicts).toHaveLength(2);
    expect(result.report.conflicts.every((c) => c.includes("Eget möte"))).toBe(
      true,
    );
    expect(createPersonalSchedule(result.data, week).data).toBe(result.data);
    const regenerated = generateWeek(
      week,
      result.data,
      result.data.weeks[week],
    );
    expect(scheduleSlotCount(regenerated.plan)).toBe(19);
    expect(regenerated.plan.activities).toContain(meeting);
  });

  it("återanvänder träning och lunch som redan är bokade på exakt rätt tider", () => {
    const data = fixture();
    const training = appointment({
      id: "training",
      title: "Träna",
      start: 630,
      end: 690,
      categoryId: "health",
    });
    const lunch = appointment({
      id: "lunch-clara",
      title: "Lunch Clara",
      date: "2026-11-26",
      start: 720,
      end: 780,
    });
    data.weeks[week].activities.push(training, lunch);
    const result = createPersonalSchedule(data, week);
    expect(result.data.weeks[week].activities).toHaveLength(19);
    expect(result.data.weeks[week].activities).toContain(training);
    expect(result.data.weeks[week].activities).toContain(lunch);
    expect(result.report.conflicts).toEqual([]);
    expect(createPersonalSchedule(result.data, week).data).toBe(result.data);
  });

  it("behåller konkret ansökningsarbete i jobbsökarpasset och fyller bara återstående tid", () => {
    const data = fixture();
    const work = appointment({
      id: "application-work",
      title: "Ansök till KuF",
      categoryId: "career",
      applicationId: "application",
      start: 540,
      end: 570,
      blockType: "flexible",
    });
    data.weeks[week].activities.push(work);
    const result = createPersonalSchedule(data, week);
    expect(result.data.weeks[week].activities).toContain(work);
    const jobs = result.data.weeks[week].activities.filter(
      (a) => a.date === week && a.categoryId === "career",
    );
    expect(jobs.map((a) => [a.start, a.end])).toEqual([
      [540, 570],
      [570, 630],
    ]);
    expect(result.report.slots).toBe(19);
    expect(result.report.conflicts).toEqual([]);
    expect(createPersonalSchedule(result.data, week).data).toBe(result.data);
  });

  it("flyttar en gammal planerad fredagscheck till torsdag och behåller egna fredagsbokningar och historik", () => {
    const data = fixture();
    const friday = appointment({
      id: "friday-meeting",
      date: "2026-11-27",
      start: 600,
      end: 660,
    });
    const done = appointment({
      id: "done",
      status: "done",
      date: "2026-11-27",
      start: 900,
      end: 930,
    });
    data.weeks[week].activities.push(
      friday,
      done,
      appointment({
        id: "old-check",
        date: "2026-11-27",
        start: 810,
        end: 840,
        routine: "week-review",
      }),
    );
    const result = createPersonalSchedule(data, week);
    expect(result.data.weeks[week].activities).toContain(friday);
    expect(result.data.weeks[week].activities).toContain(done);
    expect(
      result.data.weeks[week].activities.filter(
        (a) => a.routine === "week-review",
      ),
    ).toMatchObject([{ date: "2026-11-26", start: 780, end: 810 }]);
  });

  it("skapar en tidigare osparad vecka och återställer saknade områden utan att återinföra LinkedIn-serien", () => {
    const data = fixture();
    delete data.weeks[week];
    data.categories = data.categories.filter((c) => c.id !== "learning");
    const base = appointment({
      title: RETIRED_LINKEDIN_PASS,
      categoryId: "career",
    });
    data.recurring.push({
      ...base,
      id: "linkedin",
      startsOn: "2026-01-05",
      weekdays: [0, 1, 2, 3],
    });
    const result = createPersonalSchedule(data, week);
    expect(result.report.slots).toBe(19);
    expect(linkedInSeriesCounts(result.data)).toEqual({
      bookings: 0,
      rules: 0,
    });
    expect(
      result.data.categories.find((c) => c.id === "learning"),
    ).toBeDefined();
    expect(() => createPersonalSchedule(data, "2026-11-24")).toThrow("måndag");
  });
});

function backend() {
  let document: CloudDocument = {
    data: fixture(),
    revision: 1,
    updatedAt: "2026-11-20T10:00:00Z",
  };
  const save = vi.fn<CloudTransport["save"]>(async (data, expected) => {
    expect(expected).toBe(document.revision);
    document = {
      ...document,
      data: structuredClone(data),
      revision: expected + 1,
    };
    return structuredClone(document);
  });
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

describe("sparande och verifiering av kontots veckoschema", () => {
  it("verifierar även Supabase jsonb som returnerar objektens nycklar i en annan ordning", async () => {
    const f = backend();
    const save = f.save.getMockImplementation()!;
    f.save.mockImplementation(async (data, expected) => {
      const saved = await save(data, expected);
      f.document = JSON.parse(
        JSON.stringify(saved, (_key, entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? Object.fromEntries(
                Object.keys(entry)
                  .sort()
                  .reverse()
                  .map((key) => [key, entry[key]]),
              )
            : entry,
        ),
      );
      return structuredClone(f.document);
    });
    await expect(
      createPersonalScheduleInCloud(f.transport, week),
    ).resolves.toMatchObject({ slots: 19 });
    await createPersonalScheduleInCloud(f.transport, week);
    expect(f.save).toHaveBeenCalledTimes(1);
  });
  it("läser tillbaka alla 19 sparade pass och sparar inte igen när schemat redan finns", async () => {
    const f = backend();
    await expect(
      createPersonalScheduleInCloud(f.transport, week),
    ).resolves.toEqual({ week, slots: 19, conflicts: [] });
    expect(f.transport.load).toHaveBeenCalledTimes(2);
    expect(f.save).toHaveBeenCalledTimes(1);
    await createPersonalScheduleInCloud(f.transport, week);
    expect(f.save).toHaveBeenCalledTimes(1);
  });

  it("läser om vid versionskonflikt och bevarar det samtidigt tillagda mötet", async () => {
    const f = backend(),
      meeting = appointment();
    f.save.mockImplementationOnce(async () => {
      f.document.data.weeks[week].activities.push(meeting);
      f.document.revision++;
      throw Object.assign(new Error("Conflict"), { name: "CloudConflict" });
    });
    const report = await createPersonalScheduleInCloud(f.transport, week);
    expect(report.slots).toBe(19);
    expect(report.conflicts).toHaveLength(2);
    expect(f.document.data.weeks[week].activities).toContainEqual(meeting);
    expect(f.save).toHaveBeenCalledTimes(2);
  });

  it("visar inte lyckat resultat om servern ignorerar sparandet eller kontot saknar dokument", async () => {
    const f = backend();
    f.save.mockImplementation(async () => structuredClone(f.document));
    await expect(
      createPersonalScheduleInCloud(f.transport, week),
    ).rejects.toThrow("verifieras");
    const missing = { ...f.transport, load: vi.fn(async () => null) };
    f.save.mockClear();
    await expect(createPersonalScheduleInCloud(missing, week)).rejects.toThrow(
      "Ingen sparad molnplan",
    );
    expect(f.save).not.toHaveBeenCalled();
  });
});
