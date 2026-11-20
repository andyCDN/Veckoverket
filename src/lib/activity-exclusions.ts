import type { Activity, AppData, Settings } from "./types";
import { monday, planningBoundary } from "./date";

export const RETIRED_LINKEDIN_PASS = "Ett jobb om dagen på LinkedIn";
const titleKey = (title: string) =>
  title
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("sv-SE");

export function isRetiredLinkedInPass(title: string) {
  const words = titleKey(title)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return (
    words === "linkedin" ||
    (/\blinkedin\b/.test(words) &&
      /(?:ett jobb om dagen|jobb varje dag|daglig[ta]? jobbsök|sök(?:a)? (?:ett )?jobb (?:om dagen|varje dag))/.test(
        words,
      ))
  );
}

type SeriesData = Pick<AppData, "settings" | "weeks" | "recurring">;

function linkedInRecurrenceIds(data: SeriesData, incoming: Activity[] = []) {
  const ids = new Set(
    data.recurring
      .filter((r) => isRetiredLinkedInPass(r.title))
      .map((r) => r.id),
  );
  for (const a of [
    ...Object.values(data.weeks).flatMap((p) => p.activities),
    ...incoming,
  ])
    if (a.recurrenceId && isRetiredLinkedInPass(a.title))
      ids.add(a.recurrenceId);
  return ids;
}

export function linkedInSeriesCounts(data: SeriesData) {
  const ids = linkedInRecurrenceIds(data);
  return {
    bookings: Object.values(data.weeks)
      .flatMap((p) => p.activities)
      .filter(
        (a) =>
          isRetiredLinkedInPass(a.title) ||
          Boolean(a.recurrenceId && ids.has(a.recurrenceId)),
      ).length,
    rules: data.recurring.filter((r) => ids.has(r.id)).length,
  };
}

/** Delete the whole named series, including renamed occurrences and logged or
 * historical bookings. This is the user's explicit all-days removal. */
export function removeLinkedInSeries<T extends SeriesData>(
  data: T,
  incoming: Activity[] = [],
  forceSuppression = false,
) {
  const ids = linkedInRecurrenceIds(data, incoming);
  const recurring = data.recurring.filter((r) => !ids.has(r.id));
  let weeks = data.weeks;
  let removedBookings = 0;
  for (const [week, plan] of Object.entries(data.weeks)) {
    const activities = plan.activities.filter(
      (a) =>
        !isRetiredLinkedInPass(a.title) &&
        !(a.recurrenceId && ids.has(a.recurrenceId)),
    );
    if (activities.length === plan.activities.length) continue;
    removedBookings += plan.activities.length - activities.length;
    if (weeks === data.weeks) weeks = { ...weeks };
    weeks[week] = {
      ...plan,
      activities,
      templateId: undefined,
      templateNeedsRefresh: true,
    };
  }
  const removedRules = data.recurring.length - recurring.length;
  let settings = data.settings;
  if (
    (forceSuppression ||
      removedBookings > 0 ||
      removedRules > 0 ||
      incoming.some((a) => isRetiredLinkedInPass(a.title))) &&
    (settings.excludedActivityTitles?.length ?? 0) < 100 &&
    !settings.excludedActivityTitles?.some(
      (title) => titleKey(title) === titleKey(RETIRED_LINKEDIN_PASS),
    )
  )
    settings = {
      ...settings,
      excludedActivityTitles: [
        ...(settings.excludedActivityTitles ?? []),
        RETIRED_LINKEDIN_PASS,
      ],
    };
  return {
    data:
      settings === data.settings && weeks === data.weeks && !removedRules
        ? data
        : {
            ...data,
            settings,
            weeks,
            recurring: removedRules ? recurring : data.recurring,
          },
    removedBookings,
    removedRules,
  };
}

export function excludedActivityTitle(settings: Settings, title: string) {
  return Boolean(
    isRetiredLinkedInPass(title) ||
    settings.excludedActivityTitles?.some(
      (item) => titleKey(item) === titleKey(title),
    ),
  );
}

export function excludedActivity(
  a: Activity,
  settings: Settings,
  fromWeek: string,
) {
  return (
    isRetiredLinkedInPass(a.title) ||
    (a.status === "planned" &&
      a.date >= fromWeek &&
      excludedActivityTitle(settings, a.title))
  );
}

/** Remove LinkedIn's complete series first; other configurable exclusions only
 * affect planned bookings in current/future weeks. */
export function applyActivityExclusions(
  data: AppData,
  boundary = planningBoundary(),
  incoming: Activity[] = [],
): AppData {
  data = removeLinkedInSeries(data, incoming).data;
  const settings = data.settings;
  if (!settings.excludedActivityTitles?.length) return data;

  const currentWeek = monday(boundary.date);
  let weeks = data.weeks;
  for (const [week, plan] of Object.entries(data.weeks)) {
    if (week < currentWeek) continue;
    const activities = plan.activities.filter(
      (a) => !excludedActivity(a, settings, currentWeek),
    );
    if (activities.length === plan.activities.length) continue;
    if (weeks === data.weeks) weeks = { ...weeks };
    weeks[week] = {
      ...plan,
      activities,
      // Removing a blocker frees the template's real job-search slot. A future
      // week must be reconciled even if its previous partial plan was stamped.
      ...(week > currentWeek ? { templateId: undefined } : {}),
    };
  }
  return settings === data.settings && weeks === data.weeks
    ? data
    : { ...data, settings, weeks };
}
