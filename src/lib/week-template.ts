import type { Activity, Settings } from "./types";
import { weekday, DAY_NAMES } from "./date";

export const WEEK_TEMPLATE_ID = "mon-thu-v1" as const;
export type WeekTemplateBlock = {
  id: string;
  day: number;
  title: string;
  categoryId: string;
  start: number;
  end: number;
  blockType: Activity["blockType"];
  routine?: Activity["routine"];
};
export const FOUR_DAY_WEEK: WeekTemplateBlock[] = [
  {
    id: "monday-check",
    day: 0,
    title: "Veckoincheck",
    categoryId: "weekly-planning",
    start: 510,
    end: 540,
    blockType: "protected",
    routine: "week-start",
  },
  {
    id: "monday-job",
    day: 0,
    title: "Söka jobb",
    categoryId: "career",
    start: 540,
    end: 630,
    blockType: "flexible",
  },
  {
    id: "monday-training",
    day: 0,
    title: "Träna",
    categoryId: "health",
    start: 630,
    end: 690,
    blockType: "protected",
  },
  {
    id: "monday-lunch",
    day: 0,
    title: "Lunch",
    categoryId: "rest",
    start: 690,
    end: 750,
    blockType: "locked",
  },
  {
    id: "monday-learning",
    day: 0,
    title: "Kompetensutveckling",
    categoryId: "learning",
    start: 750,
    end: 840,
    blockType: "flexible",
  },
  {
    id: "monday-network",
    day: 0,
    title: "Nätverksförfrågningar",
    categoryId: "networking",
    start: 840,
    end: 900,
    blockType: "flexible",
  },
  {
    id: "tuesday-job",
    day: 1,
    title: "Söka jobb",
    categoryId: "career",
    start: 510,
    end: 600,
    blockType: "flexible",
  },
  {
    id: "tuesday-learning",
    day: 1,
    title: "Kompetensutveckling",
    categoryId: "learning",
    start: 600,
    end: 690,
    blockType: "flexible",
  },
  {
    id: "tuesday-lunch",
    day: 1,
    title: "Lunch",
    categoryId: "rest",
    start: 690,
    end: 750,
    blockType: "locked",
  },
  {
    id: "wednesday-job",
    day: 2,
    title: "Söka jobb",
    categoryId: "career",
    start: 510,
    end: 600,
    blockType: "flexible",
  },
  {
    id: "wednesday-learning",
    day: 2,
    title: "Kompetensutveckling",
    categoryId: "learning",
    start: 600,
    end: 690,
    blockType: "flexible",
  },
  {
    id: "wednesday-lunch",
    day: 2,
    title: "Lunch",
    categoryId: "rest",
    start: 690,
    end: 750,
    blockType: "locked",
  },
  {
    id: "wednesday-training",
    day: 2,
    title: "Träna",
    categoryId: "health",
    start: 750,
    end: 810,
    blockType: "protected",
  },
  {
    id: "wednesday-pickup",
    day: 2,
    title: "Hämta",
    categoryId: "family",
    start: 900,
    end: 930,
    blockType: "locked",
  },
  {
    id: "thursday-job",
    day: 3,
    title: "Söka jobb",
    categoryId: "career",
    start: 510,
    end: 600,
    blockType: "flexible",
  },
  {
    id: "thursday-training",
    day: 3,
    title: "Träna",
    categoryId: "health",
    start: 600,
    end: 660,
    blockType: "protected",
  },
  {
    id: "thursday-learning",
    day: 3,
    title: "Kompetensutveckling",
    categoryId: "learning",
    start: 660,
    end: 720,
    blockType: "flexible",
  },
  {
    id: "thursday-lunch",
    day: 3,
    title: "Lunch",
    categoryId: "rest",
    start: 720,
    end: 780,
    blockType: "locked",
  },
  {
    id: "thursday-check",
    day: 3,
    title: "Stänga veckan",
    categoryId: "weekly-planning",
    start: 780,
    end: 810,
    blockType: "protected",
    routine: "week-review",
  },
];
export const usesWeekTemplate = (s: Settings) =>
  s.weekTemplate === WEEK_TEMPLATE_ID;
export const templateBlocks = (s?: Settings) =>
  s?.importedSchedule?.blocks ?? FOUR_DAY_WEEK;
export const weekendStartsOn = (s: Settings) =>
  usesWeekTemplate(s) && s.importedSchedule
    ? Math.max(...s.importedSchedule.blocks.map((b) => b.day)) + 1
    : usesWeekTemplate(s)
      ? 4
      : 5;
export const weekendDays = (s: Settings) =>
  Array.from(
    { length: 7 - weekendStartsOn(s) },
    (_, i) => weekendStartsOn(s) + i,
  );
export const startCheckLabel = (s: Settings) =>
  s.importedSchedule && usesWeekTemplate(s)
    ? `${DAY_NAMES[templateBlocks(s).find((b) => b.routine === "week-start")?.day ?? 0]}scheck`
    : "Måndagscheck";
export const reviewCheckLabel = (s: Settings) =>
  s.importedSchedule && usesWeekTemplate(s)
    ? `${DAY_NAMES[templateBlocks(s).find((b) => b.routine === "week-review")?.day ?? 3]}scheck`
    : usesWeekTemplate(s)
      ? "Torsdagscheck"
      : "Fredagscheck";
export function templateSettings(s: Settings): Settings {
  if (s.importedSchedule) {
    const blocks = templateBlocks(s);
    return {
      ...s,
      weekTemplate: WEEK_TEMPLATE_ID,
      days: [...new Set(blocks.map((b) => b.day))].sort(),
      start: Math.min(...blocks.map((b) => b.start)),
      end: Math.max(...blocks.map((b) => b.end)),
      musicMornings: 0,
      trainingSessions: blocks.filter((b) => b.categoryId === "health").length,
      weekends: blocks.some((b) => b.day >= 5),
      buffer: 0,
      autoPlanning: true,
    };
  }
  return {
    ...s,
    weekTemplate: WEEK_TEMPLATE_ID,
    days: [0, 1, 2, 3],
    start: 510,
    end: 930,
    lunchStart: 690,
    lunchEnd: 750,
    familyStart: 900,
    familyEnd: 930,
    musicMornings: 0,
    trainingSessions: 3,
    trainingMinutes: 60,
    weekends: false,
    buffer: 0,
    autoPlanning: true,
  };
}
export function dayBounds(s: Settings, dateOrDay: string | number) {
  if (!usesWeekTemplate(s)) return { start: s.start, end: s.end };
  const day = typeof dateOrDay === "number" ? dateOrDay : weekday(dateOrDay);
  if (s.importedSchedule) {
    const blocks = templateBlocks(s).filter((b) => b.day === day);
    return blocks.length
      ? {
          start: Math.min(...blocks.map((b) => b.start)),
          end: Math.max(...blocks.map((b) => b.end)),
        }
      : { start: s.start, end: s.end };
  }
  return {
    start: 510,
    end: day === 0 ? 900 : day === 3 ? 810 : 930,
  };
}
export function fixedDayBreaks(s: Settings, dateOrDay: string | number) {
  const day = typeof dateOrDay === "number" ? dateOrDay : weekday(dateOrDay);
  return usesWeekTemplate(s)
    ? templateBlocks(s)
        .filter((block) => block.day === day && block.blockType === "locked")
        .map(({ start, end }) => ({ start, end }))
    : [
        { start: s.lunchStart, end: s.lunchEnd },
        { start: s.familyStart, end: s.familyEnd },
      ];
}
export function templateTargetMinutes(id: string, s?: Settings) {
  return id === "rest"
    ? 0
    : templateBlocks(s)
        .filter((block) => block.categoryId === id)
        .reduce((sum, block) => sum + block.end - block.start, 0);
}
