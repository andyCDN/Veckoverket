import { describe, expect, it } from "vitest";
import { createData as createDefaultData } from "../lib/defaults";
import {
  generateWeek,
  categoryMinutes,
  assessWeek,
  validatePlan,
  validateMove,
  capacity,
} from "../lib/planner";
import { addDays, monday, weekNumber, weekday } from "../lib/date";
import { decodeData, loadLocal, saveLocal, STORAGE_KEY } from "../lib/storage";
import type { Activity, RecurringActivity } from "../lib/types";
const week = "2026-10-26";
// Preserve the original scheduling contract for legacy workspaces. The new
// default routines and their capacity costs are covered in weekly-routines.test.
function createData() {
  const data = createDefaultData();
  data.categories = data.categories.filter((c) => c.id !== "weekly-planning");
  return data;
}
const manual = (overrides: Partial<Activity> = {}): Activity => ({
  id: "manual",
  title: "Intervju",
  description: "",
  categoryId: "career",
  date: week,
  start: 510,
  end: 570,
  estimatedMinutes: 60,
  blockType: "locked",
  priority: 5,
  status: "planned",
  source: "manual",
  ...overrides,
});
describe("regelbaserad planering", () => {
  it.each([
    [1, 210, 510],
    [2, 420, 300],
  ])(
    "%i musikförmiddag: sammanhängande skapande, 10 h studier och korrekt jobbtid",
    (mornings, music, career) => {
      const data = createData();
      data.settings.musicMornings = mornings;
      const result = generateWeek(week, data);
      const totals = categoryMinutes(result.plan.activities);
      expect(result.conflicts).toEqual([]);
      expect(totals.music).toBe(music);
      expect(totals.career).toBe(career);
      expect(totals.learning).toBe(600);
      expect(totals.health).toBe(180);
      expect(totals.family).toBe(300);
      expect(totals.rest).toBe(300);
      expect(
        result.plan.activities.filter((a) => a.categoryId === "music"),
      ).toHaveLength(mornings);
      for (const a of result.plan.activities.filter(
        (a) => a.categoryId === "music",
      )) {
        expect(a.start).toBe(510);
        expect(a.end).toBe(720);
        expect(a.blockType).toBe("protected");
      }
      for (const a of result.plan.activities.filter(
        (a) => a.categoryId === "health",
      ))
        expect(a.start).toBeGreaterThanOrEqual(780);
      expect(validatePlan(result.plan.activities, data.settings)).toEqual([]);
    },
  );
  it("förklarar kapacitetsbrist vid tredje träningspass utan att tyst minska jobbsökandet", () => {
    const data = createData();
    data.settings.trainingSessions = 3;
    const result = generateWeek(week, data);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        id: "budget-health",
        message: expect.stringContaining("90 minuter"),
      }),
    );
    expect(categoryMinutes(result.plan.activities).career).toBe(300);
    expect(categoryMinutes(result.plan.activities).learning).toBe(600);
    expect(validatePlan(result.plan.activities, data.settings)).toEqual([]);
    expect(
      assessWeek(result.plan, data).some((c) => c.id === "target-health"),
    ).toBe(true);
  });
  it("utnyttjar faktisk kapacitet till ett tredje träningspass med en musikförmiddag", () => {
    const data = createData();
    data.settings.musicMornings = 1;
    data.settings.trainingSessions = 3;
    const result = generateWeek(week, data);
    expect(result.conflicts).toEqual([]);
    expect(categoryMinutes(result.plan.activities).health).toBe(270);
    expect(categoryMinutes(result.plan.activities).career).toBe(420);
  });
  it("helger löser bristen utan överlappningar", () => {
    const data = createData();
    data.settings.weekends = true;
    data.settings.trainingSessions = 3;
    const r = generateWeek(week, data);
    expect(r.conflicts).toEqual([]);
    expect(categoryMinutes(r.plan.activities).health).toBe(270);
  });
  it("upptäcker överlapp och felaktig tid", () => {
    const data = createData();
    expect(
      validatePlan(
        [manual(), manual({ id: "b", start: 540, end: 600 })],
        data.settings,
      ).some((c) => c.id.startsWith("overlap")),
    ).toBe(true);
    expect(
      validatePlan([manual({ end: 500 })], data.settings).some((c) =>
        c.id.startsWith("duration"),
      ),
    ).toBe(true);
  });
  it("bevarar låsta, manuella och genomförda aktiviteter vid ny generering", () => {
    const data = createData();
    let plan = generateWeek(week, data).plan;
    const locked = manual({ id: "my-meeting" });
    plan.activities = plan.activities.filter(
      (a) => !(a.date === week && a.start === 510),
    );
    plan.activities.push(locked);
    plan.activities.find((a) => a.categoryId === "music")!.status = "done";
    const result = generateWeek(week, data, plan);
    expect(result.plan.activities).toContainEqual(locked);
    expect(
      result.plan.activities.filter((a) => a.status === "done"),
    ).toHaveLength(1);
    expect(validatePlan(result.plan.activities, data.settings)).toEqual([]);
    expect(new Set(result.plan.activities.map((a) => a.id)).size).toBe(
      result.plan.activities.length,
    );
  });
  it("stoppar flytt av låsta tider och fragmentering av skyddade block", () => {
    const data = createData(),
      a = manual(),
      moved = { ...a, start: 600, end: 660 };
    expect(
      validateMove(a, moved, [a], data.settings, data.categories),
    ).toContain("Låst");
    const music = manual({
      categoryId: "music",
      blockType: "protected",
      end: 720,
    });
    data.settings.musicMovable = true;
    data.categories.find((c) => c.id === "music")!.movable = true;
    expect(
      validateMove(
        music,
        { ...music, end: 600 },
        [music],
        data.settings,
        data.categories,
      ),
    ).toContain("helt block");
    expect(
      validateMove(
        music,
        { ...music, date: addDays(week, 3) },
        [music],
        data.settings,
        data.categories,
      ),
    ).toBeNull();
  });
  it("respekterar buffert, minsta passlängd och odelbar egen kategori", () => {
    const data = createData();
    data.settings.musicMornings = 0;
    data.settings.buffer = 10;
    data.categories.find((c) => c.id === "learning")!.targetMinutes = 120;
    data.categories.find((c) => c.id === "career")!.targetMinutes = 60;
    data.categories.push({
      id: "writing",
      name: "Skrivande",
      color: "#234567",
      targetMinutes: 120,
      minBlock: 60,
      priority: 5,
      allowSplit: false,
      movable: true,
    });
    const r = generateWeek(week, data);
    expect(validatePlan(r.plan.activities, data.settings)).toEqual([]);
    expect(
      r.plan.activities.filter((a) => a.categoryId === "writing"),
    ).toHaveLength(1);
    expect(
      r.plan.activities.find((a) => a.categoryId === "writing")!.end -
        r.plan.activities.find((a) => a.categoryId === "writing")!.start,
    ).toBe(120);
    for (const a of r.plan.activities.filter(
      (a) => a.blockType === "flexible" && a.categoryId === "learning",
    ))
      expect(a.end - a.start).toBeGreaterThanOrEqual(60);
  });
  it("återkommande möten skapas på rätt veckodag även över sommartidsbyte och dupliceras inte", () => {
    const data = createData();
    const {
      id: _id,
      date: _date,
      source: _s,
      status: _st,
      ...a
    } = manual({ start: 510, end: 570 });
    const r: RecurringActivity = {
      ...a,
      id: "r",
      weekdays: [0],
      startsOn: week,
    };
    data.recurring = [r];
    const result = generateWeek("2026-11-02", data);
    const repeated = result.plan.activities.find(
      (a) => a.recurrenceId === "r",
    )!;
    expect(repeated.date).toBe("2026-11-02");
    expect(repeated.start).toBe(510);
    expect(
      generateWeek("2026-11-02", data, result.plan).plan.activities.filter(
        (a) => a.recurrenceId === "r",
      ),
    ).toHaveLength(1);
  });
  it("slår larm när en återkommande låst aktivitet krockar med lunch", () => {
    const data = createData();
    const { id, date, source, status, ...a } = manual({ start: 720, end: 780 });
    data.recurring = [{ ...a, id: "r", weekdays: [0], startsOn: week }];
    expect(
      generateWeek(week, data).conflicts.some((c) =>
        c.id.startsWith("overlap"),
      ),
    ).toBe(true);
  });
  it("räknar måndag och ISO-vecka korrekt över årsskifte och tidsomställning", () => {
    expect(monday("2027-01-01")).toBe("2026-12-28");
    expect(weekNumber("2027-01-01")).toBe(53);
    expect(weekNumber("2027-01-04")).toBe(1);
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(weekday("2026-10-26")).toBe(0);
  });
  it("ger samma aktiviteter för samma indata och bevarar äldre veckor", () => {
    const d = createData();
    const a = generateWeek(week, d).plan;
    d.weeks[week] = a;
    const before = JSON.stringify(d.weeks[week]);
    expect(generateWeek(week, d).plan.activities).toEqual(a.activities);
    generateWeek(addDays(week, 7), d);
    expect(JSON.stringify(d.weeks[week])).toBe(before);
    expect(capacity(d.settings)).toBe(1500);
  });
});
describe("persistent lokal lagring", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
  it("återläser plan, status, mål och reflektioner utan dataförlust", () => {
    const d = createData();
    d.weeks[week] = generateWeek(week, d).plan;
    d.weeks[week].activities[0].status = "done";
    d.tasks[0].done = true;
    d.reflections[week] = {
      week,
      good: "Lugnare",
      unfinished: "",
      balance: "Bra",
      next: "Mer luft",
      updatedAt: new Date().toISOString(),
    };
    saveLocal(storage, d);
    expect(loadLocal(storage)).toEqual(d);
    expect(values.has(STORAGE_KEY)).toBe(true);
  });
  it("vägrar korrupt eller inkompatibel data utan att skriva över originalet", () => {
    const raw = '{"version":2}';
    storage.setItem(STORAGE_KEY, raw);
    expect(() => loadLocal(storage)).toThrow();
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    expect(() => decodeData("{")).toThrow();
  });
  it("avvisar felaktiga tider, färger och saknade livsområden i importer", () => {
    const d = createData();
    d.weeks[week] = generateWeek(week, d).plan;
    d.weeks[week].activities[0].end = 0;
    expect(() => decodeData(JSON.stringify(d))).toThrow();
    const e = createData();
    e.categories[0].color = "bad";
    expect(() => decodeData(JSON.stringify(e))).toThrow();
  });
});
describe("historik och skyddade placeringar", () => {
  it("håller kvar musikförmiddagen när automatisk flytt är förbjuden", () => {
    const data = createData();
    const plan = generateWeek(week, data).plan;
    const music = plan.activities.find((a) => a.categoryId === "music")!;
    const moved = { ...music, date: addDays(week, 3) };
    plan.activities = plan.activities.filter(
      (a) => a.date !== moved.date && a.id !== music.id,
    );
    plan.activities.push(moved);
    const regenerated = generateWeek(week, data, plan);
    expect(regenerated.plan.activities).toContainEqual(moved);
  });
  it("bedömer tidigare veckor mot deras sparade regler, inte nya inställningar", () => {
    const d = createData(),
      plan = generateWeek(week, d).plan;
    d.settings.start = 600;
    d.settings.musicMornings = 1;
    d.categories.find((c) => c.id === "learning")!.targetMinutes = 900;
    expect(assessWeek(plan, d)).toEqual([]);
  });
});
describe("uppdatering av standardtexter", () => {
  it("ersätter äldre demotexter utan att ändra egna texter eller planeringsdata", () => {
    const data = createData();
    data.weeks[week] = generateWeek(week, data).plan;
    data.goals[0].title = "Ta nästa steg i arbetslivet";
    data.goals[0].description =
      "Meningsfulla kontakter och genomarbetade ansökningar.";
    data.goals[1].title = "Min egen utbildningsplan";
    data.goals[1].description = "Min egen beskrivning";
    data.goals.push({ ...data.goals[0], id: "custom-goal" });
    data.tasks[0].done = true;
    const training = data.weeks[week].activities.find(
      (a) => a.categoryId === "health",
    )!;
    training.title = "Träning & ny energi";
    training.status = "done";
    const before = structuredClone(data);
    const loaded = decodeData(JSON.stringify(data));
    expect(loaded.goals[0].title).toBe("Jobbsökande och nätverkande");
    expect(loaded.goals[0].description).toBe(createData().goals[0].description);
    expect(loaded.goals[1]).toEqual(before.goals[1]);
    expect(loaded.goals.at(-1)).toEqual(before.goals.at(-1));
    expect(loaded.tasks).toEqual(before.tasks);
    expect(loaded.settings).toEqual(before.settings);
    const updated = loaded.weeks[week].activities.find(
      (a) => a.id === training.id,
    )!;
    expect(updated).toEqual({ ...training, title: "Träning" });
    expect(decodeData(JSON.stringify(loaded))).toEqual(loaded);
  });
});
