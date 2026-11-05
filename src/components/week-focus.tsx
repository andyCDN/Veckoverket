"use client";
import { useEffect, useState } from "react";
import { monday, planningBoundary, time } from "@/lib/date";
import { careerActions, type TrackedAction } from "@/lib/career-actions";
import { actionNeedsAttention } from "@/lib/action-workflow";
import type { Activity, AppData } from "@/lib/types";

export function WeekFocus({
  data,
  week,
  activities,
  onOpen,
  onAction,
}: {
  data: AppData;
  week: string;
  activities: Activity[];
  onOpen: (activity: Activity) => void;
  onAction: (action: TrackedAction) => void;
}) {
  const [now, setNow] = useState(planningBoundary);
  useEffect(() => {
    const timer = setInterval(() => setNow(planningBoundary()), 60000);
    return () => clearInterval(timer);
  }, []);
  const thisWeek = week === monday(now.date);
  const upcoming = (activity: Activity) =>
    activity.status === "planned" &&
    (activity.date > now.date ||
      (activity.date === now.date && activity.end > now.minute));
  const next = activities
    .filter(
      (activity) =>
        upcoming(activity) &&
        !activity.external?.allDay &&
        activity.external?.busy !== false,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
  const today = activities.filter((activity) => activity.date === now.date);
  const due = careerActions(data)
    .filter((action) => actionNeedsAttention(data, action, now))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "sv-SE"),
    );
  return (
    <section className="week-focus" aria-label="Idag och nästa steg">
      <article className="week-focus-next">
        <div className="week-focus-kicker">
          {thisWeek ? "Idag" : "Vald vecka"}
          <span>
            {thisWeek
              ? `${today.filter((activity) => activity.status === "done").length} av ${today.length} pass genomförda idag`
              : `${activities.filter((activity) => activity.status === "done").length} av ${activities.length} pass genomförda`}
          </span>
        </div>
        <h2>
          {next
            ? next.date === now.date && next.start <= now.minute
              ? "Pågår nu"
              : "Nästa bokade pass"
            : week < monday(now.date)
              ? "Veckan är avslutad"
              : "Inga fler bokade pass"}
        </h2>
        {next ? (
          <>
            <strong className="week-focus-title">{next.title}</strong>
            <p>
              {next.date === now.date ? "Idag" : next.date} · {time(next.start)}
              –{time(next.end)}
            </p>
            <button className="button primary" onClick={() => onOpen(next)}>
              Öppna passet
            </button>
          </>
        ) : (
          <p>
            {thisWeek
              ? "Lägg till ett pass i kalendern när du vill planera nästa uppgift."
              : "Välj en annan vecka eller lägg till ett pass i kalendern."}
          </p>
        )}
      </article>
      <article className="week-focus-followups">
        <h2>
          Att följa upp <span>{due.length}</span>
        </h2>
        {due.length ? (
          <>
            <ul>
              {due.slice(0, 3).map((action) => (
                <li key={action.id}>
                  <button onClick={() => onAction(action)}>
                    <strong>{action.title}</strong>
                    <span>
                      {action.kind === "waiting" ? "Bevakning" : "Egen uppgift"}{" "}
                      · {action.date}
                      {action.date < now.date ? " · Datum passerat" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {due.length > 3 && (
              <p>
                {due.length - 3} fler finns under Nästa steg i Jobb och
                Uppföljningar i Nätverk.
              </p>
            )}
          </>
        ) : (
          <p>Inga obokade nästa steg att följa upp idag.</p>
        )}
      </article>
    </section>
  );
}
