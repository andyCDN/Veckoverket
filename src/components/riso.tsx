"use client";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Settings2,
} from "lucide-react";
import { hours, time, weekNumber, weekLabel } from "@/lib/date";
import { categoryMinutes, targetMinutes } from "@/lib/planner";
import { categoryInk, categoryLabel, categoryStyle } from "@/lib/presentation";
import type { Activity, AppData, Category, Goal, WeekPlan } from "@/lib/types";

export function RisoMark() {
  return (
    <svg className="riso-mark" aria-hidden="true" viewBox="0 0 128 128">
      <path
        fill="currentColor"
        d="M64 4 76 47 108 20 87 56 124 64 87 76 108 108 76 87 64 124 52 87 20 108 41 76 4 64 41 52 20 20 52 41Z"
      />
    </svg>
  );
}
export function Masthead({
  week,
  name,
  connected,
  onHome,
  onAccount,
  onHelp,
}: {
  week: string;
  name: string;
  connected: boolean;
  onHome: () => void;
  onAccount: () => void;
  onHelp: () => void;
}) {
  return (
    <header className="riso-header">
      <div className="riso-topline">
        <span>
          <RisoMark />
          Veckoplanering
        </span>
        <span className="topline-center">Europe/Stockholm</span>
        <span>
          {name} /{" "}
          <button className="text-button" onClick={onHelp}>
            <CircleHelp size={13} />
            Hjälp
          </button>
        </span>
      </div>
      <div className="masthead">
        <div className="masthead-main">
          <div className="brandline">
            <RisoMark />
            <span>Jobb / lärande / musik / träning / familj</span>
          </div>
          <button
            className="masthead-brand"
            onClick={onHome}
            aria-label="Veckoverket, startsida"
          >
            Vecko<span>verket</span>
          </button>
        </div>
        <div className="issue-box">
          <span className="issue-label">
            Veckoplan / {new Date(`${week}T12:00:00Z`).getUTCFullYear()}
          </span>
          <strong>Vecka {weekNumber(week)}</strong>
          <span className="issue-date">{weekLabel(week)}</span>
        </div>
      </div>
      <div className="masthead-bottom">
        <span>Aktiviteter / mål / uppföljning</span>
        <button className="local-badge" onClick={onAccount}>
          <span className="status-square" />
          {connected ? "Anslutet konto" : "Lokalt demoläge"}
          <ArrowUpRight size={13} />
        </button>
      </div>
    </header>
  );
}
export function CategoryFilter({
  categories,
  selected,
  onChange,
  count,
  total,
}: {
  categories: Category[];
  selected: string;
  onChange: (id: string) => void;
  count: number;
  total: number;
}) {
  return (
    <div className="filter-section">
      <div
        className="category-filter"
        role="group"
        aria-label="Filtrera aktiviteter"
      >
        <button
          aria-pressed={selected === "all"}
          onClick={() => onChange("all")}
        >
          Alla
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            aria-pressed={selected === c.id}
            onClick={() => onChange(c.id)}
          >
            <i style={{ background: categoryInk(c) }} />
            {categoryLabel(c)}
          </button>
        ))}
      </div>
      <p className="filter-summary" role="status">
        {selected === "all"
          ? `${total} aktiviteter`
          : `Visar ${count} av ${total} aktiviteter`}
        {selected !== "all" && (
          <button className="text-button" onClick={() => onChange("all")}>
            Visa alla
          </button>
        )}
      </p>
    </div>
  );
}
export function EditorialSidebar({
  data,
  plan,
  goals,
  focus,
  onToggleTask,
  onGoalView,
  onSettings,
  onEdit,
  onComplete,
}: {
  data: AppData;
  plan: WeekPlan;
  goals: Goal[];
  focus?: Activity;
  onToggleTask: (id: string) => void;
  onGoalView: () => void;
  onSettings: () => void;
  onEdit: (a: Activity) => void;
  onComplete: (a: Activity) => void;
}) {
  const totals = categoryMinutes(plan.activities);
  const total = plan.activities.reduce((n, a) => n + a.end - a.start, 0);
  const locked = plan.activities
    .filter((a) => a.blockType === "locked")
    .reduce((n, a) => n + a.end - a.start, 0);
  return (
    <aside className="editorial-sidebar" aria-label="Veckosammanfattning">
      <section className="riso-total">
        <span className="overprint">Veckans timmar</span>
        <strong>{hours(total)}</strong>
        <span>Planerad tid totalt</span>
        <small>Varav {hours(locked)} låst tid</small>
      </section>
      <section className="weekly-goals">
        <h3 className="side-heading">Veckans mål</h3>
        <ol className="editorial-goals">
          {goals.slice(0, 3).map((g, i) => (
            <li key={g.id}>
              <span className="goal-number">0{i + 1}</span>
              <div>
                <button className="goal-link" onClick={onGoalView}>
                  {g.title}
                </button>
                {data.tasks
                  .filter((t) => t.goalId === g.id)
                  .slice(0, 1)
                  .map((t) => (
                    <label
                      className={`task ${t.done ? "complete" : ""}`}
                      key={t.id}
                    >
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => onToggleTask(t.id)}
                      />
                      <span className="custom-check">
                        {t.done && <Check size={12} />}
                      </span>
                      <span>{t.title}</span>
                    </label>
                  ))}
              </div>
            </li>
          ))}
        </ol>
        {!goals.length && <p>Inga mål för den här veckan.</p>}
        <button className="text-button" onClick={onGoalView}>
          Alla mål och uppgifter
          <ArrowRight size={13} />
        </button>
      </section>
      <section className="balance-section" aria-label="Veckans tidsfördelning">
        <h3 className="side-heading">Tidsfördelning</h3>
        <div className="balance-stats">
          {data.categories.map((c) => (
            <button
              className="balance-stat"
              key={c.id}
              onClick={onSettings}
              style={categoryStyle(c)}
            >
              <span className="stat-name">
                <i />
                {c.name}
              </span>
              <strong>
                {hours(totals[c.id] ?? 0)}
                <small>
                  mål{" "}
                  {hours(
                    plan.targets?.[c.id] ?? targetMinutes(c, data.settings),
                  )}
                </small>
              </strong>
            </button>
          ))}
        </div>
        <button className="text-button" onClick={onSettings}>
          <Settings2 size={13} />
          Ändra tidsmål
        </button>
      </section>
      <section className="focus-panel">
        <h3 className="side-heading">Nästa aktivitet</h3>
        {focus ? (
          <>
            <button className="focus-title" onClick={() => onEdit(focus)}>
              {focus.title}
              <ArrowUpRight size={15} />
            </button>
            <p>
              {focus.date.slice(8)}/{focus.date.slice(5, 7)} ·{" "}
              {time(focus.start)}–{time(focus.end)}
            </p>
            <button className="text-button" onClick={() => onComplete(focus)}>
              <Check size={14} />
              Markera som genomförd
            </button>
          </>
        ) : (
          <p>Inga återstående planerade aktiviteter.</p>
        )}
      </section>
    </aside>
  );
}
