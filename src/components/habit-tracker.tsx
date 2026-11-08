"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { AppData, Habit } from "@/lib/types";
import {
  addDays,
  DAY_NAMES,
  fullDate,
  monday,
  today,
  uid,
  weekNumber,
} from "@/lib/date";
import { habitPlanned, habitWeek, type HabitDraft } from "@/lib/habits";
import { Modal } from "./modal";

export function HabitTracker({
  data,
  week,
  onWeek,
  onToggle,
  onSave,
  onPause,
  onEditing,
}: {
  data: AppData;
  week: string;
  onWeek: (week: string) => void;
  onToggle: (id: string, date: string) => void;
  onSave: (draft: HabitDraft) => void;
  onPause: (id: string) => void;
  onEditing: (editing: boolean) => void;
}) {
  const [current, setCurrent] = useState(today);
  const [draft, setDraft] = useState<HabitDraft | null>(null);
  const [showPaused, setShowPaused] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setCurrent(today()), 60000);
    return () => clearInterval(timer);
  }, []);
  useLayoutEffect(() => {
    onEditing(Boolean(draft));
    return () => onEditing(false);
  }, [Boolean(draft), onEditing]);
  const dates = Array.from({ length: 7 }, (_, day) => addDays(week, day));
  const habits = (data.habits ?? []).filter(
    (h) => h.createdOn <= dates[6] && (!h.paused || showPaused),
  );
  const dueToday = habits.filter(
    (h) =>
      !h.paused &&
      habitPlanned(h, current) &&
      (h.schedule.kind === "days" ||
        habitWeek(h, week).completed < h.schedule.target ||
        h.checks.includes(current)),
  );
  const newHabit = () =>
    setDraft({
      id: uid(),
      title: "",
      createdOn: current,
      schedule: { kind: "days", days: [0, 1, 2, 3, 4] },
    });
  return (
    <section className="habit-tracker" aria-label="Vanor">
      <header className="habit-heading">
        <div>
          <span className="habit-kicker">Små steg, vecka för vecka</span>
          <h2>Vanor</h2>
        </div>
        <button className="button primary" onClick={newHabit}>
          <Plus size={15} aria-hidden="true" />
          Ny vana
        </button>
      </header>
      <div className="habit-week-bar">
        <div className="habit-week-controls">
          <button
            aria-label="Föregående vanovecka"
            onClick={() => onWeek(addDays(week, -7))}
          >
            ‹
          </button>
          <strong>
            V.{weekNumber(week)} · {Number(week.slice(8))}/
            {Number(week.slice(5, 7))}–{Number(dates[6].slice(8))}/
            {Number(dates[6].slice(5, 7))}
          </strong>
          <button
            aria-label="Nästa vanovecka"
            onClick={() => onWeek(addDays(week, 7))}
          >
            ›
          </button>
        </div>
        {week === monday(current) && dueToday.length > 0 && (
          <p className="habit-today">
            {dueToday.filter((h) => h.checks.includes(current)).length} av{" "}
            {dueToday.length} klara idag
          </p>
        )}
      </div>
      {!habits.length ? (
        <div className="habit-empty">
          <p>
            {data.habits?.length
              ? "Inga aktiva vanor för den här veckan."
              : "Vad vill du göra regelbundet? Börja med en vana och ett rimligt veckomål."}
          </p>
          {!data.habits?.length && (
            <button className="text-button" onClick={newHabit}>
              Skapa din första vana
            </button>
          )}
        </div>
      ) : (
        <table className="habit-matrix">
          <caption className="sr-only">
            Vanor vecka {weekNumber(week)}. Bocka av en dag när du är klar.
          </caption>
          <colgroup>
            <col className="habit-title-column" />
            {dates.map((date) => (
              <col key={date} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Vana / veckomål</th>
              {dates.map((date, day) => (
                <th
                  key={date}
                  scope="col"
                  className={date === current ? "habit-is-today" : ""}
                >
                  <span>{DAY_NAMES[day].slice(0, 2)}</span>
                  <b>{Number(date.slice(8))}</b>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map((habit) => {
              const { completed, target, percent } = habitWeek(habit, week);
              return (
                <tr
                  key={habit.id}
                  className={habit.paused ? "habit-is-paused" : ""}
                >
                  <th scope="row">
                    <button
                      className="habit-name"
                      aria-label={`Redigera vana: ${habit.title}`}
                      onClick={() =>
                        setDraft({
                          id: habit.id,
                          title: habit.title,
                          createdOn: habit.createdOn,
                          schedule: habit.schedule,
                        })
                      }
                    >
                      {habit.title}
                    </button>
                    <small>
                      {habit.paused
                        ? "Pausad"
                        : target
                          ? `${completed} av ${target} dagar klara`
                          : "Inga planerade dagar"}
                    </small>
                    <span className="habit-progress" aria-hidden="true">
                      <i style={{ width: `${percent}%` }} />
                    </span>
                  </th>
                  {dates.map((date) => {
                    const checked = habit.checks.includes(date);
                    const planned = habitPlanned(habit, date);
                    const disabled =
                      date > current ||
                      date < habit.createdOn ||
                      (habit.paused && !checked);
                    return (
                      <td
                        key={date}
                        className={date === current ? "habit-today-cell" : ""}
                      >
                        {planned || checked ? (
                          <span className="habit-check">
                            <input
                              type="checkbox"
                              aria-label={`${habit.title}, ${fullDate(date)}`}
                              checked={checked}
                              disabled={disabled}
                              onChange={() => onToggle(habit.id, date)}
                            />
                            <Check size={16} aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            className="habit-rest"
                            aria-label={
                              date < habit.createdOn
                                ? "Före vanans start"
                                : "Vilodag"
                            }
                          >
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="habit-footnote">
        <span>Veckomål i ditt eget tempo</span>
        {(data.habits ?? []).some((h) => h.paused) && (
          <label>
            <input
              type="checkbox"
              checked={showPaused}
              onChange={(e) => setShowPaused(e.target.checked)}
            />
            Visa pausade vanor
          </label>
        )}
      </div>
      {draft && (
        <HabitForm
          key={draft.id}
          value={draft}
          existing={data.habits?.find((h) => h.id === draft.id)}
          onClose={() => setDraft(null)}
          onSave={(value) => {
            onSave(value);
            setDraft(null);
          }}
          onPause={() => {
            onPause(draft.id);
            setDraft(null);
          }}
        />
      )}
    </section>
  );
}

function HabitForm({
  value,
  existing,
  onSave,
  onPause,
  onClose,
}: {
  value: HabitDraft;
  existing?: Habit;
  onSave: (value: HabitDraft) => void;
  onPause: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(value.title);
  const [kind, setKind] = useState(value.schedule.kind);
  const [days, setDays] = useState(
    value.schedule.kind === "days" ? value.schedule.days : [0, 1, 2, 3, 4],
  );
  const [target, setTarget] = useState(
    value.schedule.kind === "weekly" ? value.schedule.target : 3,
  );
  const [start, setStart] = useState(value.createdOn);
  const [error, setError] = useState("");
  return (
    <Modal title={existing ? "Redigera vana" : "Ny vana"} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          if (!title.trim()) return;
          if (kind === "days" && !days.length) {
            setError("Välj minst en veckodag.");
            return;
          }
          try {
            onSave({
              id: value.id,
              title: title.trim(),
              createdOn: start,
              schedule:
                kind === "days"
                  ? { kind, days: [...days].sort() }
                  : { kind, target },
            });
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Vanan kunde inte sparas.",
            );
          }
        }}
      >
        <label>
          Vad vill du göra regelbundet?
          <input
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Till exempel fokusarbete eller rörelse"
          />
        </label>
        <label>
          Veckomål
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "days" | "weekly")}
          >
            <option value="days">Bestämda veckodagar</option>
            <option value="weekly">Valfritt antal dagar i veckan</option>
          </select>
        </label>
        {kind === "days" ? (
          <fieldset className="habit-days">
            <legend>Vilka dagar?</legend>
            {DAY_NAMES.map((name, day) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={days.includes(day)}
                  onChange={() =>
                    setDays(
                      days.includes(day)
                        ? days.filter((d) => d !== day)
                        : [...days, day],
                    )
                  }
                />
                {name}
              </label>
            ))}
          </fieldset>
        ) : (
          <label>
            Antal dagar per vecka
            <input
              type="number"
              min={1}
              max={7}
              required
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </label>
        )}
        {!existing && (
          <label>
            Startdatum
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
        )}
        {existing && (
          <p>
            Avbockningar sparas även om du ändrar veckomålet eller pausar vanan.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="button primary">Spara vana</button>
        {existing && (
          <button className="text-button" type="button" onClick={onPause}>
            {existing.paused ? "Återuppta vanan" : "Pausa vanan"}
          </button>
        )}
      </form>
    </Modal>
  );
}
