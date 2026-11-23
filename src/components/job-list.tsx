"use client";
import { useEffect, useState } from "react";
import type { AppData, JobApplication } from "@/lib/types";
import {
  JOB_LANES,
  jobWorkspace,
  type JobLane,
  type JobRow,
} from "@/lib/job-workspace";
import { APPLICATION_STATUSES } from "@/lib/applications";
import { planningBoundary } from "@/lib/date";

export function JobList({
  data,
  lane,
  onLane,
  onAdd,
  onOpen,
  onPrimary,
  onMessage,
  onImport,
  onGlobalMessage,
  onDeadlines,
  query,
  onQuery,
}: {
  data: AppData;
  lane: JobLane;
  onLane: (lane: JobLane) => void;
  onAdd: () => void;
  onOpen: (application: JobApplication) => void;
  onPrimary: (row: JobRow) => void;
  onMessage: (application: JobApplication) => void;
  onImport: () => void;
  onGlobalMessage: () => void;
  onDeadlines: () => void;
  query: string;
  onQuery: (query: string) => void;
}) {
  const [boundary, setBoundary] = useState(planningBoundary);
  useEffect(() => {
    const timer = setInterval(() => setBoundary(planningBoundary()), 60000);
    return () => clearInterval(timer);
  }, []);
  const rows = jobWorkspace(data, boundary);
  const terms = query
    .toLocaleLowerCase("sv-SE")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const visible = rows.filter(
    (row) =>
      row.lane === lane &&
      terms.every((term) =>
        `${row.application.role} ${row.application.organization} ${row.next} ${row.steps.map((s) => s.title).join(" ")}`
          .toLocaleLowerCase("sv-SE")
          .includes(term),
      ),
  );
  return (
    <section className="job-workspace stack" aria-label="Jobblista">
      <div className="job-toolbar">
        <div>
          <h2>Mina jobb</h2>
          <p>Jobbet och nästa steg på samma rad.</p>
        </div>
        <button className="button primary" onClick={onAdd}>
          Lägg till jobb
        </button>
      </div>
      <div
        className="job-lanes"
        role="group"
        aria-label="Visa jobb efter arbetsläge"
      >
        {(Object.entries(JOB_LANES) as [JobLane, string][]).map(
          ([key, label]) => (
            <button
              key={key}
              className="button secondary"
              aria-pressed={lane === key}
              onClick={() => onLane(key)}
            >
              {label}{" "}
              <span>({rows.filter((row) => row.lane === key).length})</span>
            </button>
          ),
        )}
      </div>
      <p className="help">
        {lane === "todo"
          ? "Närmaste deadline och nästa steg först. Välj ett jobb att fortsätta med."
          : lane === "waiting"
            ? "Här ligger väntan och framtida bevakningar. Jobbet flyttas till Att göra när det är dags att följa upp."
            : "Avslag och avslutade processer finns kvar med dokument och historik."}
      </p>
      <label className="job-search">
        Sök jobb
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Tjänst, arbetsgivare eller nästa steg"
        />
      </label>
      <p role="status">
        {visible.length} jobb · {JOB_LANES[lane]}
      </p>
      {!rows.length && (
        <p>
          Spara ett jobb från en länk eller annonstext. Du kan komplettera
          uppgifterna senare.
        </p>
      )}
      {!!rows.length && !visible.length && (
        <div className="application-empty">
          <p>
            {query
              ? "Inga jobb matchar sökningen."
              : lane === "todo"
                ? "Inget jobb kräver en insats här just nu."
                : "Inga jobb i det här läget."}
          </p>
          {query && (
            <button className="text-button" onClick={() => onQuery("")}>
              Rensa sökningen
            </button>
          )}
        </div>
      )}
      {!!visible.length && (
        <div className="job-list-heading" aria-hidden="true">
          <span>Jobb</span>
          <span>Status</span>
          <span>Nästa steg</span>
          <span>Datum</span>
          <span>Fortsätt</span>
        </div>
      )}
      <div className="career-cards job-list">
        {visible.map((row) => (
          <article
            className="career-card job-row"
            key={row.application.id}
            aria-label={`${row.application.role} · ${row.application.organization}`}
          >
            <div className="job-row-title">
              <h3>
                <button
                  className="job-title-button"
                  onClick={() => onOpen(row.application)}
                >
                  {row.application.role}
                </button>
              </h3>
              <p>{row.application.organization}</p>
            </div>
            <span className="job-status">
              <span className="sr-only">Status: </span>
              {APPLICATION_STATUSES[row.application.status]}
            </span>
            <p className="job-row-next">
              <span className="job-field-label">Nästa steg</span>
              {row.next}
              {row.steps.length > 1 && (
                <small>+ {row.steps.length - 1} fler i ansökan</small>
              )}
            </p>
            <p
              className={`job-row-date ${lane === "todo" && row.date && row.date <= boundary.date ? "is-due" : ""}`}
            >
              <span className="job-field-label">
                {lane === "closed"
                  ? "Avslutad"
                  : lane === "waiting"
                    ? "Bevaka från"
                    : row.application.status === "draft" &&
                        row.date === row.application.deadline
                      ? "Sök senast"
                      : "Nästa datum"}
              </span>
              {row.date ||
                (lane === "closed"
                  ? "Datum saknas"
                  : lane === "waiting"
                    ? "Inget datum valt"
                    : "Välj när det passar")}
            </p>
            <div className="job-row-actions">
              <button
                className={
                  lane === "todo" ? "button primary" : "button secondary"
                }
                onClick={() => onPrimary(row)}
              >
                {row.primary}
              </button>
              <button
                className="text-button"
                onClick={() => onMessage(row.application)}
              >
                Klistra in besked
              </button>
            </div>
          </article>
        ))}
      </div>
      <details className="job-tools">
        <summary>Fler verktyg</summary>
        <div className="career-actions">
          <button className="text-button" onClick={onImport}>
            Importera flera LinkedIn-jobb
          </button>
          <button className="text-button" onClick={onGlobalMessage}>
            Klistra in besked utan valt jobb
          </button>
          <button className="text-button" onClick={onDeadlines}>
            Deadlines och planering
          </button>
        </div>
      </details>
    </section>
  );
}
