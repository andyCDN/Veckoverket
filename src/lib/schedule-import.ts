import type { Activity, AppData, Settings } from "./types";
import type { WeekTemplateBlock } from "./week-template";
import { addDays, monday, uid, DAY_NAMES, time } from "./date";
import { isLocalDate } from "./google-time";
import {
  createPersonalSchedule,
  scheduleSlotCount,
} from "./create-personal-schedule";
import { templateSettings } from "./week-template";
import {
  hasScheduledWork,
  replacedScheduleActivities,
} from "./fixed-week-policy";

export const EXAMPLE_WEEK_SCHEDULE = `Måndag
08.30–09.00 Veckoincheck
09.00–10.30 Söka jobb
10.30–11.30 Träna
11.30–12.30 Lunch
12.30–14.00 Kompetensutveckling
14.00–15.00 Nätverksförfrågningar

Tisdag
08.30–10.00 Söka jobb
10.00–11.30 Kompetensutveckling
11.30–12.30 Lunch
12.30 Öppet

Onsdag
08.30–10.00 Söka jobb
10.00–11.30 Kompetensutveckling
11.30–12.30 Lunch
12.30–13.30 Träna
13.30 Öppet
15.00–15.30 Hämta

Torsdag
08.30–10.00 Söka jobb
10.00–11.00 Träna
11.00–12.00 Kompetensutveckling
12.00–13.00 Lunch
13.00–13.30 Stänga veckan`;

export function scheduleImportText(blocks: WeekTemplateBlock[]) {
  if (blocks.some((b) => inferScheduleArea(b.title) !== b.categoryId)) {
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    return [
      "Dag;Start;Slut;Aktivitet;Område",
      ...blocks.map((b) =>
        [
          DAY_NAMES[b.day],
          time(b.start),
          time(b.end),
          cell(b.title),
          b.categoryId,
        ].join(";"),
      ),
    ].join("\n");
  }
  return [...new Set(blocks.map((b) => b.day))]
    .sort()
    .map(
      (day) =>
        `${DAY_NAMES[day]}\n${blocks
          .filter((b) => b.day === day)
          .sort((a, b) => a.start - b.start)
          .map((b) => `${time(b.start)}–${time(b.end)} ${b.title}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

export type ScheduleImportRow = {
  id: string;
  day: number;
  start: number;
  end: number;
  title: string;
  categoryId: string;
  inferredEnd?: boolean;
};
const normalize = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sv-SE")
    .trim();
const dayNames = [
  "mandag",
  "tisdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lordag",
  "sondag",
];
function dayIndex(value: string) {
  return dayNames.findIndex(
    (day) =>
      normalize(value).replace(/[:.]$/, "") === day ||
      normalize(value).replace(/[:.]$/, "") === day.slice(0, 2) ||
      normalize(value).replace(/[:.]$/, "") === day.slice(0, 3),
  );
}
function minute(value: string) {
  const match = /^(\d{1,2})[.:](\d{2})$/.exec(value.trim());
  if (!match) return NaN;
  const h = Number(match[1]),
    m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m < 60
    ? h * 60 + m
    : value === "24:00" || value === "24.00"
      ? 1440
      : NaN;
}
export function inferScheduleArea(title: string) {
  const value = normalize(title);
  if (
    /veckoincheck|veckostart|mandagscheck|stanga veckan|veckostang|fredagscheck|torsdagscheck|veckoavstam/.test(
      value,
    )
  )
    return "weekly-planning";
  if (/kompetensutveck|larande|utbildning|studier/.test(value))
    return "learning";
  if (/natverk|kontaktforfrag/.test(value)) return "networking";
  if (/soka? jobb|jobbsok/.test(value)) return "career";
  if (/trana|traning|gym|promenad/.test(value)) return "health";
  if (/lunch|paus|rast/.test(value)) return "rest";
  if (/hamta|lamna|familj|barn/.test(value)) return "family";
  return "";
}
function routine(title: string): Activity["routine"] {
  const value = normalize(title);
  return /veckoincheck|veckostart|mandagscheck/.test(value)
    ? "week-start"
    : /stanga veckan|veckostang|fredagscheck|torsdagscheck|veckoavstam/.test(
          value,
        )
      ? "week-review"
      : undefined;
}
function csvCells(line: string, delimiter: string) {
  const result: string[] = [];
  let text = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        text += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      result.push(text.trim());
      text = "";
    } else text += c;
  }
  if (quoted) throw new Error("En CSV-rad har ett oavslutat citattecken.");
  result.push(text.trim());
  return result;
}
export function parseScheduleText(
  text: string,
  categories: AppData["categories"],
) {
  const errors: string[] = [];
  const entries: Array<{
    id: string;
    day: number;
    start: number;
    end?: number;
    title: string;
    categoryId: string;
    duration?: number;
    open: boolean;
    line: number;
  }> = [];
  if (text.length > 100000)
    return {
      rows: [] as ScheduleImportRow[],
      errors: ["Schemat får vara högst 100 000 tecken."],
    };
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = lines.find((line) => line.trim()) ?? "";
  const delimiter = header.includes(";")
    ? ";"
    : header.includes("\t")
      ? "\t"
      : ",";
  const csv = /^\s*(?:dag|veckodag)\s*[;,\t]/i.test(header);
  let currentDay = -1;
  const resolveArea = (value: string, title: string) =>
    value
      ? (categories.find(
          (c) =>
            normalize(c.id) === normalize(value) ||
            normalize(c.name) === normalize(value),
        )?.id ?? inferScheduleArea(value))
      : inferScheduleArea(title);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
      .trim()
      .replace(/^[-*#]\s+/, "")
      .replace(/\*\*/g, "");
    if (!line) continue;
    if (csv && lines[i] === header) continue;
    if (!csv && dayIndex(line) >= 0) {
      currentDay = dayIndex(line);
      continue;
    }
    try {
      if (csv) {
        const cells = csvCells(line, delimiter);
        const day = dayIndex(cells[0] ?? ""),
          start = minute(cells[1] ?? ""),
          end = minute(cells[2] ?? "");
        if (
          day < 0 ||
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          !cells[3]
        ) {
          errors.push(`Rad ${i + 1}: använd Dag;Start;Slut;Aktivitet;Område.`);
          continue;
        }
        entries.push({
          id: `row-${i}`,
          day,
          start,
          end,
          title: cells[3],
          categoryId: resolveArea(cells[4] ?? "", cells[3]),
          open: false,
          line: i + 1,
        });
      } else {
        const match =
          /^(\d{1,2}[.:]\d{2})(?:\s*[–—-]\s*(\d{1,2}[.:]\d{2}))?\s*[,;:]?\s*(.*)$/.exec(
            line,
          );
        if (
          currentDay < 0 ||
          !match ||
          !Number.isFinite(minute(match[1])) ||
          (match[2] && !Number.isFinite(minute(match[2])))
        ) {
          errors.push(
            `Rad ${i + 1}: ange veckodag och en giltig starttid, till exempel 08.30.`,
          );
          continue;
        }
        let title = match[3].trim();
        const duration =
          /(?:,\s*)?(\d+(?:[.,]\d+)?)\s*(h|tim(?:mar)?|min(?:uter)?)\s*$/i.exec(
            title,
          );
        if (duration)
          title = title.slice(0, duration.index).replace(/[,;\s]+$/, "");
        const open =
          !title ||
          /^(?:oppet|ledig(?:t)?|nagot|fri tid)$/u.test(normalize(title));
        entries.push({
          id: `row-${i}`,
          day: currentDay,
          start: minute(match[1]),
          end: match[2] ? minute(match[2]) : undefined,
          title,
          categoryId: inferScheduleArea(title),
          duration: duration
            ? Math.round(
                Number(duration[1].replace(",", ".")) *
                  (duration[2].toLowerCase().startsWith("min") ? 1 : 60),
              )
            : undefined,
          open,
          line: i + 1,
        });
      }
    } catch (error) {
      errors.push(
        `Rad ${i + 1}: ${error instanceof Error ? error.message : "raden kunde inte läsas."}`,
      );
    }
  }
  const rows: ScheduleImportRow[] = [];
  for (const entry of entries) {
    if (entry.open) continue;
    const following = entries.find(
      (next) =>
        next.day === entry.day &&
        next.line > entry.line &&
        next.start > entry.start,
    );
    const defaultMinutes =
      entry.categoryId === "weekly-planning" || entry.categoryId === "family"
        ? 30
        : ["career", "learning"].includes(entry.categoryId)
          ? 90
          : 60;
    const end =
      entry.end ??
      (entry.duration
        ? entry.start + entry.duration
        : (following?.start ?? entry.start + defaultMinutes));
    rows.push({
      id: entry.id,
      day: entry.day,
      start: entry.start,
      end,
      title: entry.title,
      categoryId: entry.categoryId,
      inferredEnd: entry.end === undefined,
    });
  }
  if (!rows.length && !errors.length)
    errors.push("Klistra in minst ett pass med dag och tid.");
  if (rows.length > 100)
    errors.push("Importera högst 100 pass i ett veckoschema.");
  return { rows, errors };
}

export function scheduleRowErrors(
  rows: ScheduleImportRow[],
  categories: AppData["categories"],
) {
  const errors: string[] = [];
  if (!rows.length || rows.length > 100)
    errors.push("Veckoschemat behöver innehålla 1–100 pass.");
  for (const [i, row] of rows.entries()) {
    if (
      !Number.isInteger(row.day) ||
      row.day < 0 ||
      row.day > 6 ||
      !Number.isInteger(row.start) ||
      !Number.isInteger(row.end) ||
      row.start < 0 ||
      row.end > 1440 ||
      row.end - row.start < 5 ||
      !row.title.trim() ||
      row.title.length > 200
    )
      errors.push(`Pass ${i + 1}: kontrollera dag, titel och start-/sluttid.`);
    if (!categories.some((c) => c.id === row.categoryId))
      errors.push(`${row.title || `Pass ${i + 1}`}: välj ett område.`);
    if (
      rows
        .slice(0, i)
        .some(
          (other) =>
            other.day === row.day &&
            other.start < row.end &&
            other.end > row.start,
        )
    )
      errors.push(`${row.title}: två pass överlappar samma dag.`);
  }
  return [...new Set(errors)];
}
export function validateImportedSchedule(
  value: unknown,
  categoryIds: Set<string>,
) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Det importerade schemat är ogiltigt.");
  const d = value as NonNullable<Settings["importedSchedule"]>;
  if (
    typeof d.id !== "string" ||
    !d.id.trim() ||
    d.id.length > 200 ||
    typeof d.name !== "string" ||
    d.name.length > 100 ||
    typeof d.savedAt !== "string" ||
    !Number.isFinite(Date.parse(d.savedAt)) ||
    !Array.isArray(d.blocks) ||
    !d.blocks.length ||
    d.blocks.length > 100 ||
    !Array.isArray(d.ignoredRecurringIds) ||
    d.ignoredRecurringIds.length > 1000 ||
    !d.ignoredRecurringIds.every(
      (id) => typeof id === "string" && id.length > 0 && id.length <= 200,
    )
  )
    throw new Error("Det importerade schemat är ogiltigt.");
  const ids = new Set<string>();
  for (const [i, b] of d.blocks.entries()) {
    if (
      !b ||
      typeof b.id !== "string" ||
      !b.id ||
      b.id.length > 200 ||
      ids.has(b.id) ||
      !Number.isInteger(b.day) ||
      b.day < 0 ||
      b.day > 6 ||
      !Number.isInteger(b.start) ||
      !Number.isInteger(b.end) ||
      b.start < 0 ||
      b.end > 1440 ||
      b.end - b.start < 5 ||
      typeof b.title !== "string" ||
      !b.title.trim() ||
      b.title.length > 200 ||
      !categoryIds.has(b.categoryId) ||
      !["flexible", "protected", "locked"].includes(b.blockType) ||
      (b.routine !== undefined &&
        !["week-start", "week-review"].includes(b.routine)) ||
      d.blocks
        .slice(0, i)
        .some((a) => a.day === b.day && a.start < b.end && a.end > b.start)
    )
      throw new Error(
        "Det importerade schemat innehåller ogiltiga eller överlappande pass.",
      );
    ids.add(b.id);
  }
}
const digest = (text: string) => {
  let hash = 2166136261;
  for (const char of text)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
};
const activitySignature = (activities: Activity[]) =>
  JSON.stringify(
    [...activities]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((a) => [
        a.id,
        a.title,
        a.date,
        a.start,
        a.end,
        a.categoryId,
        a.status,
        a.source,
      ]),
  );
export type ScheduleImportOptions = {
  firstWeek: string;
  weeks: number;
  useForNewWeeks: boolean;
  keepExternal: boolean;
  name: string;
  id?: string;
  importedAt?: string;
};
export type ScheduleImportProof = {
  id: string;
  definitionId: string;
  signatures: Record<string, string>;
  useForNewWeeks: boolean;
  blocks: WeekTemplateBlock[];
};
export function previewScheduleImport(
  data: AppData,
  rows: ScheduleImportRow[],
  options: ScheduleImportOptions,
) {
  const errors = scheduleRowErrors(rows, data.categories);
  if (
    !isLocalDate(options.firstWeek) ||
    monday(options.firstWeek) !== options.firstWeek ||
    !Number.isInteger(options.weeks) ||
    options.weeks < 1 ||
    options.weeks > 12
  )
    errors.push("Välj en måndag och 1–12 veckor.");
  if (errors.length) throw new Error(errors.join(" "));
  const ordered = [...rows].sort((a, b) => a.day - b.day || a.start - b.start);
  const definitionId = `schema-${digest(JSON.stringify(ordered.map((r) => [r.day, r.start, r.end, r.title.trim(), r.categoryId])))}`;
  const importedAt = options.importedAt ?? new Date().toISOString(),
    id = options.id ?? uid();
  const blocks: WeekTemplateBlock[] = ordered.map((r, i) => ({
    id: `${definitionId}-${i}`,
    day: r.day,
    start: r.start,
    end: r.end,
    title: r.title.trim(),
    categoryId: r.categoryId,
    blockType: ["rest", "family"].includes(r.categoryId)
      ? "locked"
      : ["health", "weekly-planning"].includes(r.categoryId)
        ? "protected"
        : "flexible",
    ...(routine(r.title) ? { routine: routine(r.title) } : {}),
  }));
  const rules = templateSettings({
    ...data.settings,
    importedSchedule: {
      id: definitionId,
      name: options.name.trim().slice(0, 100) || "Mitt veckoschema",
      savedAt: importedAt,
      blocks,
      ignoredRecurringIds: data.recurring.map((r) => r.id),
    },
    strictWeekTemplate: true,
    keepTemplateSlots: true,
  });
  let next: AppData = {
    ...data,
    settings: rules,
    personalScheduleVersion: 2,
    weeks: Object.fromEntries(
      Object.entries(data.weeks).map(([week, plan]) => [
        week,
        plan.rules ? plan : { ...plan, rules: structuredClone(data.settings) },
      ]),
    ),
  };
  const changes: Array<{
    week: string;
    removed: Activity[];
    preserved: number;
    external: number;
    conflicts: string[];
  }> = [];
  const signatures: Record<string, string> = {};
  for (let offset = 0; offset < options.weeks; offset++) {
    const week = addDays(options.firstWeek, offset * 7),
      old = data.weeks[week];
    const matched = new Set<number>();
    const kept = (old?.activities ?? []).filter((a) => {
      if (a.status !== "planned" || (options.keepExternal && a.external))
        return true;
      if (
        old?.rules?.importedSchedule?.id === definitionId &&
        a.source === "generated" &&
        !hasScheduledWork(a)
      ) {
        const match = blocks.findIndex(
          (b) =>
            a.date === addDays(week, b.day) &&
            a.start === b.start &&
            a.end === b.end &&
            a.categoryId === b.categoryId &&
            a.title === b.title,
        );
        if (match >= 0 && !matched.has(match)) {
          matched.add(match);
          return true;
        }
      }
      return false;
    });
    const removed = (old?.activities ?? []).filter((a) => !kept.includes(a));
    const existing = old
      ? {
          ...old,
          activities: kept,
          replacedActivities: replacedScheduleActivities(old, removed, kept),
        }
      : undefined;
    next = {
      ...next,
      weeks: { ...next.weeks, ...(existing ? { [week]: existing } : {}) },
    };
    const result = createPersonalSchedule(next, week);
    next = result.data;
    next = {
      ...next,
      weeks: {
        ...next.weeks,
        [week]: {
          ...next.weeks[week],
          scheduleImport: { id, definitionId, importedAt },
        },
      },
    };
    const active = next.weeks[week].activities;
    changes.push({
      week,
      removed: (old?.activities ?? []).filter(
        (a) =>
          !active.some(
            (b) =>
              a.id === b.id &&
              a.title === b.title &&
              a.start === b.start &&
              a.end === b.end &&
              a.categoryId === b.categoryId,
          ),
      ),
      preserved: active.filter((a) => a.status !== "planned").length,
      external: active.filter((a) => a.external).length,
      conflicts: result.report.conflicts,
    });
    signatures[week] = activitySignature(active);
  }
  next = { ...next, settings: options.useForNewWeeks ? rules : data.settings };
  const proof: ScheduleImportProof = {
    id,
    definitionId,
    signatures,
    useForNewWeeks: options.useForNewWeeks,
    blocks,
  };
  return { base: data, data: next, proof, changes, blocks };
}
export type ScheduleImportPreview = ReturnType<typeof previewScheduleImport>;
export function verifyScheduleImport(
  data: AppData,
  proof: ScheduleImportProof,
) {
  if (
    proof.useForNewWeeks &&
    data.settings.importedSchedule?.id !== proof.definitionId
  )
    throw new Error("Standardveckan kunde inte verifieras efter sparandet.");
  for (const [week, signature] of Object.entries(proof.signatures)) {
    const plan = data.weeks[week];
    if (
      !plan ||
      plan.scheduleImport?.id !== proof.id ||
      plan.rules?.importedSchedule?.id !== proof.definitionId ||
      scheduleSlotCount(plan) !== proof.blocks.length ||
      activitySignature(plan.activities) !== signature
    )
      throw new Error(
        "Det sparade schemat stämmer inte med importen. Försök synkronisera och granska planen igen.",
      );
  }
}
