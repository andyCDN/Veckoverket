import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { generateWeek } from "../lib/planner";
import { initializePersonalSchedule } from "../lib/initialize-personal-schedule";
import {
  createPersonalSchedule,
  scheduleSlotCount,
} from "../lib/create-personal-schedule";
import { templateSettings } from "../lib/week-template";
import { decodeData } from "../lib/storage";
import { resetPlanning } from "../lib/reset-planning";
import type { Activity } from "../lib/types";

const current = "2026-11-16",
  next = "2026-11-23",
  past = "2026-11-09";
const boundary = { date: "2026-11-21", minute: 600 };
function fixture() {
  const data = createData();
  for (const week of [past, current, next])
    data.weeks[week] = generateWeek(week, data).plan;
  return data;
}

describe("den begärda planen installeras när den vanliga veckovyn öppnas", () => {
  it.each(["off", "active", "installed"])(
    "rättar både denna och nästa veckas måndag med äldre inställning: %s",
    (mode) => {
      let data = fixture();
      if (mode === "active") data.settings = templateSettings(data.settings);
      if (mode === "installed") data = createPersonalSchedule(data, next).data;
      const before = structuredClone(data);
      const migrated = initializePersonalSchedule(data, boundary);
      for (const week of [current, next]) {
        expect(scheduleSlotCount(migrated.weeks[week])).toBe(19);
        expect(
          migrated.weeks[week].activities
            .filter((a) => a.date === week)
            .map((a) => [a.title, a.start, a.end]),
        ).toEqual([
          ["Veckoincheck", 510, 540],
          ["Söka jobb", 540, 630],
          ["Träna", 630, 690],
          ["Lunch", 690, 750],
          ["Kompetensutveckling", 750, 840],
          ["Nätverksförfrågningar", 840, 900],
        ]);
      }
      expect(migrated.weeks[past]).toBe(data.weeks[past]);
      expect(migrated.personalScheduleVersion).toBe(1);
      expect(data).toEqual(before);
      const stored = decodeData(JSON.stringify(migrated));
      expect(initializePersonalSchedule(stored, boundary)).toBe(stored);
    },
  );

  it("behåller genomförda, missade och egna pass samt deras kopplingar", () => {
    const data = fixture();
    const done = data.weeks[current].activities[0];
    done.status = "done";
    const missed = data.weeks[current].activities[1];
    missed.status = "skipped";
    const work: Activity = {
      id: "linked-work",
      title: "Anpassa ansökan",
      description: "Eget arbete",
      date: next,
      start: 540,
      end: 570,
      estimatedMinutes: 30,
      source: "manual",
      categoryId: "career",
      status: "planned",
      priority: 5,
      blockType: "flexible",
      applicationId: "application",
      taskId: "task",
    };
    const meeting: Activity = {
      ...work,
      id: "meeting",
      title: "Återmontering Kommod",
      start: 720,
      end: 825,
      applicationId: undefined,
      taskId: undefined,
      blockType: "locked",
    };
    data.weeks[next].activities.push(work, meeting);
    const migrated = initializePersonalSchedule(data, boundary);
    expect(migrated.weeks[current].activities).toContain(done);
    expect(migrated.weeks[current].activities).toContain(missed);
    expect(migrated.weeks[next].activities).toContain(work);
    expect(migrated.weeks[next].activities).toContain(meeting);
    expect(scheduleSlotCount(migrated.weeks[next])).toBe(19);
    expect(migrated.tasks).toBe(data.tasks);
    expect(migrated.reflections).toBe(data.reflections);
  });

  it("skapar den synliga veckan om ingen vecka är sparad och fryser äldre regler", () => {
    const data = fixture();
    delete data.weeks[past].rules;
    delete data.weeks[current];
    const migrated = initializePersonalSchedule(data, boundary);
    expect(scheduleSlotCount(migrated.weeks[current])).toBe(19);
    expect(migrated.weeks[past].activities).toBe(data.weeks[past].activities);
    expect(migrated.weeks[past].rules).toEqual(data.settings);
  });

  it("upprepar inte installationen efter egna ändringar, avstängd mall eller en återställning", () => {
    const migrated = initializePersonalSchedule(fixture(), boundary);
    migrated.weeks[next].activities = migrated.weeks[next].activities.filter(
      (a) => a.categoryId !== "networking",
    );
    expect(initializePersonalSchedule(migrated, boundary)).toBe(migrated);
    const optedOut = {
      ...migrated,
      settings: { ...migrated.settings, weekTemplate: "off" as const },
    };
    expect(initializePersonalSchedule(optedOut, boundary)).toBe(optedOut);
    const reset = resetPlanning(migrated, current);
    expect(initializePersonalSchedule(reset, boundary)).toBe(reset);
    expect(reset.weeks[current].activities).toEqual([]);
  });
});
