import type { Activity, AppData, Settings } from "./types";
import { monday, planningBoundary } from "./date";

export const RETIRED_LINKEDIN_PASS = "Ett jobb om dagen på LinkedIn";
const titleKey = (title: string) =>
  title
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("sv-SE");

export function excludedActivityTitle(settings: Settings, title: string) {
  return Boolean(
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
    a.status === "planned" &&
    a.date >= fromWeek &&
    excludedActivityTitle(settings, a.title)
  );
}

/** Retire the requested standalone routine where it exists. An explicit empty
 * exclusion list lets the user opt back in; recorded history stays intact. */
export function applyActivityExclusions(
  data: AppData,
  boundary = planningBoundary(),
  incoming: Activity[] = [],
): AppData {
  let settings = data.settings;
  if (
    settings.excludedActivityTitles === undefined &&
    [
      ...data.recurring,
      ...Object.values(data.weeks).flatMap((p) => p.activities),
      ...incoming,
    ].some((a) => titleKey(a.title) === titleKey(RETIRED_LINKEDIN_PASS))
  )
    settings = { ...settings, excludedActivityTitles: [RETIRED_LINKEDIN_PASS] };
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
