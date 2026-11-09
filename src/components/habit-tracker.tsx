"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { Check } from "lucide-react";
import type { AppData, Habit } from "@/lib/types";
import {
  addDays,
  DAY_NAMES,
  fullDate,
  monday,
  today,
  weekNumber,
} from "@/lib/date";
import {
  habitPlanned,
  habitWeek,
  effectiveHabitChecks,
  type HabitDraft,
} from "@/lib/habits";
import { workBookings } from "@/lib/weekly-work";
import { Modal } from "./modal";

export function HabitTracker({
  data,
  week,
  onWeek,
  onToggle,
  onSave,
  onPause,
  onEditing,
  onPlan,
  onOpen,
}: {
  onPlan: (id: string) => void;
  onOpen: (activity: import("@/lib/types").Activity) => void;
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
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setCurrent(today()), 60000);
    return () => clearInterval(timer);
  }, []);
  useLayoutEffect(() => {
    onEditing(Boolean(draft));
    return () => onEditing(false);
  }, [Boolean(draft), onEditing]);
  const dates = Array.from({ length: 7 }, (_, day) => addDays(week, day));
  const eligibleHabits = (data.habits ?? []).filter(
    (h) => h.createdOn <= dates[6] && (!h.paused || showPaused),
  );
  const sortedHabits = [...eligibleHabits].sort((a, b) => {
    if (week !== monday(current)) return 0;
    const rank = (h: Habit) =>
      h.paused
        ? 3
        : habitWeek(h, week, data).percent === 100
          ? 2
          : habitPlanned(h, current) &&
              !effectiveHabitChecks(h, data).includes(current)
            ? 0
            : 1;
    return rank(a) - rank(b);
  });
  const habits = showAll ? sortedHabits : sortedHabits.slice(0, 3);
  const dueToday = eligibleHabits.filter(
    (h) =>
      !h.paused &&
      habitPlanned(h, current) &&
      (h.schedule.kind === "days" ||
        habitWeek(h, week, data).completed < h.schedule.target ||
        effectiveHabitChecks(h, data).includes(current)),
  );
  return (
    <section className="habit-tracker" aria-label="Vanor">
      <header className="habit-heading">
        <div>
          <span className="habit-kicker">Små steg, vecka för vecka</span>
          <h2>Vanor</h2>
        </div>
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
            {
              dueToday.filter((h) =>
                effectiveHabitChecks(h, data).includes(current),
              ).length
            }{" "}
            av {dueToday.length} klara idag
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
          {!data.habits?.length && <p>Välj Lägg till → Vana för att börja.</p>}
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
              const { completed, target, percent } = habitWeek(
                habit,
                week,
                data,
              );
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
                          minutes: habit.minutes,
                          categoryId: habit.categoryId,
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
                    {habit.minutes && !habit.paused && (
                      <button
                        className="text-button habit-plan-button"
                        onClick={() => onPlan(habit.id)}
                      >
                        Boka i veckan
                      </button>
                    )}
                    <span className="habit-progress" aria-hidden="true">
                      <i style={{ width: `${percent}%` }} />
                    </span>
                  </th>
                  {dates.map((date) => {
                    const checked = effectiveHabitChecks(habit, data).includes(
                      date,
                    );
                    const source = !habit.checks.includes(date)
                      ? Object.values(data.weeks)
                          .flatMap((p) => p.activities)
                          .find(
                            (a) =>
                              a.habitId === habit.id &&
                              a.date === date &&
                              a.status === "done",
                          )
                      : undefined;
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
                            {source ? (
                              <button
                                className="habit-derived-check"
                                type="button"
                                title="Genomfört via kalenderpass. Öppna passet för att ändra."
                                aria-label={`${habit.title} avklarad via kalendern, ${fullDate(date)}. Öppna passet`}
                                onClick={() => onOpen(source)}
                              >
                                <Check size={16} aria-hidden="true" />
                              </button>
                            ) : (
                              <>
                                <input
                                  type="checkbox"
                                  aria-label={`${habit.title}, ${fullDate(date)}`}
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={() => onToggle(habit.id, date)}
                                />
                                <Check size={16} aria-hidden="true" />
                              </>
                            )}
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
      <div className="habit-calendar-links">
        {habits.map((habit) => {
          const booked = workBookings(data, "habit", habit.id).filter(
            (a) => monday(a.date) === week,
          );
          return booked.length ? (
            <details key={habit.id}>
              <summary>
                {habit.title} · {booked.length} kalenderpass
              </summary>
              {booked.map((a) => (
                <button
                  key={a.id}
                  className="text-button"
                  onClick={() => onOpen(a)}
                >
                  {fullDate(a.date)} ·{" "}
                  {String(Math.floor(a.start / 60)).padStart(2, "0")}:
                  {String(a.start % 60).padStart(2, "0")} ·{" "}
                  {a.status === "done" ? "Genomfört" : "Bokat"}
                </button>
              ))}
            </details>
          ) : null;
        })}
      </div>
      {eligibleHabits.length > 3 && (
        <button className="text-button" onClick={() => setShowAll(!showAll)}>
          {showAll
            ? "Visa färre vanor"
            : `Visa alla ${eligibleHabits.length} vanor`}
        </button>
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
          data={data}
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

export function HabitForm({
  value,
  data,
  existing,
  onSave,
  onPause,
  onClose,
}: {
  value: HabitDraft;
  data: AppData;
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
  const [timed, setTimed] = useState(Boolean(value.minutes));
  const [minutes, setMinutes] = useState(value.minutes ?? 30);
  const [categoryId, setCategoryId] = useState(
    value.categoryId ??
      data.categories.find((c) => c.id === "health")?.id ??
      data.categories[0].id,
  );
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
              minutes: timed ? minutes : undefined,
              categoryId: timed ? categoryId : undefined,
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
        <label className="habit-calendar-toggle">
          <input
            type="checkbox"
            checked={timed}
            onChange={(e) => setTimed(e.target.checked)}
          />
          Avsätt tid i kalendern
        </label>
        {timed && (
          <div className="stack">
            <label>
              Minuter per tillfälle
              <input
                type="number"
                min={15}
                max={240}
                step={15}
                required
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
            <label>
              Område för kalenderpass
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {data.categories
                  .filter((c) => c.id !== "google-calendar")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
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
