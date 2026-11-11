import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createData } from "../lib/defaults";
import {
  saveDailyCheckIn,
  removeDailyCheckIn,
  dailyPriorityOptions,
  currentDailyFocus,
  NO_DAILY_FOCUS,
} from "../lib/daily-check-in";
import { dailyStart, previewGentleDay } from "../lib/daily-start";
import { logContact } from "../lib/network-overview";
import { nextSteps } from "../lib/next-steps";
import { generateWeek } from "../lib/planner";
import { decodeData } from "../lib/storage";
import { WorkspaceSync, type CloudDocument } from "../lib/workspace-sync";
import type { DailyCheckIn, JobApplication } from "../lib/types";
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
  const app = (
    id: string,
    extra: Partial<JobApplication> = {},
  ): JobApplication => ({
    id,
    role: "Utredare",
    organization: id,
    status: "draft",
    deadline: "",
    nextAction: "",
    followUpDate: "",
    notes: "Behåll",
    ...extra,
  });
  data.applications = [
    app("later", { deadline: "2026-11-15" }),
    app("today", { deadline: date }),
    app("undated"),
    app("sent", {
      organization: "KuF",
      role: "Chefssekreterare",
      status: "sent",
      deadline: "2026-11-10",
    }),
    app("expired", { deadline: "2026-11-10" }),
    app("closed", { status: "closed" }),
  ];
  data.contacts = [
    {
      id: "waiting",
      name: "Kim",
      organization: "",
      nextAction: "Invänta svar",
      nextActionKind: "waiting",
      followUpDate: "2026-11-15",
      entries: [],
    },
    {
      id: "fresh",
      name: "Alex",
      organization: "",
      nextAction: "",
      followUpDate: "",
      entries: [],
    },
    {
      id: "due",
      name: "Anna",
      organization: "Kommunen",
      nextAction: "Fråga om tjänsten",
      followUpDate: date,
      entries: [
        {
          id: "old",
          date: "2026-11-10",
          channel: "E-post",
          notes: "Hör gärna av dig igen.",
        },
      ],
    },
  ];
  data.habits = [];
  data.careerActions = [];
  data.deadlines = [];
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
    applicationIds: ["today", "later"],
    contactIds: ["due"],
    focus: { kind: "application", id: "today", title: "Utredare · today" },
    updatedAt: "2026-11-11T07:00:00.000Z",
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T07:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("dagsprioriteringar och en konkret start", () => {
  it("sorterar riktiga utkast efter deadline och kontakter efter befintlig uppföljning", () => {
    const options = dailyPriorityOptions(fixture(), date);
    expect(options.applications.map((a) => a.id)).toEqual([
      "today",
      "later",
      "undated",
    ]);
    expect(options.contacts.map(({ contact }) => contact.id)).toEqual([
      "due",
      "fresh",
      "waiting",
    ]);
  });
  it("sparar flera val som referenser utan nya uppgifter, bokningar, ändrade ansökningar eller måendedata", () => {
    const data = fixture(),
      before = structuredClone(data);
    expect(decodeData(JSON.stringify(data)).dailyCheckIns).toBeUndefined();
    const next = saveDailyCheckIn(data, date, entry(), date);
    expect(data).toEqual(before);
    expect(next.tasks).toBe(data.tasks);
    expect(next.weeks).toBe(data.weeks);
    expect(next.applications).toBe(data.applications);
    expect(next.contacts).toBe(data.contacts);
    expect(next.careerActions).toBe(data.careerActions);
    expect(decodeData(JSON.stringify(next)).dailyCheckIns?.[date]).toEqual(
      entry(),
    );
    expect(next.dailyCheckIns?.[date]).not.toHaveProperty("mood");
    expect(dailyStart(next, boundary).firstStep).toMatchObject({
      kind: "application",
      id: "today",
    });
    expect(dailyStart(next, boundary).recommendation).toBeUndefined();
  });
  it("inskickade och utgångna jobb föreslås aldrig på nytt som arbete att söka", () => {
    const data = saveDailyCheckIn(fixture(), date, entry(), date);
    data.applications!.find((a) => a.id === "today")!.status = "sent";
    expect(
      currentDailyFocus(data, data.dailyCheckIns![date], boundary),
    ).toBeUndefined();
    expect(dailyStart(data, boundary).recommendation).toBeUndefined();
    expect(
      nextSteps(data, week).filter(
        (item) => item.kind === "deadline" && item.title.includes("KuF"),
      ),
    ).toEqual([]);
    expect(() => saveDailyCheckIn(data, date, entry(), date)).toThrow(
      "inte längre ett aktuellt utkast",
    );
    const expired = {
      ...entry(),
      applicationIds: ["expired"],
      focus: { ...entry().focus, id: "expired" },
    };
    expect(() => saveDailyCheckIn(fixture(), date, expired, date)).toThrow();
  });
  it("riktar kontaktstarten till originalkontakten och slutar rekommendera den efter loggad kontakt", () => {
    const value: DailyCheckIn = {
      ...entry(),
      focus: {
        kind: "contact",
        id: "due",
        title: "Anna",
        contactEntryId: "old",
      },
    };
    const data = saveDailyCheckIn(fixture(), date, value, date);
    expect(
      currentDailyFocus(data, data.dailyCheckIns![date], boundary),
    ).toMatchObject({ kind: "contact", id: "due" });
    const contacted = logContact(data, "due", {
      date,
      channel: "Telefon",
      notes: "Samtalet genomfört.",
    });
    expect(
      currentDailyFocus(contacted, contacted.dailyCheckIns![date], boundary),
    ).toBeUndefined();
    expect(data.contacts![2].entries).toHaveLength(1);
    const fresh = {
      ...entry(),
      contactIds: ["fresh"],
      focus: { kind: "contact" as const, id: "fresh", title: "Alex" },
    };
    expect(
      decodeData(JSON.stringify(saveDailyCheckIn(data, date, fresh, date)))
        .dailyCheckIns?.[date].focus,
    ).toEqual(fresh.focus);
  });
  it("låter en redan kontaktad person väljas igen med ett uttryckligt nytt dagsval", () => {
    const data = fixture();
    data.contacts![2].entries[0].date = date;
    const value: DailyCheckIn = {
      ...entry(),
      focus: {
        kind: "contact",
        id: "due",
        title: "Anna",
        contactEntryId: "old",
      },
    };
    const next = saveDailyCheckIn(data, date, value, date);
    expect(
      currentDailyFocus(next, next.dailyCheckIns![date], boundary)?.id,
    ).toBe("due");
  });
  it("har en fungerande väg till vanliga uppgifter eller bara befintlig plan även utan jobb och kontakter", () => {
    const data = fixture();
    data.applications = [];
    data.contacts = [];
    const taskValue: DailyCheckIn = {
      ...entry(),
      applicationIds: [],
      contactIds: [],
      focus: { kind: "task", id: "t", title: "Skriv första stycket" },
    };
    const next = saveDailyCheckIn(data, date, taskValue, date);
    expect(dailyStart(next, boundary).recommendation?.task?.id).toBe("t");
    next.tasks[0].done = true;
    expect(dailyStart(next, boundary).recommendation).toBeUndefined();
    const unchanged = saveDailyCheckIn(
      data,
      date,
      { ...taskValue, focus: NO_DAILY_FOCUS },
      date,
    );
    expect(unchanged.tasks).toBe(data.tasks);
    expect(unchanged.weeks).toBe(data.weeks);
    expect(() => saveDailyCheckIn(data, date, taskValue, date)).toThrow(
      "inte längre aktuellt",
    );
  });
  it("uppdaterar en post per Stockholmsdag och kan radera idag utan att ändra gårdagens plan", () => {
    const data = saveDailyCheckIn(fixture(), date, entry(), date);
    const edited = saveDailyCheckIn(
      data,
      date,
      { ...entry(), contactIds: [] },
      date,
    );
    expect(Object.keys(edited.dailyCheckIns!)).toEqual([date]);
    expect(
      dailyStart(edited, { date: "2026-11-12", minute: 480 }).checkIn,
    ).toBeUndefined();
    const tomorrow = saveDailyCheckIn(
      edited,
      "2026-11-12",
      { ...entry(), applicationIds: [], focus: NO_DAILY_FOCUS },
      "2026-11-12",
    );
    expect(
      Object.keys(removeDailyCheckIn(tomorrow, date).dailyCheckIns!),
    ).toEqual(["2026-11-12"]);
    expect(() => saveDailyCheckIn(data, date, entry(), "2026-11-12")).toThrow(
      "Dagen har ändrats",
    );
  });
  it("avvisar trasiga importer och inaktuella val, men bevarar borttagna referenser i gammal historik", () => {
    for (const dailyCheckIns of [
      null,
      [],
      { "2026-02-30": entry() },
      { [date]: { ...entry(), applicationIds: ["today", "today"] } },
      { [date]: { ...entry(), contactIds: [2] } },
      {
        [date]: {
          ...entry(),
          focus: { kind: "application", id: "unselected", title: "Fel" },
        },
      },
      { [date]: { ...entry(), focus: null } },
      { [date]: { ...entry(), updatedAt: "invalid" } },
    ]) {
      expect(() =>
        decodeData(JSON.stringify({ ...fixture(), dailyCheckIns })),
      ).toThrow();
    }
    const data = fixture();
    data.applications = [];
    data.contacts = [];
    expect(
      decodeData(
        JSON.stringify({ ...data, dailyCheckIns: { [date]: entry() } }),
      ).dailyCheckIns?.[date],
    ).toEqual(entry());
    expect(() => saveDailyCheckIn(data, date, entry(), date)).toThrow();
    const missingContact: DailyCheckIn = {
      ...entry(),
      applicationIds: [],
      focus: NO_DAILY_FOCUS,
    };
    expect(() => saveDailyCheckIn(data, date, missingContact, date)).toThrow(
      "finns inte längre",
    );
  });
  it("bevarar dagens prioriteringar vid veckogenerering och låter en godkänd låg-ork-plan styra dagens insats", () => {
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
    expect(gentle.data.dailyCheckIns).toEqual(data.dailyCheckIns);
    expect(dailyStart(gentle.data, boundary).firstStep).toBeUndefined();
    expect(
      dailyStart(gentle.data, boundary).recommendation?.activity?.taskId,
    ).toBe("u");
  });
  it("följer med kontots vanliga molntransport och återläsning", async () => {
    const data = saveDailyCheckIn(fixture(), date, entry(), date);
    let remote: CloudDocument | null = {
      data: fixture(),
      revision: 1,
      updatedAt: "2026-11-11T07:00:00.000Z",
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
