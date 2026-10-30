import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import {
  googleEventActivities,
  previewGoogleImport,
  categorizeGoogleEvent,
} from "../lib/google-calendar";
import {
  applyCalendarCategoryRules,
  AUTO_CATEGORY,
  googleCategoryChoices,
  matchingCategoryRule,
} from "../lib/calendar-categories";
import { googleEventKey, GOOGLE_CATEGORY_ID } from "../lib/external-calendar";
import { decodeData } from "../lib/storage";
import { resetPlanning } from "../lib/reset-planning";
const week = "2026-10-26",
  calendar = { id: "one@example.test", summary: "Kalender" };
function data() {
  const value = createData();
  value.calendarCategoryRules = [
    {
      id: "interview",
      contains: "Intervju",
      categoryId: "career",
      enabled: true,
    },
    { id: "course", contains: "kurs", categoryId: "learning", enabled: true },
  ];
  return value;
}
function snapshot(
  title = "Intervju",
  id = "booking",
  selectedCalendar = calendar,
  selectedWeek = week,
) {
  return {
    week: selectedWeek,
    calendarIds: [selectedCalendar.id],
    activities: googleEventActivities(
      selectedCalendar,
      [
        {
          id,
          summary: title,
          start: { dateTime: "2026-10-26T09:00:00+01:00" },
          end: { dateTime: "2026-10-26T10:00:00+01:00" },
        },
      ],
      selectedWeek,
    ),
    importedAt: "2026-10-29T09:00:00Z",
  };
}
const booking = (value: ReturnType<typeof data>) =>
  value.weeks[week].activities.find((a) => a.external)!;

describe("automatiska kategoriregler", () => {
  it("matchar rubrik oberoende av skiftläge, följer ordning, kalender och paus", () => {
    const value = data(),
      activity = snapshot("KURS inför INTERVJU").activities[0];
    expect(matchingCategoryRule(value, activity)?.id).toBe("interview");
    value.calendarCategoryRules![0].enabled = false;
    expect(matchingCategoryRule(value, activity)?.id).toBe("course");
    value.calendarCategoryRules![1].calendarId = "other";
    expect(matchingCategoryRule(value, activity)).toBeUndefined();
    value.calendarCategoryRules![1] = {
      id: "unicode",
      contains: "KＵＲＳ",
      categoryId: "learning",
      enabled: true,
    };
    expect(matchingCategoryRule(value, activity)?.categoryId).toBe("learning");
  });
  it("beräknar om regelkategorier vid namnbyte utan att göra dem manuella och bevarar genomförd status", () => {
    let value = previewGoogleImport(data(), snapshot(), false).data;
    const original = booking(value);
    original.status = "done";
    const key = googleEventKey(original);
    expect(original.categoryId).toBe("career");
    expect(value.googleCalendar?.eventCategorySources?.[key]).toBe("rule");
    expect(googleCategoryChoices(value)[key]).toBeUndefined();
    value = previewGoogleImport(value, snapshot("Kurs i svenska"), false).data;
    expect(booking(value)).toMatchObject({
      categoryId: "learning",
      status: "done",
    });
    value = previewGoogleImport(value, snapshot("Annat möte"), false).data;
    expect(booking(value).categoryId).toBe(GOOGLE_CATEGORY_ID);
    expect(value.googleCalendar?.eventCategorySources?.[key]).toBeUndefined();
    expect(decodeData(JSON.stringify(value))).toEqual(value);
  });
  it("bevarar manuella val även om de motsvarar regelns kategori, samt explicit okategoriserad", () => {
    let value = previewGoogleImport(data(), snapshot(), false).data;
    const key = googleEventKey(booking(value));
    value = categorizeGoogleEvent(value, booking(value), "career");
    value.calendarCategoryRules![0].categoryId = "learning";
    value = previewGoogleImport(value, snapshot(), false).data;
    expect(booking(value).categoryId).toBe("career");
    value = categorizeGoogleEvent(value, booking(value), GOOGLE_CATEGORY_ID);
    value = previewGoogleImport(value, snapshot(), false).data;
    expect(booking(value).categoryId).toBe(GOOGLE_CATEGORY_ID);
    expect(value.googleCalendar?.eventCategorySources?.[key]).toBe("manual");
    value = categorizeGoogleEvent(value, booking(value), AUTO_CATEGORY);
    expect(booking(value).categoryId).toBe("learning");
    expect(value.googleCalendar?.eventCategorySources?.[key]).toBe("rule");
  });
  it("låter förhandsgranskningens manuella val styra över regler även på flerdagssegment", () => {
    const source = snapshot();
    source.activities = googleEventActivities(
      calendar,
      [
        {
          id: "long",
          summary: "Kurs",
          start: { dateTime: "2026-10-26T20:00:00+01:00" },
          end: { dateTime: "2026-10-28T10:00:00+01:00" },
        },
      ],
      week,
    );
    const key = googleEventKey(source.activities[0]);
    const value = previewGoogleImport(data(), source, false, {
      [key]: "rest",
    }).data;
    expect(
      value.weeks[week].activities
        .filter((a) => a.external)
        .every((a) => a.categoryId === "rest"),
    ).toBe(true);
    expect(value.googleCalendar?.eventCategories?.[key]).toBe("rest");
  });
  it("tillämpar ändrade regler på sparade bokningar utan att ändra manuella eller äldre kategorival", () => {
    let value = previewGoogleImport(data(), snapshot(), false).data;
    const automatic = booking(value),
      manual = {
        ...automatic,
        id: "manual-booking",
        categoryId: "health",
        external: { ...automatic.external!, eventId: "legacy" },
      };
    value.weeks[week].activities.push(manual);
    value.calendarCategoryRules![0].categoryId = "learning";
    const applied = applyCalendarCategoryRules(value);
    expect(applied.count).toBe(1);
    expect(booking(applied.data).categoryId).toBe("learning");
    expect(
      applied.data.weeks[week].activities.find((a) => a.id === manual.id),
    ).toEqual(manual);
    applied.data.calendarCategoryRules = [];
    expect(
      booking(applyCalendarCategoryRules(applied.data).data).categoryId,
    ).toBe(GOOGLE_CATEGORY_ID);
    expect(resetPlanning(value, week).calendarCategoryRules).toEqual(
      value.calendarCategoryRules,
    );
    expect(resetPlanning(value, week).googleCalendar).toBeUndefined();
  });
  it("validerar regler och ursprung men läser tidigare säkerhetskopior", () => {
    const value = previewGoogleImport(data(), snapshot(), false).data;
    expect(decodeData(JSON.stringify(value))).toEqual(value);
    for (const rules of [
      [{ ...value.calendarCategoryRules![0], contains: " " }],
      [{ ...value.calendarCategoryRules![0], categoryId: "missing" }],
      [value.calendarCategoryRules![0], value.calendarCategoryRules![0]],
      [{ ...value.calendarCategoryRules![0], enabled: "yes" }],
    ])
      expect(() =>
        decodeData(JSON.stringify({ ...value, calendarCategoryRules: rules })),
      ).toThrow();
    expect(() =>
      decodeData(
        JSON.stringify({
          ...value,
          googleCalendar: {
            ...value.googleCalendar,
            eventCategorySources: { wrong: "rule" },
          },
        }),
      ),
    ).toThrow();
    const legacy = createData();
    expect(decodeData(JSON.stringify(legacy))).toEqual(legacy);
  });
});
