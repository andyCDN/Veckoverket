import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import {
  EXAMPLE_WEEK_SCHEDULE,
  scheduleImportText,
  parseScheduleText,
  previewScheduleImport,
  scheduleRowErrors,
  verifyScheduleImport,
} from "../lib/schedule-import";
import { generateWeek, validatePlan, targetMinutes } from "../lib/planner";
import { initializePersonalSchedule } from "../lib/initialize-personal-schedule";
import { decodeData } from "../lib/storage";
import {
  dayBounds,
  weekendStartsOn,
  reviewCheckLabel,
} from "../lib/week-template";
import {
  overfilledWorkspace,
  overfilledWeek as week,
} from "./fixtures/overfilled-week";
import { weeklyRoutines } from "../lib/weekly-routines";

const options = {
  firstWeek: week,
  weeks: 1,
  useForNewWeeks: true,
  keepExternal: false,
  name: "Min plan",
  id: "import-operation",
  importedAt: "2026-11-21T10:00:00Z",
};
const original = `Måndag
8.30, veckoincheck
9.00, arbetspasss söka jobb, 1,5h
10.30, träna
11.30, lunch
12.30, kompetensutveckling 1,5h
14.00 Nätverksförfrågningar
Tisdag
8.30 Arbetspass, söka jobb
10.00 Kompetensutvecking
11.30 Lunch
12.30
Onsdag
08.30 Arbetspass jobbsök
10.00 Kompetensutveckling
11.30 Lunch
12.30 Träna
13.30 något
15.00 hämta
Torsdag
08.30 Arbetspass jobbsök
10.00 Träna
11.00 Kompetensutveckling
12.00 Lunch
13.00 Stänga veckan - flytta fredagschecken hit`;
function rows(data = createData()) {
  return parseScheduleText(EXAMPLE_WEEK_SCHEDULE, data.categories).rows;
}

describe("schemaimport från användarens text och CSV", () => {
  it("läser den tidigare inklistrade planen med decimaler, skrivfel, föreslagna sluttider och öppna luckor", () => {
    const data = createData();
    const parsed = parseScheduleText(original, data.categories);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(19);
    expect(scheduleRowErrors(parsed.rows, data.categories)).toEqual([]);
    expect(
      parsed.rows
        .filter((r) => r.day === 0)
        .map((r) => [r.start, r.end, r.categoryId]),
    ).toEqual([
      [510, 540, "weekly-planning"],
      [540, 630, "career"],
      [630, 690, "health"],
      [690, 750, "rest"],
      [750, 840, "learning"],
      [840, 900, "networking"],
    ]);
    expect(parsed.rows.some((r) => r.day === 1 && r.start >= 750)).toBe(false);
    expect(
      parsed.rows.some((r) => r.day === 2 && r.start >= 810 && r.start < 900),
    ).toBe(false);
    expect(parsed.rows.at(-1)).toMatchObject({ day: 3, start: 780, end: 810 });
  });
  it("läser explicita tider och CSV med korta veckodagar, avgränsare och citerade titlar", () => {
    const parsed = parseScheduleText(
      'Dag;Start;Slut;Aktivitet;Område\nMån;11:00;12:00;"Kurs; design";learning',
      createData().categories,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toMatchObject([
      {
        day: 0,
        start: 660,
        end: 720,
        title: "Kurs; design",
        categoryId: "learning",
      },
    ]);
    expect(
      parseScheduleText(EXAMPLE_WEEK_SCHEDULE, createData().categories).rows,
    ).toHaveLength(19);
  });
  it("stoppar ogiltiga, överlappande och okategoriserade rader före import", () => {
    const data = createData();
    const parsed = parseScheduleText(
      "Måndag\n10.00–12.00 Kompetensutveckling\n11.00–13.00 Ny sak",
      data.categories,
    );
    expect(scheduleRowErrors(parsed.rows, data.categories).join(" ")).toContain(
      "överlappar",
    );
    expect(scheduleRowErrors(parsed.rows, data.categories).join(" ")).toContain(
      "välj ett område",
    );
    expect(
      parseScheduleText("Måndag\n99.00 Jobbsök", data.categories).errors,
    ).not.toEqual([]);
    expect(() => previewScheduleImport(data, parsed.rows, options)).toThrow();
    expect(() =>
      previewScheduleImport(data, rows(data), {
        ...options,
        firstWeek: "2026-11-24",
      }),
    ).toThrow("måndag");
  });
});

describe("importen ersätter planeringen och använder det granskade schemat", () => {
  it("visar vilka gamla pass som ersätts och lämnar datan oförändrad tills resultatet väljs", () => {
    const data = overfilledWorkspace(),
      before = structuredClone(data);
    const preview = previewScheduleImport(data, rows(data), options);
    expect(data).toEqual(before);
    expect(preview.changes[0].removed).toHaveLength(23);
    const plan = preview.data.weeks[week];
    expect(plan.activities).toHaveLength(19);
    expect(
      plan.activities
        .filter((a) => a.date === week && a.categoryId === "learning")
        .map((a) => [a.start, a.end]),
    ).toEqual([[750, 840]]);
    expect(plan.replacedActivities?.some((a) => a.id === "linked-course")).toBe(
      true,
    );
    expect(
      preview.data.tasks.find((t) => t.id === "course-task")?.needsPlanning,
    ).toBe(true);
    expect(() =>
      verifyScheduleImport(preview.data, preview.proof),
    ).not.toThrow();
    expect(() => verifyScheduleImport(data, preview.proof)).toThrow(
      "verifieras",
    );
  });
  it("ett ändrat importerat schema styr både kalender, tidsgränser, nya veckor och omladdning", () => {
    const data = overfilledWorkspace();
    const custom = parseScheduleText(
      "Måndag\n11.00–12.00 Kompetensutveckling\nTorsdag\n14.00–14.20 Stänga veckan",
      data.categories,
    ).rows;
    const preview = previewScheduleImport(data, custom, {
      ...options,
      weeks: 2,
    });
    const saved = decodeData(JSON.stringify(preview.data));
    expect(
      saved.weeks[week].activities.map((a) => [a.title, a.start, a.end]),
    ).toEqual([
      ["Kompetensutveckling", 660, 720],
      ["Stänga veckan", 840, 860],
    ]);
    expect(
      initializePersonalSchedule(saved, { date: "2026-11-21", minute: 600 }),
    ).toBe(saved);
    expect(dayBounds(saved.settings, 0)).toEqual({ start: 660, end: 720 });
    expect(weekendStartsOn(saved.settings)).toBe(4);
    expect(weeklyRoutines(saved.settings)).toMatchObject([
      { kind: "week-review", day: 3, start: 840, minutes: 20 },
    ]);
    expect(reviewCheckLabel(saved.settings)).toBe("Torsdagscheck");
    const future = generateWeek("2026-12-07", saved).plan;
    expect(future.activities.map((a) => [a.start, a.end])).toEqual([
      [660, 720],
      [840, 860],
    ]);
    const oldTime = { ...future.activities[0], start: 750, end: 840 };
    expect(
      validatePlan([oldTime], saved.settings).some(
        (c) => c.severity === "error",
      ),
    ).toBe(true);
    expect(
      targetMinutes(
        saved.categories.find((c) => c.id === "learning")!,
        saved.settings,
      ),
    ).toBe(60);
  });
  it("kan gälla enbart valda veckor och överskrivs inte av det globala standardschemat", () => {
    const data = initializePersonalSchedule(createData(), {
      date: "2026-11-21",
      minute: 600,
    });
    const custom = parseScheduleText(
      "Måndag\n11.00–12.00 Kompetensutveckling",
      data.categories,
    ).rows;
    const preview = previewScheduleImport(data, custom, {
      ...options,
      useForNewWeeks: false,
    });
    expect(preview.data.settings).toBe(data.settings);
    expect(
      initializePersonalSchedule(preview.data, {
        date: "2026-11-21",
        minute: 600,
      }),
    ).toBe(preview.data);
    expect(
      generateWeek("2026-11-30", preview.data).plan.activities,
    ).toHaveLength(19);
    const corrected = {
      ...preview.data,
      weeks: {
        ...preview.data.weeks,
        [week]: {
          ...preview.data.weeks[week],
          activities: [
            ...preview.data.weeks[week].activities,
            {
              ...preview.data.weeks[week].activities[0],
              id: "extra",
              start: 900,
              end: 960,
            },
          ],
        },
      },
    };
    const result = initializePersonalSchedule(corrected, {
      date: "2026-11-21",
      minute: 600,
    });
    expect(result.settings).toBe(data.settings);
    expect(result.weeks[week].activities.map((a) => [a.start, a.end])).toEqual([
      [660, 720],
    ]);
  });
  it("accepterar egna titlar för skyddade pass och samma titel inom olika områden", () => {
    const data = createData();
    const parsed = parseScheduleText(
      "Dag;Start;Slut;Aktivitet;Område\nMån;08:00;09:00;Gym;health\nMån;09:00;09:30;Paus;rest\nMån;09:30;10:00;Lämna;family\nMån;10:00;11:00;Workshop;learning\nMån;11:00;12:00;Workshop;career",
      data.categories,
    );
    expect(parsed.errors).toEqual([]);
    const preview = previewScheduleImport(data, parsed.rows, options);
    expect(preview.data.weeks[week].activities.map((a) => a.title)).toEqual([
      "Gym",
      "Paus",
      "Lämna",
      "Workshop",
      "Workshop",
    ]);
    expect(
      parseScheduleText(
        scheduleImportText(preview.blocks),
        data.categories,
      ).rows.map((r) => [r.day, r.start, r.end, r.title, r.categoryId]),
    ).toEqual(
      parsed.rows.map((r) => [r.day, r.start, r.end, r.title, r.categoryId]),
    );
    expect(() =>
      verifyScheduleImport(preview.data, preview.proof),
    ).not.toThrow();
    expect(
      initializePersonalSchedule(preview.data, {
        date: "2026-11-21",
        minute: 600,
      }),
    ).toBe(preview.data);
  });
  it("en ny standard ändrar inte redan sparade veckor utanför det valda intervallet", () => {
    const data = overfilledWorkspace();
    const other = "2026-12-21";
    data.weeks[other] = generateWeek(other, data).plan;
    const original = structuredClone(data.weeks[other]);
    const preview = previewScheduleImport(
      data,
      parseScheduleText(
        "Måndag\n11.00–12.00 Kompetensutveckling",
        data.categories,
      ).rows,
      options,
    );
    const reloaded = initializePersonalSchedule(preview.data, {
      date: "2026-11-21",
      minute: 600,
    });
    expect(reloaded.weeks[other]).toEqual(original);
    expect(reloaded).toBe(preview.data);
  });
  it("upprepad import ger samma antal aktiva pass och samlar inte dubbletter", () => {
    const data = overfilledWorkspace();
    const first = previewScheduleImport(data, rows(data), options);
    const second = previewScheduleImport(first.data, rows(first.data), {
      ...options,
      id: "second-import",
    });
    expect(second.data.weeks[week].activities).toEqual(
      first.data.weeks[week].activities,
    );
    expect(second.data.weeks[week].replacedActivities).toEqual(
      first.data.weeks[week].replacedActivities,
    );
    expect(second.changes[0].removed).toEqual([]);
    expect(() => verifyScheduleImport(second.data, second.proof)).not.toThrow();
  });
  it("behåller utfall och kan bevara fasta kalenderbokningar enligt användarens val", () => {
    const data = overfilledWorkspace();
    const done = {
      ...data.weeks[week].activities[0],
      id: "done",
      status: "done" as const,
      title: "Genomfört möte",
      categoryId: "family",
      start: 960,
      end: 990,
    };
    const external = {
      ...data.weeks[week].activities.find((a) => a.external)!,
      id: "own-meeting",
      title: "Eget möte",
      start: 960,
      end: 990,
    };
    data.weeks[week].activities.push(done, external);
    const course = data.weeks[week].activities.find((a) => a.external)!;
    course.categoryId = "learning";
    const kept = previewScheduleImport(data, rows(data), {
      ...options,
      keepExternal: true,
    });
    expect(kept.data.weeks[week].activities).toContain(done);
    expect(kept.data.weeks[week].activities).toContain(external);
    expect(kept.data.weeks[week].activities).toContain(course);
    expect(kept.changes[0].external).toBe(2);
    const replaced = previewScheduleImport(data, rows(data), {
      ...options,
      keepExternal: false,
    });
    expect(replaced.data.weeks[week].activities).toContain(done);
    expect(replaced.data.weeks[week].activities).not.toContain(external);
    expect(replaced.data.weeks[week].activities).not.toContain(course);
    expect(replaced.data.weeks[week].replacedActivities).toContain(external);
  });
  it("verifieringen avvisar ignorerad eller ändrad sparning och ogiltiga säkerhetskopior", () => {
    const data = createData(),
      preview = previewScheduleImport(data, rows(data), options);
    const changed = structuredClone(preview.data);
    changed.weeks[week].activities[0].end++;
    expect(() => verifyScheduleImport(changed, preview.proof)).toThrow();
    const invalid = structuredClone(preview.data);
    invalid.settings.importedSchedule!.blocks[0].end = 0;
    expect(() => decodeData(JSON.stringify(invalid))).toThrow(
      "importerade schemat",
    );
  });
});
