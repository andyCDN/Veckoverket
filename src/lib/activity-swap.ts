import type { Activity, AppData } from "./types";
import { validateMove } from "./planner";

export function canSwapActivity(
  a: Activity,
  data: Pick<AppData, "settings" | "categories">,
) {
  return (
    a.status === "planned" &&
    !a.external &&
    a.blockType !== "locked" &&
    Boolean(data.categories.find((c) => c.id === a.categoryId)?.movable) &&
    (a.categoryId !== "music" || data.settings.musicMovable)
  );
}

/** Swap two starts atomically, keeping each activity's duration and identity. */
export function swapActivities(
  data: AppData,
  week: string,
  firstId: string,
  secondId: string,
): { data: AppData; error?: string } {
  const fail = (error: string) => ({ data, error });
  const plan = data.weeks[week];
  const first = plan?.activities.find((a) => a.id === firstId),
    second = plan?.activities.find((a) => a.id === secondId);
  if (!first || !second || first.id === second.id)
    return fail("Välj två olika pass i den visade veckan.");
  const rules = plan.rules ?? data.settings,
    context = { settings: rules, categories: data.categories };
  if (![first, second].every((a) => canSwapActivity(a, context)))
    return fail(
      "Båda passen måste vara planerade och tillåtna att flytta. Låsta, importerade och avklarade pass byter inte plats.",
    );
  const at = (a: Activity, other: Activity): Activity => ({
    ...a,
    date: other.date,
    start: other.start,
    end: other.start + a.end - a.start,
    source: "manual",
  });
  const moved = [at(first, second), at(second, first)];
  const activities = plan.activities.map(
    (a) => moved.find((b) => b.id === a.id) ?? a,
  );
  for (const [i, original] of [first, second].entries()) {
    const error = validateMove(
      original,
      moved[i],
      activities,
      rules,
      data.categories,
    );
    if (error) return fail(`Passen kunde inte byta plats: ${error}`);
    const activity = moved[i];
    const deadline = data.deadlines?.find((d) => d.id === activity.deadlineId);
    const application = activity.deadlineId
      ? data.applications?.find((a) => a.id === activity.applicationId)
      : undefined;
    const due = deadline?.date ?? application?.deadline;
    const minute = deadline?.minute ?? rules.end;
    if (
      due &&
      (activity.date > due || (activity.date === due && activity.end > minute))
    )
      return fail(
        `”${activity.title}” skulle hamna efter sin deadline. Planen har inte ändrats.`,
      );
    if (deadline && activity.deadlineStepId) {
      const index = deadline.steps.findIndex(
        (s) => s.id === activity.deadlineStepId,
      );
      for (const other of activities.filter(
        (a) => a.id !== activity.id && a.deadlineId === deadline.id,
      )) {
        const otherIndex = deadline.steps.findIndex(
          (s) => s.id === other.deadlineStepId,
        );
        if (index < 0 || otherIndex < 0) continue;
        const before = index < otherIndex ? activity : other,
          after = index < otherIndex ? other : activity;
        if (
          before.date > after.date ||
          (before.date === after.date && before.end > after.start)
        )
          return fail(
            "Platsbytet skulle ändra ordningen på deadlinearbetets delsteg. Planen har inte ändrats.",
          );
      }
    }
    const interview = data.applications
      ?.flatMap((a) => a.interviews ?? [])
      .find((i) => i.preparationActivityId === activity.id);
    if (
      interview &&
      (activity.date > interview.date ||
        (activity.date === interview.date && activity.end > interview.start))
    )
      return fail(
        "Intervjuförberedelsen måste ligga före intervjun. Planen har inte ändrats.",
      );
  }
  return {
    data: {
      ...data,
      weeks: { ...data.weeks, [week]: { ...plan, activities } },
    },
  };
}
