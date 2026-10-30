"use client";
import { orderedCategories, categoryLabel } from "@/lib/presentation";
import { useMemo, useState } from "react";
import type { AppData } from "@/lib/types";
import { periodStatistics } from "@/lib/statistics";
import { addDays, fullDate, hours, weekLabel, weekNumber } from "@/lib/date";

export function PeriodStatistics({
  data,
  week,
  onWeek,
}: {
  data: AppData;
  week: string;
  onWeek: (week: string) => void;
}) {
  const [length, setLength] = useState<4 | 12>(4),
    [category, setCategory] = useState("all");
  const stats = useMemo(
    () => periodStatistics(data, week, length, category),
    [data, week, length, category],
  );
  const max = Math.max(
    1,
    ...stats.weeks.map((w) => Math.max(w.planned, w.done)),
  );
  return (
    <section
      className="period-statistics"
      aria-labelledby="period-statistics-title"
    >
      <div className="section-heading">
        <div>
          <h3 id="period-statistics-title">Uppföljning över flera veckor</h3>
          <p>
            {fullDate(stats.start)} – {fullDate(addDays(stats.end, 6))}.
          </p>
        </div>
      </div>
      <div className="statistics-controls">
        <div
          className="segmented"
          role="group"
          aria-label="Period för uppföljning"
        >
          {([4, 12] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={length === value}
              className={length === value ? "selected" : ""}
              onClick={() => setLength(value)}
            >
              {value} veckor
            </button>
          ))}
        </div>
        <label>
          Livsområde i statistiken
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">Alla livsområden</option>
            {orderedCategories(data.categories).map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <dl className="statistics-totals">
        <div>
          <dt>Planerad tid</dt>
          <dd>{hours(stats.planned)}</dd>
        </div>
        <div>
          <dt>Genomförd tid</dt>
          <dd>{hours(stats.done)}</dd>
        </div>
        <div>
          <dt>Genomfört av planerat</dt>
          <dd>{stats.completion === null ? "–" : `${stats.completion} %`}</dd>
        </div>
      </dl>
      <p className="help">
        {stats.savedWeeks} av {length} veckor har sparad plan. Veckor utan
        sparad data ingår inte i summorna. Pågående vecka kan innehålla
        aktiviteter som ännu inte har ägt rum.
      </p>
      <figure className="statistics-chart">
        <figcaption>
          <span className="stat-planned-key">Planerad tid</span>
          <span className="stat-done-key">Genomförd tid</span>
        </figcaption>
        <ol>
          {stats.weeks.map((w) => (
            <li
              key={w.week}
              className={!w.saved ? "no-data" : w.ongoing ? "ongoing" : ""}
            >
              <button
                type="button"
                disabled={!w.saved}
                onClick={() => onWeek(w.week)}
                aria-label={`${w.saved ? "Visa uppföljning" : "Ingen sparad plan"} för vecka ${weekNumber(w.week)}, ${weekLabel(w.week)}, ${w.week.slice(0, 4)}${w.saved ? `. Planerat ${hours(w.planned)}, genomfört ${hours(w.done)}${w.ongoing ? ", pågående vecka" : ""}` : ""}`}
              >
                <strong>
                  V.{weekNumber(w.week)} <small>{w.week.slice(0, 4)}</small>
                </strong>
                <span className="statistics-bars" aria-hidden="true">
                  <i
                    className="planned"
                    style={{ width: `${(w.planned / max) * 100}%` }}
                  />
                  <i
                    className="done"
                    style={{ width: `${(w.done / max) * 100}%` }}
                  />
                </span>
                <span className="statistics-week-values">
                  {w.saved
                    ? `${hours(w.planned)} / ${hours(w.done)}`
                    : "Ingen sparad plan"}
                  <small>
                    {w.ongoing
                      ? "Pågående vecka"
                      : w.saved && w.planned === 0
                        ? "Tom plan"
                        : ""}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </figure>
      <table className="statistics-table">
        <caption>Tid per livsområde under perioden</caption>
        <thead>
          <tr>
            <th scope="col">Livsområde</th>
            <th scope="col">Tidsmål</th>
            <th scope="col">Plan</th>
            <th scope="col">Gjort</th>
          </tr>
        </thead>
        <tbody>
          {stats.rows
            .filter((r) => r.planned || r.done || r.target)
            .map((row) => (
              <tr key={row.category.id}>
                <th scope="row">{categoryLabel(row.category)}</th>
                <td>{hours(row.target)}</td>
                <td>{hours(row.planned)}</td>
                <td>{hours(row.done)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {!stats.rows.some((r) => r.planned || r.done || r.target) && (
        <p className="muted">
          Ingen sparad tid eller tidsmål för det här urvalet.
        </p>
      )}
      <p className="help">
        Tidsmål hämtas från varje sparad veckas regler. Genomförd tid avser hela
        längden på avbockade aktiviteter. Lediga Google-bokningar och
        importerade heldagar räknas inte som kategoritid. Kommande veckor ingår
        inte.
      </p>
    </section>
  );
}
