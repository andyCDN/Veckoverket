import type { Activity, AppData } from "./types";

export function canFollowUp(activity: Activity) {
  return (
    !activity.external &&
    (activity.categoryId === "career" ||
      /nätverk/i.test(`${activity.title} ${activity.description}`))
  );
}

export type FollowUp = {
  week: string;
  activity: Activity;
  replacements: { week: string; activity: Activity }[];
  remaining: number;
};

// Derive coverage from the actual saved passes. Edits, deletion and missed
// replacements therefore cannot leave a stale "rescheduled" flag behind.
export function followUps(data: AppData): FollowUp[] {
  const all = Object.entries(data.weeks).flatMap(([week, plan]) =>
    plan.activities.map((activity) => ({ week, activity })),
  );
  const key = (week: string, id: string) => `${week}/${id}`;
  const byKey = new Map(
    all.map((item) => [key(item.week, item.activity.id), item]),
  );
  const children = new Map<string, typeof all>();
  for (const item of all) {
    const link = item.activity.followUpOf;
    if (!link) continue;
    const parentKey = key(link.week, link.activityId);
    children.set(parentKey, [...(children.get(parentKey) ?? []), item]);
  }
  return all
    .filter(({ activity }) => {
      if (activity.status !== "skipped" || !canFollowUp(activity)) return false;
      const parent =
        activity.followUpOf &&
        byKey.get(
          key(activity.followUpOf.week, activity.followUpOf.activityId),
        );
      return (
        !parent ||
        parent.activity.status !== "skipped" ||
        !canFollowUp(parent.activity) ||
        parent.activity.categoryId !== activity.categoryId
      );
    })
    .map(({ week, activity }) => {
      const replacements: typeof all = [];
      const visited = new Set([key(week, activity.id)]);
      function covered(parentWeek: string, parent: Activity): number {
        let minutes = 0;
        for (const item of children.get(key(parentWeek, parent.id)) ?? []) {
          const childKey = key(item.week, item.activity.id);
          if (
            visited.has(childKey) ||
            item.activity.categoryId !== activity.categoryId ||
            item.activity.date < activity.date
          )
            continue;
          visited.add(childKey);
          replacements.push(item);
          minutes +=
            item.activity.status === "skipped"
              ? Math.min(
                  item.activity.end - item.activity.start,
                  covered(item.week, item.activity),
                )
              : item.activity.end - item.activity.start;
        }
        return minutes;
      }
      const remaining = Math.max(
        0,
        activity.end - activity.start - covered(week, activity),
      );
      return { week, activity, replacements, remaining };
    })
    .sort(
      (a, b) =>
        a.activity.date.localeCompare(b.activity.date) ||
        a.activity.start - b.activity.start,
    );
}
