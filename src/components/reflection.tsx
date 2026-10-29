"use client";
import { BookOpen, ArrowUpRight, Check } from "lucide-react";
import { categoryMinutes } from "@/lib/planner";
import { categoryInk } from "@/lib/presentation";
import { hours, weekLabel, weekNumber } from "@/lib/date";
import type { AppData, Reflection } from "@/lib/types";
const prompts = [
  [
    "startPlan",
    "Veckans startplan",
    "Ange veckans viktigaste uppgifter och när de ska göras.",
  ],
  ["good", "Vad fungerade bra?", "Beskriv vad som fungerade."],
  [
    "unfinished",
    "Vad blev inte gjort?",
    "Ange aktiviteter eller uppgifter som återstår.",
  ],
  [
    "balance",
    "Hur fungerade balansen?",
    "Beskriv fördelningen mellan livsområdena.",
  ],
  [
    "goalReview",
    "Bedömning av måluppfyllelse",
    "Ange vilka mål som är uppnådda och vad som återstår.",
  ],
  [
    "next",
    "Vad vill du förändra nästa vecka?",
    "Ange ändringar inför nästa vecka.",
  ],
] as const;
export function ReflectionView({
  data,
  week,
  onChange,
  onWeek,
  storageLabel = "Sparas automatiskt på enheten",
}: {
  data: AppData;
  week: string;
  onChange: (r: Reflection) => void;
  onWeek: (w: string) => void;
  storageLabel?: string;
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
          <h2>Uppföljning av veckan</h2>
          <p>Jämför planerad tid, genomförd tid och resultat.</p>
        </div>
        <span className="saved-label">
          <Check size={14} />
          {storageLabel}
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
                  value={reflection[key] ?? ""}
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
              0 && <p className="muted">Inga tidigare reflektioner.</p>}
          </div>
        </div>
        <aside className="reflection-summary">
          <h3>Planerad och genomförd tid</h3>
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
                <i style={{ background: categoryInk(c) }} />
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
                    background: categoryInk(c),
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
