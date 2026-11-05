"use client";
import {
  Check,
  Plus,
  Printer,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import {
  addDays,
  DAY_NAMES,
  fullDate,
  hours,
  time,
  today,
  weekNumber,
} from "@/lib/date";
import { appPath } from "@/lib/app-path";
import { studioWeek } from "@/lib/studio-week";
import type { Activity, AppData } from "@/lib/types";
import { Modal } from "./modal";

export function StudioHeader({
  week,
  onHome,
  onSettings,
  onAccount,
}: {
  week: string;
  onHome: () => void;
  onSettings: () => void;
  onAccount: () => void;
}) {
  return (
    <header className="studio-appbar">
      <a
        href={appPath("/")}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
          event.preventDefault();
          onHome();
        }}
      >
        <strong>
          VECKOVERKET<span aria-hidden="true">•</span>
        </strong>
        <small>
          V.{weekNumber(week)} •{" "}
          {new Intl.DateTimeFormat("sv-SE", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${week}T12:00:00Z`))}
        </small>
      </a>
      <button
        className="studio-icon"
        aria-label="Inställningar"
        onClick={onSettings}
      >
        <SlidersHorizontal size={21} />
      </button>
      <button
        className="studio-profile"
        aria-label="Konto & molnlagring"
        onClick={onAccount}
      >
        <UserRound size={20} />
      </button>
    </header>
  );
}

export function StudioWeek({
  data,
  week,
  activities,
  activeDay,
  onSelectDay,
  onDay,
  onWeek,
  onOpen,
  onStatus,
  onTask,
  onCreate,
  onNewTask,
  onGoals,
}: {
  data: AppData;
  week: string;
  activities: Activity[];
  activeDay: number;
  onSelectDay: (day: number) => void;
  onDay: () => void;
  onWeek: (week: string) => void;
  onOpen: (activity: Activity) => void;
  onStatus: (activity: Activity, done: boolean) => void;
  onTask: (id: string) => void;
  onCreate: (date: string) => void;
  onNewTask: (date: string) => void;
  onGoals: () => void;
}) {
  const model = studioWeek(data, week, activities);
  const current = today();
  const end = addDays(week, 6);
  const dateRange = new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(new Date(`${week}T12:00:00Z`), new Date(`${end}T12:00:00Z`));
  const dayTasks = (date: string, entries: Activity[]) =>
    model.tasks.filter(
      (task) =>
        task.date === date ||
        (!task.date &&
          entries.some((activity) => activity.goalId === task.goalId)),
    );
  const block = (day: number) => {
    const date = addDays(week, day);
    const entries = model.activities
      .filter((activity) => activity.date === date)
      .sort((a, b) => a.start - b.start);
    const selected = day === activeDay;
    const tasks = dayTasks(date, entries);
    return (
      <article
        key={date}
        id={`studio-day-${date}`}
        className={`studio-day ${selected ? "is-active" : ""}`}
        tabIndex={-1}
        aria-label={fullDate(date)}
      >
        <header>
          <h2>
            {DAY_NAMES[day].slice(0, 2)} <b>{Number(date.slice(8))}</b>
          </h2>
          <span>
            {date === current
              ? "Idag"
              : selected
                ? "Vald dag"
                : entries.length
                  ? `${entries.length} block`
                  : "Ledig tid"}
          </span>
        </header>
        <div className="studio-day-body">
          {!entries.length && (
            <p className="studio-empty">Inga block planerade.</p>
          )}
          <ul className="studio-entries">
            {entries.map((activity) => (
              <li
                key={activity.id}
                className={activity.status === "done" ? "is-done" : ""}
              >
                <button onClick={() => onOpen(activity)}>
                  <time>{time(activity.start)}</time>
                  <span>
                    <strong>{activity.title}</strong>
                    <small>
                      {time(activity.start)}–{time(activity.end)} ·{" "}
                      {hours(activity.end - activity.start)}
                      {activity.status === "skipped" ? " · Blev inte av" : ""}
                    </small>
                  </span>
                </button>
                <label className="studio-check">
                  <input
                    type="checkbox"
                    aria-label={`Genomförd: ${activity.title}`}
                    checked={activity.status === "done"}
                    onChange={(event) =>
                      onStatus(activity, event.target.checked)
                    }
                  />
                  <Check size={14} aria-hidden="true" />
                </label>
              </li>
            ))}
          </ul>
          {tasks.length > 0 && (
            <ul
              className="studio-task-list"
              aria-label={`Uppgifter ${DAY_NAMES[day].toLowerCase()}`}
            >
              {tasks.map((task) => (
                <li key={task.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => onTask(task.id)}
                    />
                    <span>{task.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {model.deadlines
            .filter((deadline) => deadline.date === date)
            .map((deadline) => (
              <div className="studio-deadline" key={deadline.id}>
                <span>Deadline</span>
                <strong>
                  {time(deadline.minute)} {deadline.title}
                </strong>
              </div>
            ))}
          {selected && (
            <button className="studio-add-task" onClick={() => onNewTask(date)}>
              <Plus size={15} /> Ny uppgift
            </button>
          )}
          {!selected && (
            <button
              className="studio-add-inline"
              onClick={() => onCreate(date)}
            >
              + Lägg till block
            </button>
          )}
        </div>
      </article>
    );
  };
  return (
    <section className="studio-week" aria-label="Veckoöversikt">
      <div className="studio-registration" aria-hidden="true">
        <span>RISO-REG: V.{weekNumber(week)}-VECKA</span>
        <span>⊕ DRUM: 01-KOBOLT/LIME</span>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="studio-dateband">
        <div>
          <button
            aria-label="Föregående vecka"
            onClick={() => onWeek(addDays(week, -7))}
          >
            ‹
          </button>
          <strong>
            V.{weekNumber(week)} • {dateRange}
          </strong>
          <button
            aria-label="Nästa vecka"
            onClick={() => onWeek(addDays(week, 7))}
          >
            ›
          </button>
        </div>
        <span>
          TRYCK: {model.completed} AV {model.tasks.length} KLARA (
          {model.percent}%)
        </span>
      </div>
      <div className="studio-heading">
        <h1>Veckoöversikt</h1>
        <p>Projekt • Tidslinje • Leveranser</p>
        <button className="studio-add-inline" onClick={onDay}>
          Visa dagplanering
        </button>
      </div>
      <dl className="studio-kpis">
        <div>
          <dt>Möten</dt>
          <dd>
            {model.meetings}
            <span>Planerade</span>
          </dd>
        </div>
        <div>
          <dt>Fokus</dt>
          <dd>
            {model.focus}
            <span>({hours(model.focusMinutes)})</span>
          </dd>
        </div>
        <div>
          <dt>Task</dt>
          <dd>
            {model.percent}%
            <span>
              {model.completed}/{model.tasks.length}
            </span>
          </dd>
        </div>
        <div className="is-critical">
          <dt>Deadline</dt>
          <dd>
            {model.critical}
            <span>Kritiska</span>
          </dd>
        </div>
      </dl>
      <div
        className="studio-day-strip"
        role="group"
        aria-label="Välj dag i veckoöversikten"
      >
        {Array.from({ length: 7 }, (_, day) => {
          const date = addDays(week, day);
          return (
            <button
              key={date}
              aria-label={`${date === current ? "Idag" : DAY_NAMES[day].slice(0, 2)} ${Number(date.slice(8))} – visa ${fullDate(date)}`}
              aria-pressed={day === activeDay}
              onClick={() => {
                onSelectDay(day);
                document
                  .getElementById(`studio-day-${date}`)
                  ?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
            >
              <span>
                {date === current ? "Idag" : DAY_NAMES[day].slice(0, 2)}
              </span>{" "}
              <b>{Number(date.slice(8))}</b>
            </button>
          );
        })}
      </div>
      <div className="studio-days">
        {[0, 1, 2, 3, 4].map(block)}
        <section className="studio-weekend" aria-label="Helg och återhämtning">
          <header>
            <h2>
              Lör {Number(addDays(week, 5).slice(8))} & Sön{" "}
              {Number(end.slice(8))}
            </h2>
            <span>Ledig tid</span>
          </header>
          <p>Helg & återhämtning</p>
          {[5, 6].map((day) => {
            const date = addDays(week, day);
            return activeDay === day ||
              model.activities.some((activity) => activity.date === date) ||
              model.tasks.some((task) => task.date === date) ? (
              block(day)
            ) : (
              <div
                key={date}
                id={`studio-day-${date}`}
                className="studio-weekend-empty"
              >
                <strong>
                  {DAY_NAMES[day]} {Number(date.slice(8))}
                </strong>
                <button
                  className="studio-add-inline"
                  onClick={() => onCreate(date)}
                >
                  + Lägg till block
                </button>
              </div>
            );
          })}
        </section>
      </div>
      <section
        className="studio-goals"
        aria-label="Veckans mål och prioriteringar"
      >
        <header>
          <h2>■ Veckans mål & prioriteringar</h2>
          <span>
            {model.goals.length} AV {model.goals.length} SATT
          </span>
        </header>
        {model.goals.slice(0, 3).map((goal, index) => {
          const tasks = model.tasks.filter((task) => task.goalId === goal.id);
          const done = tasks.filter((task) => task.done).length;
          return (
            <article className="studio-goal" key={goal.id}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <span className="studio-tag">
                  {data.categories.find(
                    (category) => category.id === goal.categoryId,
                  )?.name || "Mål"}
                </span>
                <button onClick={onGoals}>{goal.title}</button>
                {goal.description && <p>{goal.description}</p>}
                <div className="studio-progress" aria-hidden="true">
                  {tasks.slice(0, 10).map((task) => (
                    <i key={task.id} className={task.done ? "is-done" : ""} />
                  ))}
                </div>
                <small>
                  {done} av {tasks.length} uppgifter klara
                </small>
              </div>
            </article>
          );
        })}
        {!model.goals.length && <p>Inga mål satta för veckan.</p>}
        <button className="studio-add-inline" onClick={onGoals}>
          {model.goals.length
            ? "Visa alla mål och uppgifter"
            : "Sätt veckans mål"}
        </button>
      </section>
      <div className="studio-footer-actions">
        <button onClick={() => onCreate(addDays(week, activeDay))}>
          <Plus size={18} /> Lägg till block
        </button>
        <button
          aria-label="Skriv ut veckoöversikten"
          onClick={() => window.print()}
        >
          <Printer size={22} />
        </button>
      </div>
      <footer className="studio-print-footer">
        <strong>
          ■ VECKOVERKET STÄMPELSYSTEM • SERIE {weekNumber(week)}/
          {week.slice(2, 4)} ■
        </strong>
        <span>TRYCKORT: STOCKHOLM • NATURPAPPER 120G • OPACITET: 100%</span>
        <div aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      </footer>
    </section>
  );
}

export function StudioTaskForm({
  data,
  date,
  onClose,
  onSave,
  onNewGoal,
}: {
  data: AppData;
  date: string;
  onClose: () => void;
  onSave: (title: string, goalId: string, date: string) => void;
  onNewGoal: () => void;
}) {
  const goals = data.goals.filter((goal) => goal.categoryId !== "family");
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState(
    goals.find((goal) => date >= goal.week && date <= addDays(goal.week, 6))
      ?.id ??
      goals[0]?.id ??
      "",
  );
  const [day, setDay] = useState(date);
  if (!goals.length)
    return (
      <Modal title="Ny uppgift" onClose={onClose}>
        <div className="stack">
          <p>Skapa ett mål för att samla dina uppgifter.</p>
          <button className="button primary" onClick={onNewGoal}>
            Skapa mål
          </button>
        </div>
      </Modal>
    );
  return (
    <Modal title="Ny uppgift" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() && goals.some((goal) => goal.id === goalId))
            onSave(title.trim(), goalId, day);
        }}
      >
        <label>
          Uppgift
          <input
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Datum
          <input
            required
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </label>
        {goals.length ? (
          <label>
            Koppla till mål
            <select
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
            >
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>Skapa ett mål för att samla dina uppgifter.</p>
        )}
        {goals.length ? (
          <button className="button primary">Spara uppgift</button>
        ) : (
          <button className="button primary" type="button" onClick={onNewGoal}>
            Skapa mål
          </button>
        )}
      </form>
    </Modal>
  );
}
