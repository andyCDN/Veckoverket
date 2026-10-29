import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { categoryMinutes, generateWeek, validatePlan } from "../lib/planner";
import {
  bookingConstraints,
  canReplanActivity,
  replanAfterBookings,
} from "../lib/auto-planning";
import { planningBoundary } from "../lib/date";
import { decodeData } from "../lib/storage";
import type { Activity } from "../lib/types";

const week = "2026-11-02";
const boundary = { date: "2026-10-29", minute: 600 };
function fixture() {
  const data = createData();
  data.settings.autoPlanning = true;
  data.weeks[week] = generateWeek(week, data).plan;
  return data;
}
const booking = (date: string, start: number, end: number): Activity => ({
  id: "new-booking",
  title: "Bokat möte",
  description: "",
  categoryId: "career",
  date,
  start,
  end,
  estimatedMinutes: end - start,
  blockType: "locked",
  priority: 5,
  source: "manual",
  status: "planned",
});

describe("automatisk veckoplanering", () => {
  it("ger både jobb och kompetens morgontid före andra flexibla livsområden", () => {
    const data = createData();
    data.settings = {
      ...data.settings,
      autoPlanning: true,
      days: [0],
      musicMornings: 0,
      trainingSessions: 0,
    };
    data.categories.find((c) => c.id === "career")!.targetMinutes = 90;
    data.categories.find((c) => c.id === "learning")!.targetMinutes = 90;
    data.categories.push({
      id: "other",
      name: "Annat",
      color: "#123456",
      targetMinutes: 90,
      priority: 5,
      minBlock: 30,
      allowSplit: true,
      movable: true,
    });
    const result = generateWeek(week, data);
    expect(validatePlan(result.plan.activities, data.settings)).toEqual([]);
    expect(categoryMinutes(result.plan.activities).learning).toBe(90);
    expect(
      categoryMinutes(result.plan.activities).career,
    ).toBeGreaterThanOrEqual(90);
    for (const id of ["career", "learning"]) {
      const first = result.plan.activities.find((a) => a.categoryId === id)!;
      expect(first.start).toBeLessThan(data.settings.lunchStart);
    }
    const other = result.plan.activities.find((a) => a.categoryId === "other")!;
    expect(other.start).toBeGreaterThanOrEqual(data.settings.lunchEnd);
    expect(
      result.plan.activities.find((a) => a.routine === "week-start")?.start,
    ).toBe(data.settings.start);
  });
  it("bokar om genererade förslag runt ett nytt möte och behåller registrerade utfall", () => {
    const data = fixture();
    const initial = data.weeks[week];
    const slot = initial.activities.find((a) => a.categoryId === "learning")!;
    const done = initial.activities.find(
      (a) => a.categoryId === "learning" && a.date !== slot.date,
    )!;
    done.status = "done";
    const meeting = booking(slot.date, slot.start, slot.end);
    initial.activities.push(meeting);
    expect(
      bookingConstraints(initial.activities, data, boundary),
    ).toContainEqual(meeting);
    expect(
      bookingConstraints(initial.activities, data, boundary),
    ).not.toContainEqual(slot);
    const next = replanAfterBookings(data, [week], boundary);
    expect(next.weeks[week].activities).toContainEqual(meeting);
    expect(next.weeks[week].activities).toContainEqual(done);
    expect(validatePlan(next.weeks[week].activities, data.settings)).toEqual(
      [],
    );
    expect(next.weeks[week].activities.filter((a) => a.routine)).toHaveLength(
      2,
    );
    expect(new Set(next.weeks[week].activities.map((a) => a.id)).size).toBe(
      next.weeks[week].activities.length,
    );
  });
  it("bevarar historik och pågående pass när nuvarande vecka räknas om", () => {
    const data = createData();
    const current = "2026-10-26";
    data.weeks[current] = generateWeek(current, data).plan;
    const past = structuredClone(
      data.weeks[current].activities.filter(
        (a) =>
          a.date < boundary.date ||
          (a.date === boundary.date && a.start < boundary.minute),
      ),
    );
    data.settings.autoPlanning = true;
    data.weeks[current].activities.push(booking("2026-10-30", 780, 810));
    const next = replanAfterBookings(data, [current], boundary);
    for (const activity of past)
      expect(next.weeks[current].activities).toContainEqual(activity);
    expect(
      validatePlan(next.weeks[current].activities, next.weeks[current].rules!),
    ).toEqual([]);
    const oldIds = new Set(past.map((a) => a.id));
    expect(
      next.weeks[current].activities
        .filter((a) => !oldIds.has(a.id) && a.source === "generated")
        .every((a) => a.date > boundary.date || a.start >= boundary.minute),
    ).toBe(true);
  });
  it("bevarar musikförmiddagar och egna återkommande bokningar enligt parametrarna", () => {
    const data = fixture();
    const music = structuredClone(
      data.weeks[week].activities.find((a) => a.categoryId === "music")!,
    );
    const own = booking(week, 780, 810);
    own.source = "recurring";
    own.recurrenceId = "weekly-meeting";
    data.weeks[week].activities.push(own);
    const next = replanAfterBookings(data, [week], boundary);
    expect(next.weeks[week].activities).toContainEqual(music);
    expect(next.weeks[week].activities).toContainEqual(own);
    expect(canReplanActivity(music, data, boundary)).toBe(false);
    expect(validatePlan(next.weeks[week].activities, data.settings)).toEqual(
      [],
    );
  });
  it("respekterar buffertar och rapporterar tidsbrist i stället för att överlappa", () => {
    const data = createData();
    data.settings = {
      ...data.settings,
      autoPlanning: true,
      musicMornings: 0,
      buffer: 10,
    };
    const result = generateWeek(week, data);
    expect(validatePlan(result.plan.activities, data.settings)).toEqual([]);
    expect(result.conflicts.some((c) => c.severity === "warning")).toBe(true);
  });
  it("lämnar pausade, äldre och uttryckligen tomma planer oförändrade", () => {
    const data = fixture();
    data.settings.autoPlanning = false;
    expect(replanAfterBookings(data, [week], boundary)).toBe(data);
    data.settings.autoPlanning = true;
    expect(
      replanAfterBookings(data, [week], { date: "2026-11-09", minute: 510 }),
    ).toBe(data);
    data.weeks[week].activities = [];
    expect(replanAfterBookings(data, [week], boundary)).toBe(data);
  });
  it("lägger in nya veckobokningar även i redan sparade framtida veckor", () => {
    const data = fixture();
    const later = "2026-11-09";
    data.weeks[later] = generateWeek(later, data).plan;
    data.recurring.push({
      id: "recurring-booking",
      title: "Veckomöte",
      description: "",
      categoryId: "career",
      start: 600,
      end: 630,
      estimatedMinutes: 30,
      blockType: "locked",
      priority: 5,
      weekdays: [0],
      startsOn: week,
    });
    const next = replanAfterBookings(data, [week, later], boundary);
    for (const key of [week, later]) {
      expect(
        next.weeks[key].activities.filter(
          (a) => a.recurrenceId === "recurring-booking",
        ),
      ).toHaveLength(1);
      expect(validatePlan(next.weeks[key].activities, data.settings)).toEqual(
        [],
      );
    }
  });
  it("applicerar inte en kandidat med hårda bokningskonflikter", () => {
    const data = fixture();
    data.weeks[week].activities.push(booking(week, 510, 930));
    const before = structuredClone(data);
    expect(replanAfterBookings(data, [week], boundary)).toBe(data);
    expect(data).toEqual(before);
  });
  it("använder lokal svensk tid för gränsen även vid tidsomställning och årsskifte", () => {
    expect(planningBoundary(new Date("2026-10-29T09:02:01Z"))).toEqual({
      date: "2026-10-29",
      minute: 605,
    });
    expect(planningBoundary(new Date("2026-10-25T01:30:00Z"))).toEqual({
      date: "2026-10-25",
      minute: 150,
    });
    expect(planningBoundary(new Date("2026-12-31T23:05:00Z"))).toEqual({
      date: "2027-01-01",
      minute: 5,
    });
  });
  it("sparar inställningen i säkerhetskopior och avvisar ogiltiga värden", () => {
    const data = fixture();
    expect(decodeData(JSON.stringify(data))).toEqual(data);
    data.settings.autoPlanning = "yes" as unknown as boolean;
    expect(() => decodeData(JSON.stringify(data))).toThrow();
  });
});
