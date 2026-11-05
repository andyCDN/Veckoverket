import type { Activity, AppData } from "./types";
import type { TrackedAction } from "./career-actions";
import { planningBoundary } from "./date";

/** Read older bookings without rewriting them or inferring task completion. */
export function actionBookings(
  data: AppData,
  action: TrackedAction,
): Activity[] {
  return Object.values(data.weeks)
    .flatMap((plan) => plan.activities)
    .filter((activity) => {
      if (activity.careerActionId === action.id) return true;
      if (
        activity.careerActionId ||
        !action.legacy ||
        activity.status !== "planned"
      )
        return false;
      const sameOwner =
        action.legacy === "application"
          ? activity.applicationId === action.applicationId
          : activity.contactId === action.contactId;
      return (
        sameOwner &&
        [action.title, `Följ upp: ${action.title}`].includes(activity.title)
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}

export function actionWorkflow(
  data: AppData,
  action: TrackedAction,
  boundary = planningBoundary(),
) {
  const bookings = actionBookings(data, action);
  const planned = bookings.filter((activity) => activity.status === "planned");
  const future = planned.find(
    (activity) =>
      activity.date > boundary.date ||
      (activity.date === boundary.date && activity.end > boundary.minute),
  );
  const done = bookings.findLast((activity) => activity.status === "done");
  const booking = future ?? planned[0];
  const waiting = action.kind === "waiting";
  const stage =
    action.status === "done"
      ? "done"
      : booking
        ? "booked"
        : done && !waiting
          ? "confirm"
          : waiting && !action.date
            ? "undated"
            : !waiting && action.date && action.date < boundary.date
              ? "reschedule"
              : "unbooked";
  return {
    waiting,
    stage,
    booking,
    label:
      action.status === "done"
        ? "Avklarat"
        : future
          ? "Bokat i kalendern"
          : booking
            ? "Passet har passerat"
            : done
              ? waiting
                ? "Uppföljning genomförd · väntar på besked"
                : "Pass genomfört · bekräfta nästa steg"
              : stage === "reschedule"
                ? "Datumet har passerat"
                : waiting
                  ? action.date && action.date > boundary.date
                    ? "Väntar på svar"
                    : action.date
                      ? "Dags att följa upp"
                      : "Bevakningsdatum saknas"
                  : action.date === boundary.date
                    ? "Att göra idag"
                    : "Arbetstid saknas",
    primary:
      action.status === "done"
        ? ""
        : future
          ? "Öppna bokat pass"
          : booking
            ? "Se passerat pass"
            : waiting && !action.date
              ? "Välj bevakningsdatum"
              : done
                ? waiting
                  ? "Boka ny uppföljning"
                  : "Markera nästa steg klart"
                : stage === "reschedule"
                  ? "Välj nytt datum"
                  : waiting
                    ? "Boka uppföljning"
                    : "Boka arbetstid",
  };
}

export function actionNeedsAttention(
  data: AppData,
  action: TrackedAction,
  boundary = planningBoundary(),
) {
  return (
    action.status === "open" &&
    Boolean(action.date) &&
    action.date <= boundary.date &&
    !actionBookings(data, action).some(
      (activity) =>
        activity.status === "planned" &&
        (activity.date > boundary.date ||
          (activity.date === boundary.date && activity.end > boundary.minute)),
    )
  );
}
