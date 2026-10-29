"use client";
import { BookOpen, ArrowUpRight, Check } from "lucide-react";
import { categoryMinutes } from "@/lib/planner";
import { hours, weekLabel, weekNumber } from "@/lib/date";
import type { AppData, Reflection } from "@/lib/types";
const prompts = [
  ["good", "Vad fungerade bra?", "Även de små sakerna räknas."],
  ["unfinished", "Vad blev inte gjort?", "Utan att döma – bara notera."],
  [
    "balance",
    "Hur fungerade balansen?",
    "Fick livet och arbetet det utrymme du behövde?",
  ],
  [
    "next",
    "Vad vill du förändra nästa vecka?",
    "En liten justering kan räcka.",
  ],
] as const;
export function ReflectionView({
  data,
  week,
  onChange,
  onWeek,
}: {
  data: AppData;
  week: string;
  onChange: (r: Reflection) => void;
  onWeek: (w: string) => void;
}) {
  const activities = data.weeks[week]?.activities ?? [],
    planned = categoryMinutes(activities),
    done = categoryMinutes(activities, "done");
  const reflection = data.reflections[week] ?? {
    week,
    good: "",
    unfinished: "",
    balance: "",
    next: "",
    updatedAt: "",
  };
  const goals = data.goals.filter((g) => g.week === week);
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Stanna upp en stund</span>
          <h2>Hur kändes veckan?</h2>
          <p>Det här är en reflektion, inte en utvärdering av dig.</p>
        </div>
        <span className="saved-label">
          <Check size={14} />
          Sparas automatiskt lokalt
        </span>
      </div>
      <div className="reflection-layout">
        <div>
          <div className="reflection-form">
            {prompts.map(([key, title, placeholder], i) => (
              <label key={key}>
                <span className="reflection-number">0{i + 1}</span>
                <span className="reflection-prompt">{title}</span>
                <textarea
                  rows={3}
                  value={reflection[key]}
                  placeholder={placeholder}
                  onChange={(e) =>
                    onChange({
                      ...reflection,
                      [key]: e.target.value,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className="past-reflections">
            <h3>
              <BookOpen size={18} />
              Tidigare reflektioner
            </h3>
            {Object.values(data.reflections)
              .filter((r) => r.week !== week)
              .sort((a, b) => b.week.localeCompare(a.week))
              .map((r) => (
                <button key={r.week} onClick={() => onWeek(r.week)}>
                  <span>
                    Vecka {weekNumber(r.week)}{" "}
                    <small>{weekLabel(r.week)}</small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            {Object.keys(data.reflections).filter((w) => w !== week).length ===
              0 && (
              <p className="muted">
                Dina sparade reflektioner får en plats här.
              </p>
            )}
          </div>
        </div>
        <aside className="reflection-summary">
          <h3>Tiden du gav</h3>
          <p>
            Markera en aktivitet som genomförd i kalendern för att följa din
            faktiska tid.
          </p>
          <div className="comparison-head">
            <span>Livsområde</span>
            <span>Plan / gjort</span>
          </div>
          {data.categories.map((c) => (
            <div className="comparison-row" key={c.id}>
              <span>
                <i style={{ background: c.color }} />
                {c.name}
              </span>
              <strong>
                {hours(planned[c.id] ?? 0)} / {hours(done[c.id] ?? 0)}
              </strong>
              <div className="comparison-track">
                <i
                  style={{
                    width: planned[c.id]
                      ? `${Math.min(100, ((done[c.id] ?? 0) / planned[c.id]) * 100)}%`
                      : "0%",
                    background: c.color,
                  }}
                />
              </div>
            </div>
          ))}
          <div className="reflection-goals">
            <h3>Veckans resultat</h3>
            {goals.map((g) => {
              const tasks = data.tasks.filter((t) => t.goalId === g.id);
              return (
                <div key={g.id}>
                  <span>{g.title}</span>
                  <small>
                    {tasks.filter((t) => t.done).length} av {tasks.length}{" "}
                    uppgifter
                  </small>
                </div>
              );
            })}
            {!goals.length && <p>Inga veckomål ännu.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
