"use client";
import { addDays, weekLabel, weekNumber } from "@/lib/date";
import type { JobRow } from "@/lib/job-workspace";

export function JobWeeklyFocus({
  week,
  rows,
  onWeek,
  onPrimary,
  onToggle,
}: {
  week: string;
  rows: JobRow[];
  onWeek: (week: string) => void;
  onPrimary: (row: JobRow) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="job-weekly-focus stack" aria-label="Veckans val">
      <header className="job-weekly-heading">
        <div>
          <h3>Veckans val</h3>
          <p>{rows.length} av 3 jobb valda</p>
        </div>
        <div
          className="job-weekly-navigation"
          role="group"
          aria-label="Vecka för valda jobb"
        >
          <button
            type="button"
            className="button secondary"
            aria-label="Föregående valvecka"
            onClick={() => onWeek(addDays(week, -7))}
          >
            Förra
          </button>
          <p>
            <strong>Vecka {weekNumber(week)}</strong>
            <br />
            {weekLabel(week)}
          </p>
          <button
            type="button"
            className="button secondary"
            aria-label="Nästa valvecka"
            onClick={() => onWeek(addDays(week, 7))}
          >
            Nästa
          </button>
        </div>
      </header>
      {!rows.length ? (
        <p>Välj upp till tre jobb i listan att ta vidare den här veckan.</p>
      ) : (
        <ol className="job-weekly-list">
          {rows.map((row) => (
            <li key={row.application.id} className="stack">
              <div>
                <h4>{row.application.role}</h4>
                <p>{row.application.organization}</p>
              </div>
              <p>
                <strong>Nästa steg:</strong> {row.next}
              </p>
              <p>
                {row.application.status === "draft" && row.application.deadline
                  ? `Sök senast ${row.application.deadline}`
                  : row.date
                    ? `Nästa datum ${row.date}`
                    : "Inget datum valt"}
              </p>
              <button
                type="button"
                className="button primary"
                onClick={() => onPrimary(row)}
              >
                {row.primary}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => onToggle(row.application.id)}
              >
                Ta bort ur veckans val
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
