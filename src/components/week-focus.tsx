"use client";
import { useEffect, useState } from "react";
import { planningBoundary } from "@/lib/date";
import { careerActions, type TrackedAction } from "@/lib/career-actions";
import { actionNeedsAttention } from "@/lib/action-workflow";
import type { AppData } from "@/lib/types";

export function WeekFocus({
  data,
  onAction,
}: {
  data: AppData;
  onAction: (action: TrackedAction) => void;
}) {
  const [now, setNow] = useState(planningBoundary);
  useEffect(() => {
    const timer = setInterval(() => setNow(planningBoundary()), 60000);
    return () => clearInterval(timer);
  }, []);
  const due = careerActions(data)
    .filter((action) => actionNeedsAttention(data, action, now))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "sv-SE"),
    );
  if (!due.length) return null;
  return (
    <section className="week-focus" aria-label="Att följa upp">
      <article className="week-focus-followups">
        <h2>
          Att följa upp <span>{due.length}</span>
        </h2>
        <>
          <ul>
            {due.slice(0, 3).map((action) => (
              <li key={action.id}>
                <button onClick={() => onAction(action)}>
                  <strong>{action.title}</strong>
                  <span>
                    {action.kind === "waiting" ? "Bevakning" : "Egen uppgift"} ·{" "}
                    {action.date}
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
      </article>
    </section>
  );
}
