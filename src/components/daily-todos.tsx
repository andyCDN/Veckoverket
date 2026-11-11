"use client";
import { useState } from "react";
import type { AppData, DailyCheckIn } from "@/lib/types";
import {
  dailyTodoPlan,
  updateDailyTodo,
  type DailyTodo,
  type DailyTodoAction,
} from "@/lib/daily-check-in";

export function DailyTodos({
  data,
  date,
  compact = false,
  onUpdate,
}: {
  data: AppData;
  date: string;
  compact?: boolean;
  onUpdate: (
    value: DailyCheckIn,
    start: boolean,
    date: string,
  ) => string | undefined;
}) {
  const [error, setError] = useState("");
  const plan = dailyTodoPlan(data, date);
  const pending = plan.items.filter(
    (item) => item.active && !item.completed && !item.deferred,
  );
  const completed = plan.items.filter((item) => item.completed || !item.active);
  const deferred = plan.items.filter(
    (item) => item.active && !item.completed && item.deferred,
  );
  const change = (item: DailyTodo, action: DailyTodoAction) => {
    try {
      setError(
        onUpdate(
          updateDailyTodo(data, date, item.key, action),
          action === "start",
          date,
        ) ?? "",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Listan kunde inte uppdateras.",
      );
    }
  };
  const row = (
    item: DailyTodo,
    mode: "pending" | "done" | "deferred" | "more" = "pending",
  ) => (
    <li className="daily-todo" key={item.key}>
      <label className="daily-todo-label">
        {mode !== "more" && (
          <input
            type="checkbox"
            checked={item.completed}
            disabled={!item.active}
            aria-label={`Steget för ${item.focus.title} klart`}
            onChange={() => change(item, "complete")}
          />
        )}
        <span>
          <strong>{item.title}</strong>
          <span className="daily-todo-source">{item.focus.title}</span>
          <small>{item.hint}</small>
        </span>
      </label>
      <div className="daily-todo-actions">
        {mode === "pending" && (
          <>
            <button
              type="button"
              className="button primary"
              aria-label={`Börja med ${item.focus.title}`}
              onClick={() => change(item, "start")}
            >
              Börja
            </button>
            <button
              type="button"
              className="text-button"
              aria-label={`Lägg ${item.focus.title} åt sidan idag`}
              onClick={() => change(item, "defer")}
            >
              Inte idag
            </button>
          </>
        )}
        {mode === "deferred" && (
          <button
            type="button"
            className="button secondary"
            aria-label={`Ta tillbaka ${item.focus.title}`}
            onClick={() => change(item, "restore")}
          >
            Ta tillbaka
          </button>
        )}
        {mode === "more" && (
          <button
            type="button"
            className="button secondary"
            aria-label={`Lägg till ${item.focus.title} idag`}
            onClick={() => change(item, "add")}
          >
            Lägg till idag
          </button>
        )}
      </div>
    </li>
  );
  return (
    <div className="daily-todos" aria-label="Dagens små steg">
      {(["jobs", "network"] as const).map((group) => {
        const items = pending.filter((item) => item.group === group);
        if (!items.length) return null;
        return (
          <section
            key={group}
            aria-label={group === "jobs" ? "Jobb idag" : "Nätverkande idag"}
          >
            <h3>{group === "jobs" ? "Jobb" : "Nätverkande"}</h3>
            <ul>
              {(compact ? items.slice(0, 1) : items).map((item) => row(item))}
            </ul>
            {compact && items.length > 1 && (
              <p className="help">{items.length - 1} fler i dagens lista</p>
            )}
          </section>
        );
      })}
      {!pending.length && (
        <p className="daily-todos-empty">
          {deferred.length
            ? "Stegen som återstår ligger åt sidan idag. Kalendern och dina deadlines finns kvar."
            : completed.some((item) => item.completed)
              ? "Dagens valda små steg är klara. Du behöver inte fylla på med fler."
              : "Inga aktuella små steg för jobb eller nätverkande idag."}
        </p>
      )}
      {!compact && (
        <>
          {completed.length > 0 && (
            <details className="daily-todos-done">
              <summary>
                Klart och inte längre aktuellt ({completed.length})
              </summary>
              <ul>{completed.map((item) => row(item, "done"))}</ul>
            </details>
          )}
          {deferred.length > 0 && (
            <details className="daily-todos-deferred">
              <summary>Åt sidan idag ({deferred.length})</summary>
              <ul>{deferred.map((item) => row(item, "deferred"))}</ul>
            </details>
          )}
          {plan.more.length > 0 && (
            <details className="daily-todos-more">
              <summary>Fler steg att välja på ({plan.more.length})</summary>
              <ul>{plan.more.map((item) => row(item, "more"))}</ul>
            </details>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
