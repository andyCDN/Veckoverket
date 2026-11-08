import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";
import { habitWeek, pauseHabit, saveHabit, toggleHabit } from "../lib/habits";

const draft = {
  id: "focus",
  title: "Fokusarbete",
  createdOn: "2026-11-02",
  schedule: { kind: "days" as const, days: [0, 1, 2, 3, 4] },
};
describe("vanor", () => {
  it("bevarar gammal data och sparar avbockningar utan att ändra kalendern", () => {
    const original = createData();
    expect(decodeData(JSON.stringify(original)).habits).toBeUndefined();
    const data = saveHabit(original, draft);
    const checked = toggleHabit(data, "focus", "2026-11-03", "2026-11-05");
    expect(checked.habits![0].checks).toEqual(["2026-11-03"]);
    expect(checked.weeks).toBe(original.weeks);
    expect(data.habits![0].checks).toEqual([]);
    expect(decodeData(JSON.stringify(checked)).habits).toEqual(checked.habits);
    expect(
      toggleHabit(checked, "focus", "2026-11-03", "2026-11-05").habits![0]
        .checks,
    ).toEqual([]);
  });
  it("begränsar avbockning till planerade och passerade dagar, bevarar historik när mål ändras eller pausas", () => {
    const data = saveHabit(createData(), draft);
    for (const date of ["2026-11-01", "2026-11-06", "2026-11-07", "ogiltigt"])
      expect(toggleHabit(data, "focus", date, "2026-11-05")).toBe(data);
    const checked = toggleHabit(data, "focus", "2026-11-02", "2026-11-05");
    const changed = saveHabit(checked, {
      ...draft,
      title: "Djupfokus",
      createdOn: "2026-11-05",
      schedule: { kind: "weekly", target: 3 },
    });
    expect(changed.habits![0]).toMatchObject({
      createdOn: "2026-11-02",
      title: "Djupfokus",
      checks: ["2026-11-02"],
    });
    const paused = pauseHabit(changed, "focus");
    expect(toggleHabit(paused, "focus", "2026-11-04", "2026-11-05")).toBe(
      paused,
    );
    expect(paused.habits![0].checks).toEqual(["2026-11-02"]);
    expect(pauseHabit(paused, "focus").habits![0].paused).toBe(false);
  });
  it("räknar veckomål och första delveckan separat utan att blanda veckor", () => {
    const data = saveHabit(createData(), {
      ...draft,
      createdOn: "2026-11-06",
      schedule: { kind: "weekly", target: 5 },
    });
    const checked = toggleHabit(
      toggleHabit(data, "focus", "2026-11-06", "2026-11-08"),
      "focus",
      "2026-11-07",
      "2026-11-08",
    );
    expect(habitWeek(checked.habits![0], "2026-11-02")).toMatchObject({
      completed: 2,
      target: 3,
      percent: 67,
    });
    expect(habitWeek(checked.habits![0], "2026-11-09")).toMatchObject({
      completed: 0,
      target: 5,
      percent: 0,
    });
  });
  it("validerar vanor och avvisar korrupta säkerhetskopior", () => {
    const data = saveHabit(createData(), draft);
    for (const patch of [
      { schedule: { kind: "days", days: [] } },
      { schedule: { kind: "days", days: [0, 0] } },
      { schedule: { kind: "weekly", target: 8 } },
      { checks: ["2026-02-30"] },
      { checks: ["2026-11-01"] },
      { checks: ["2026-11-03", "2026-11-03"] },
    ])
      expect(() =>
        decodeData(
          JSON.stringify({
            ...data,
            habits: [{ ...data.habits![0], ...patch }],
          }),
        ),
      ).toThrow();
  });
});
