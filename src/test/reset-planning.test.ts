import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { generateWeek, categoryMinutes } from "../lib/planner";
import { resetPlanning } from "../lib/reset-planning";
import { followUps } from "../lib/follow-up";
import { decodeData, loadLocal, saveLocal } from "../lib/storage";

const week = "2026-10-26";
function fixture() {
  const data = createData();
  data.profile.name = "Egen profil";
  data.settings.musicMornings = 1;
  data.categories.push({
    ...data.categories[0],
    id: "custom-admin",
    name: "Administration",
    targetMinutes: 0,
  });
  data.weeks[week] = generateWeek(week, data).plan;
  data.weeks["2026-10-19"] = generateWeek("2026-10-19", data).plan;
  const career = data.weeks[week].activities.filter(
    (a) => a.categoryId === "career",
  );
  career[0].status = "done";
  career[1].status = "skipped";
  const { id, date, source, status, ...template } =
    data.weeks[week].activities[0];
  data.recurring = [
    { ...template, id: "old-rule", weekdays: [0], startsOn: week },
  ];
  data.reflections[week] = {
    week,
    good: "Historik",
    unfinished: "Missat",
    balance: "Tid",
    next: "Nästa vecka",
    updatedAt: new Date().toISOString(),
  };
  data.googleCalendar = {
    calendarIds: ["fixture@example.test"],
    lastImportedWeek: week,
    lastImportedAt: new Date().toISOString(),
  };
  return data;
}
describe("nollställning av planering och statistik", () => {
  it("rensar alla veckor och utfall utan att ändra profil eller sparade regler", () => {
    const data = fixture(),
      original = structuredClone(data);
    expect(followUps(data).length).toBeGreaterThan(0);
    const result = resetPlanning(data, week);
    expect(Object.keys(result.weeks)).toEqual([week]);
    expect(result.weeks[week].activities).toEqual([]);
    expect(result.goals).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.recurring).toEqual([]);
    expect(result.reflections).toEqual({});
    expect(result.googleCalendar).toBeUndefined();
    expect(categoryMinutes(result.weeks[week].activities, "done")).toEqual({});
    expect(followUps(result)).toEqual([]);
    expect(result.settings).toEqual(original.settings);
    expect(result.categories).toEqual(original.categories);
    expect(result.profile).toEqual(original.profile);
    expect(data).toEqual(original);
  });
  it("bevarar tom plan och nollad statistik vid export och återläsning", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    const cleared = resetPlanning(fixture(), week);
    saveLocal(storage, cleared);
    expect(loadLocal(storage)).toEqual(cleared);
    expect(decodeData(JSON.stringify(cleared))).toEqual(cleared);
    expect(loadLocal(storage)!.weeks[week].activities).toHaveLength(0);
  });
  it("kan skapa en ny plan utan gamla regler, avbockningar eller uppföljningar", () => {
    const cleared = resetPlanning(fixture(), week);
    const next = generateWeek(week, cleared, cleared.weeks[week]).plan;
    expect(next.activities.length).toBeGreaterThan(0);
    expect(
      next.activities.every(
        (a) => a.status === "planned" && !a.recurrenceId && !a.followUpOf,
      ),
    ).toBe(true);
    expect(next.rules).toEqual(cleared.settings);
  });
});
