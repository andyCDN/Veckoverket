import type { Activity, AppData } from "./types";
import { monday } from "./date";
import {
  GOOGLE_CATEGORY,
  GOOGLE_CATEGORY_ID,
  googleEventKey,
  isGoogleEventKey,
} from "./external-calendar";

export const AUTO_CATEGORY = "__calendar_auto__";
export type GoogleCategoryChoices = Record<string, string>;
const normalized = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("sv-SE").trim();

export function matchingCategoryRule(data: AppData, activity: Activity) {
  if (!activity.external) return;
  return data.calendarCategoryRules?.find(
    (rule) =>
      rule.enabled &&
      normalized(rule.contains) &&
      (!rule.calendarId || rule.calendarId === activity.external!.calendarId) &&
      data.categories.some((category) => category.id === rule.categoryId) &&
      normalized(activity.title).includes(normalized(rule.contains)),
  );
}

/** Legacy non-default categories remain manual; rule results are recomputed. */
export function googleCategoryChoices(
  data: AppData,
  overrides: GoogleCategoryChoices = {},
): GoogleCategoryChoices {
  const choices: GoogleCategoryChoices = {
    ...data.googleCalendar?.eventCategories,
  };
  const sources = data.googleCalendar?.eventCategorySources ?? {};
  for (const [key, source] of Object.entries(sources))
    if (source === "manual" && choices[key] === undefined)
      choices[key] = GOOGLE_CATEGORY_ID;
  for (const plan of Object.values(data.weeks))
    for (const activity of plan.activities) {
      const key = googleEventKey(activity);
      if (
        key &&
        sources[key] !== "rule" &&
        activity.categoryId !== GOOGLE_CATEGORY_ID &&
        choices[key] === undefined
      )
        choices[key] = activity.categoryId;
    }
  for (const [key, categoryId] of Object.entries(overrides)) {
    if (!isGoogleEventKey(key)) continue;
    if (categoryId === AUTO_CATEGORY) delete choices[key];
    else if (
      categoryId === GOOGLE_CATEGORY_ID ||
      data.categories.some((c) => c.id === categoryId)
    )
      choices[key] = categoryId;
  }
  return choices;
}

export function resolvedCalendarCategory(
  data: AppData,
  activity: Activity,
  choices = googleCategoryChoices(data),
) {
  const key = googleEventKey(activity);
  if (choices[key] !== undefined)
    return { categoryId: choices[key], source: "manual" as const };
  const rule = matchingCategoryRule(data, activity);
  return rule
    ? { categoryId: rule.categoryId, source: "rule" as const }
    : { categoryId: GOOGLE_CATEGORY_ID, source: undefined };
}

export function categoryMetadata(
  data: AppData,
  choices: GoogleCategoryChoices,
  sources: Record<string, "manual" | "rule">,
) {
  const first = Object.values(data.weeks)
    .flatMap((p) => p.activities)
    .find((a) => a.external);
  if (!data.googleCalendar && !first) return undefined;
  const eventCategories = Object.fromEntries(
    Object.entries(choices).filter(
      ([, category]) => category !== GOOGLE_CATEGORY_ID,
    ),
  );
  return {
    ...(data.googleCalendar ?? {
      calendarIds: [
        ...new Set(
          Object.values(data.weeks)
            .flatMap((p) => p.activities)
            .flatMap((a) => (a.external ? [a.external.calendarId] : [])),
        ),
      ].slice(0, 20),
      lastImportedWeek: monday(first!.date),
      lastImportedAt: new Date().toISOString(),
    }),
    eventCategories: Object.keys(eventCategories).length
      ? eventCategories
      : undefined,
    eventCategorySources: Object.keys(sources).length ? sources : undefined,
  };
}

export function categorizeGoogleEvent(
  data: AppData,
  activity: Activity,
  categoryId: string,
): AppData {
  const key = googleEventKey(activity);
  if (
    !key ||
    !Object.values(data.weeks).some((plan) =>
      plan.activities.some((a) => googleEventKey(a) === key),
    ) ||
    (categoryId !== AUTO_CATEGORY &&
      categoryId !== GOOGLE_CATEGORY_ID &&
      !data.categories.some((c) => c.id === categoryId))
  )
    return data;
  const choices = googleCategoryChoices(data, { [key]: categoryId });
  const resolved = resolvedCalendarCategory(data, activity, choices);
  const sources = { ...data.googleCalendar?.eventCategorySources };
  if (resolved.source) sources[key] = resolved.source;
  else delete sources[key];
  return {
    ...data,
    categories:
      resolved.categoryId === GOOGLE_CATEGORY_ID &&
      !data.categories.some((c) => c.id === GOOGLE_CATEGORY_ID)
        ? [...data.categories, { ...GOOGLE_CATEGORY }]
        : data.categories,
    weeks: Object.fromEntries(
      Object.entries(data.weeks).map(([week, plan]) => [
        week,
        plan.activities.some((a) => googleEventKey(a) === key)
          ? {
              ...plan,
              activities: plan.activities.map((a) =>
                googleEventKey(a) === key
                  ? { ...a, categoryId: resolved.categoryId }
                  : a,
              ),
            }
          : plan,
      ]),
    ),
    googleCalendar: categoryMetadata(data, choices, sources),
  };
}

/** Explicit application changes rule-driven bookings while preserving manual overrides. */
export function applyCalendarCategoryRules(data: AppData) {
  const choices = googleCategoryChoices(data),
    sources = { ...data.googleCalendar?.eventCategorySources };
  const changed = new Set<string>();
  const weeks = Object.fromEntries(
    Object.entries(data.weeks).map(([week, plan]) => {
      const activities = plan.activities.map((activity) => {
        if (!activity.external) return activity;
        const key = googleEventKey(activity),
          resolved = resolvedCalendarCategory(data, activity, choices);
        if (resolved.source) sources[key] = resolved.source;
        else delete sources[key];
        if (resolved.categoryId === activity.categoryId) return activity;
        changed.add(key);
        return { ...activity, categoryId: resolved.categoryId };
      });
      return [
        week,
        activities.every((a, i) => a === plan.activities[i])
          ? plan
          : { ...plan, activities },
      ];
    }),
  );
  const needsDefault = Object.values(weeks).some((p) =>
    p.activities.some((a) => a.categoryId === GOOGLE_CATEGORY_ID),
  );
  return {
    count: changed.size,
    data: {
      ...data,
      categories:
        needsDefault &&
        !data.categories.some((c) => c.id === GOOGLE_CATEGORY_ID)
          ? [...data.categories, { ...GOOGLE_CATEGORY }]
          : data.categories,
      weeks,
      googleCalendar: categoryMetadata(data, choices, sources),
    } as AppData,
  };
}
