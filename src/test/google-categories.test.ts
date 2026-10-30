import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import {
  categorizeGoogleEvent,
  googleEventActivities,
  previewGoogleImport,
  removeGoogleImports,
  type GoogleEvent,
} from "../lib/google-calendar";
import { googleEventKey, GOOGLE_CATEGORY_ID } from "../lib/external-calendar";
import { categoryMinutes, generateWeek, validatePlan } from "../lib/planner";
import { decodeData } from "../lib/storage";
import { resetPlanning } from "../lib/reset-planning";

const week = "2026-10-26";
const calendar = { id: "one@example.test", summary: "Kalender" };
function event(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "event",
    summary: "Bokning",
    start: { dateTime: "2026-10-26T09:00:00+01:00" },
    end: { dateTime: "2026-10-26T10:00:00+01:00" },
    ...overrides,
  };
}
function snapshot(
  events = [event()],
  selectedWeek = week,
  selectedCalendar = calendar,
) {
  return {
    week: selectedWeek,
    calendarIds: [selectedCalendar.id],
    activities: googleEventActivities(selectedCalendar, events, selectedWeek),
    importedAt: "2026-10-29T10:00:00Z",
  };
}

describe("Google-bokningars lokala kategorier", () => {
  it("väljer befintlig kategori före import och bevarar källans tider och låsning", () => {
    const source = snapshot();
    const original = source.activities[0];
    const data = previewGoogleImport(createData(), source, false, {
      [googleEventKey(original)]: "learning",
    }).data;
    const imported = data.weeks[week].activities.find((a) => a.external)!;
    expect(imported).toEqual({ ...original, categoryId: "learning" });
    expect(categoryMinutes([imported])).toEqual({ learning: 60 });
    expect(decodeData(JSON.stringify(data))).toEqual(data);
  });
  it("behåller kategori och genomförd status när händelsen byter titel, tid och vecka", () => {
    let data = previewGoogleImport(createData(), snapshot(), false).data;
    const original = data.weeks[week].activities.find((a) => a.external)!;
    original.status = "done";
    data = categorizeGoogleEvent(data, original, "career");
    const moved = snapshot(
      [
        event({
          summary: "Ny titel",
          start: { dateTime: "2026-11-02T10:00:00+01:00" },
          end: { dateTime: "2026-11-02T11:00:00+01:00" },
        }),
      ],
      "2026-11-02",
    );
    const next = previewGoogleImport(data, moved, false).data;
    expect(next.weeks[week].activities.some((a) => a.external)).toBe(false);
    expect(
      next.weeks["2026-11-02"].activities.find((a) => a.external),
    ).toMatchObject({
      title: "Ny titel",
      categoryId: "career",
      status: "done",
      start: 600,
      end: 660,
      source: "external",
      blockType: "locked",
    });
  });
  it("uppdaterar alla delar av en flerdagshändelse över sparade veckor", () => {
    const long = event({
      start: { dateTime: "2026-10-30T22:00:00+01:00" },
      end: { dateTime: "2026-11-02T09:00:00+01:00" },
    });
    let data = previewGoogleImport(createData(), snapshot([long]), false).data;
    data = previewGoogleImport(
      data,
      snapshot([long], "2026-11-02"),
      false,
    ).data;
    const original = data.weeks[week].activities.find((a) => a.external)!;
    const next = categorizeGoogleEvent(data, original, "rest");
    const parts = Object.values(next.weeks)
      .flatMap((p) => p.activities)
      .filter((a) => a.external);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((a) => a.categoryId === "rest")).toBe(true);
    expect(decodeData(JSON.stringify(next))).toEqual(next);
  });
  it("skiljer samma event-id i olika kalendrar och låter egna kategorier användas", () => {
    let data = createData();
    data.categories.push({
      ...data.categories[0],
      id: "custom",
      name: "Frilans",
    });
    data = previewGoogleImport(data, snapshot(), false).data;
    const original = data.weeks[week].activities.find((a) => a.external)!;
    data = categorizeGoogleEvent(data, original, "custom");
    const second = snapshot([event()], week, {
      ...calendar,
      id: "two@example.test",
    });
    const combined = {
      ...second,
      calendarIds: [calendar.id, ...second.calendarIds],
      activities: [...snapshot().activities, ...second.activities],
    };
    const next = previewGoogleImport(data, combined, false).data;
    const imported = next.weeks[week].activities.filter((a) => a.external);
    expect(
      imported.find((a) => a.external!.calendarId === calendar.id)?.categoryId,
    ).toBe("custom");
    expect(
      imported.find((a) => a.external!.calendarId !== calendar.id)?.categoryId,
    ).toBe(GOOGLE_CATEGORY_ID);
    expect(decodeData(JSON.stringify(next))).toEqual(next);
  });
  it("kommer ihåg kategorin efter en tillfällig borttagning och kan återställas till okategoriserad", () => {
    let data = previewGoogleImport(createData(), snapshot(), false).data;
    const original = data.weeks[week].activities.find((a) => a.external)!;
    data = categorizeGoogleEvent(data, original, "health");
    data = previewGoogleImport(data, snapshot([]), false).data;
    data = previewGoogleImport(data, snapshot(), false).data;
    expect(
      data.weeks[week].activities.find((a) => a.external)?.categoryId,
    ).toBe("health");
    data = previewGoogleImport(data, snapshot(), false, {
      [googleEventKey(original)]: GOOGLE_CATEGORY_ID,
    }).data;
    data = previewGoogleImport(data, snapshot(), false).data;
    expect(
      data.weeks[week].activities.find((a) => a.external)?.categoryId,
    ).toBe(GOOGLE_CATEGORY_ID);
    expect(data.googleCalendar?.eventCategories).toBeUndefined();
  });
  it("räknar kategoriserad bokad tid mot tidsmålet men undantar lediga och heldagsposter", () => {
    const data = createData();
    data.settings = {
      ...data.settings,
      days: [0],
      musicMornings: 0,
      trainingSessions: 0,
      autoPlanning: true,
    };
    data.categories.find((c) => c.id === "learning")!.targetMinutes = 120;
    const source = snapshot();
    const imported = { ...source.activities[0], categoryId: "learning" };
    const result = generateWeek(week, data, {
      week,
      activities: [imported],
      generatedAt: "",
    });
    expect(categoryMinutes(result.plan.activities).learning).toBe(120);
    expect(validatePlan(result.plan.activities, data.settings)).toEqual([]);
    const free = {
      ...imported,
      external: { ...imported.external!, busy: false },
    };
    expect(categoryMinutes([free])).toEqual({});
    const allDay = {
      ...imported,
      start: 0,
      end: 1440,
      external: { ...imported.external!, allDay: true },
    };
    expect(categoryMinutes([allDay])).toEqual({});
  });
  it("låter inte lediga importer räknas som träningspass eller musikförmiddagar", () => {
    const data = createData();
    const free = googleEventActivities(
      calendar,
      [
        event({
          transparency: "transparent",
          start: { dateTime: "2026-10-27T08:30:00+01:00" },
          end: { dateTime: "2026-10-27T12:00:00+01:00" },
        }),
      ],
      week,
    )[0];
    for (const categoryId of ["music", "health"]) {
      const plan = generateWeek(week, data, {
        week,
        generatedAt: "",
        activities: [{ ...free, categoryId }],
      }).plan;
      expect(
        plan.activities.filter(
          (a) => a.source === "generated" && a.categoryId === categoryId,
        ),
      ).toHaveLength(2);
    }
  });
  it("validerar kategorier och metadata samt rensar kategorival vid borttagning och nollställning", () => {
    let data = previewGoogleImport(createData(), snapshot(), false).data;
    const original = data.weeks[week].activities.find((a) => a.external)!;
    expect(categorizeGoogleEvent(data, original, "missing")).toBe(data);
    const noBookings = { ...data, weeks: {} };
    expect(categorizeGoogleEvent(noBookings, original, "learning")).toBe(
      noBookings,
    );
    expect(
      previewGoogleImport(data, snapshot(), false, { invalid: "learning" }).data
        .googleCalendar?.eventCategories,
    ).toBeUndefined();
    data = categorizeGoogleEvent(data, original, "learning");
    expect(removeGoogleImports(data).googleCalendar).toBeUndefined();
    expect(resetPlanning(data, week).googleCalendar).toBeUndefined();
    const invalid = structuredClone(data);
    invalid.googleCalendar!.eventCategories = { wrong: "learning" };
    expect(() => decodeData(JSON.stringify(invalid))).toThrow();
    const unlocked = structuredClone(data);
    unlocked.weeks[week].activities.find((a) => a.external)!.blockType =
      "flexible";
    expect(() => decodeData(JSON.stringify(unlocked))).toThrow();
  });
});
