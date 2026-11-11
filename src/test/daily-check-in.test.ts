import { describe, it, expect } from "vitest";
import { createData } from "../lib/defaults";
import {
  saveDailyCheckIn,
  removeDailyCheckIn,
  RECOVERY_FOCUS,
} from "../lib/daily-check-in";
import { dailyStart, previewGentleDay } from "../lib/daily-start";
import { generateWeek } from "../lib/planner";
import { decodeData } from "../lib/storage";
import { WorkspaceSync, type CloudDocument } from "../lib/workspace-sync";
import type { DailyCheckIn } from "../lib/types";
const date = "2026-11-11",
  week = "2026-11-09",
  boundary = { date, minute: 480 };
function fixture() {
  const data = createData();
  data.goals = [
    {
      id: "g",
      title: "Veckans leverans",
      horizon: "week",
      week,
      categoryId: "career",
      description: "",
    },
  ];
  data.tasks = [
    {
      id: "t",
      title: "Skriv första stycket",
      goalId: "g",
      done: false,
      estimatedMinutes: 30,
    },
    {
      id: "u",
      title: "Läs ett mejl",
      goalId: "g",
      done: false,
      estimatedMinutes: 15,
    },
  ];
  data.settings = {
    ...data.settings,
    musicMornings: 0,
    trainingSessions: 0,
    start: 480,
  };
  data.weeks = { [week]: { week, generatedAt: "", activities: [] } };
  return data;
}
function entry(): DailyCheckIn {
  return {
    mood: "okay",
    focus: { kind: "task", id: "t", title: "Skriv första stycket" },
    cue: "after-break",
    updatedAt: "2026-11-11T07:00:00Z",
  };
}
describe("kort dagsincheck", () => {
  it("läser äldre data och rundreser nya svar utan att ändra kalender, uppgifter eller mål", () => {
    const data = fixture(),
      before = structuredClone(data);
    expect(decodeData(JSON.stringify(data)).dailyCheckIns).toBeUndefined();
    const next = saveDailyCheckIn(data, date, entry(), date);
    expect(data).toEqual(before);
    expect(next.tasks).toBe(data.tasks);
    expect(next.weeks).toBe(data.weeks);
    expect(next.goals).toBe(data.goals);
    expect(decodeData(JSON.stringify(next)).dailyCheckIns?.[date]).toEqual(
      entry(),
    );
  });
  it("styr dagsstartens verkliga fokus och bokade pass ersätter en tidigare obokad uppgift", () => {
    const data = fixture();
    expect(dailyStart(data, boundary).recommendation?.task?.id).toBe("u");
    const next = saveDailyCheckIn(data, date, entry(), date);
    expect(dailyStart(next, boundary).recommendation?.task?.id).toBe("t");
    next.weeks[week].activities.push({
      id: "pass",
      title: "Skriv första stycket",
      taskId: "t",
      goalId: "g",
      date,
      start: 600,
      end: 630,
      estimatedMinutes: 30,
      status: "planned",
      source: "manual",
      categoryId: "career",
      blockType: "flexible",
      priority: 3,
      description: "",
    });
    expect(dailyStart(next, boundary).recommendation?.activity?.id).toBe(
      "pass",
    );
    next.tasks[0].done = true;
    expect(dailyStart(next, boundary).recommendation).toBeUndefined();
  });
  it("återhämtning skapar inget arbete, ingen bokning och ingen ersättningsuppgift", () => {
    const data = fixture();
    const next = saveDailyCheckIn(
      data,
      date,
      { ...entry(), mood: "heavy", focus: RECOVERY_FOCUS },
      date,
    );
    expect(dailyStart(next, boundary).recommendation).toBeUndefined();
    expect(next.weeks).toBe(data.weeks);
    expect(next.tasks).toBe(data.tasks);
  });
  it("uppdaterar en post per dag, bevarar gårdagen och låter nästa dag börja utan gamla val", () => {
    const data = saveDailyCheckIn(fixture(), date, entry(), date);
    const edited = saveDailyCheckIn(
      data,
      date,
      { ...entry(), mood: "good" },
      date,
    );
    expect(Object.keys(edited.dailyCheckIns!)).toEqual([date]);
    expect(
      dailyStart(edited, { date: "2026-11-12", minute: 480 }).checkIn,
    ).toBeUndefined();
    const tomorrow = saveDailyCheckIn(
      edited,
      "2026-11-12",
      entry(),
      "2026-11-12",
    );
    expect(removeDailyCheckIn(tomorrow, date).dailyCheckIns).toEqual({
      "2026-11-12": entry(),
    });
    expect(edited.dailyCheckIns?.[date].mood).toBe("good");
  });
  it("stoppar gamla dialoger över midnatt och borttagna eller klara fokusuppgifter", () => {
    expect(() =>
      saveDailyCheckIn(fixture(), date, entry(), "2026-11-12"),
    ).toThrow("Dagen har ändrats");
    const data = fixture();
    data.tasks[0].done = true;
    expect(() => saveDailyCheckIn(data, date, entry(), date)).toThrow(
      "inte längre aktuell",
    );
    expect(() =>
      saveDailyCheckIn(
        data,
        date,
        {
          ...entry(),
          focus: { kind: "activity", id: "deleted", title: "Borttaget pass" },
        },
        date,
      ),
    ).toThrow("inte längre aktuellt");
  });
  it("avvisar trasiga importer utan att kräva att historiska fokusreferenser finns kvar", () => {
    const data = fixture();
    for (const dailyCheckIns of [
      null,
      [],
      { "2026-02-30": entry() },
      { [date]: { ...entry(), mood: "invalid" } },
      { [date]: { ...entry(), cue: "after-booking" } },
      { [date]: { ...entry(), focus: null } },
      { [date]: { ...entry(), updatedAt: "invalid" } },
    ]) {
      expect(() =>
        decodeData(JSON.stringify({ ...data, dailyCheckIns })),
      ).toThrow();
    }
    data.tasks = [];
    expect(
      decodeData(
        JSON.stringify({ ...data, dailyCheckIns: { [date]: entry() } }),
      ).dailyCheckIns?.[date],
    ).toEqual(entry());
  });
  it("bevaras vid veckogenerering och hålls ihop med godkänd plan för låg ork", () => {
    const data = saveDailyCheckIn(fixture(), date, entry(), date);
    const regenerated = {
      ...data,
      weeks: {
        ...data.weeks,
        [week]: generateWeek(week, data, data.weeks[week]).plan,
      },
    };
    expect(regenerated.dailyCheckIns).toEqual(data.dailyCheckIns);
    const gentle = previewGentleDay(data, "task:u", 15, boundary);
    expect(gentle.errors).toEqual([]);
    expect(gentle.data.dailyCheckIns?.[date].focus.id).toBe("u");
    expect(
      dailyStart(gentle.data, boundary).recommendation?.activity?.taskId,
    ).toBe("u");
    const rest = previewGentleDay(data, "", 15, boundary);
    expect(rest.data.dailyCheckIns?.[date].focus).toEqual(RECOVERY_FOCUS);
    expect(dailyStart(rest.data, boundary).recommendation).toBeUndefined();
  });
  it("följer med kontots vanliga molntransport och återläsning", async () => {
    const data = saveDailyCheckIn(fixture(), date, entry(), date);
    let remote: CloudDocument | null = {
      data: fixture(),
      revision: 1,
      updatedAt: "2026-11-11T07:00:00Z",
    };
    const transport = {
      load: async () => remote,
      save: async (value: typeof data) =>
        (remote = {
          data: decodeData(JSON.stringify(value)),
          revision: 2,
          updatedAt: "2026-11-11T07:01:00Z",
        }),
    };
    const sync = new WorkspaceSync(
      "account",
      transport,
      undefined,
      () => {},
      fixture,
    );
    await sync.start();
    sync.update(data);
    await sync.flush();
    sync.dispose();
    const reloaded = new WorkspaceSync(
      "account",
      transport,
      undefined,
      () => {},
      fixture,
    );
    await reloaded.start();
    expect(reloaded.snapshot().data?.dailyCheckIns?.[date]).toEqual(entry());
    reloaded.dispose();
  });
});
