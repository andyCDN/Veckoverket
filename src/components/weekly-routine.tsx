"use client";
import type { Activity, AppData, Reflection } from "@/lib/types";
import { addDays, fullDate, time, weekNumber } from "@/lib/date";
import { WeekReview } from "./week-flow";
import type { TaskDecision } from "@/lib/task-workflow";
import { MondayGoals } from "./monday-goals";
import type { MondayGoalDraft } from "@/lib/monday-goals";
import { Modal } from "./modal";

export function WeeklyRoutineModal({
  activity,
  scheduled = true,
  data,
  week,
  storageLabel,
  onChange,
  onTask,
  onComplete,
  onEdit,
  onGoals,
  onNextWeek,
  onClose,
  onCreateGoals,
  onPlanWeek,
  onReviewFinish,
  onTaskDecision,
}: {
  activity: Activity;
  scheduled?: boolean;
  data: AppData;
  week: string;
  storageLabel: string;
  onChange: (reflection: Reflection) => void;
  onTask: (id: string) => void;
  onComplete: () => void;
  onEdit: () => void;
  onGoals: () => void;
  onNextWeek: () => void;
  onClose: () => void;
  onCreateGoals: (drafts: MondayGoalDraft[]) => number;
  onPlanWeek: () => void;
  onReviewFinish: (ids: string[]) => void;
  onTaskDecision: (id: string, decision: TaskDecision) => void;
}) {
  const start = activity.routine === "week-start";
  const reflection = data.reflections[week] ?? {
    week,
    good: "",
    unfinished: "",
    balance: "",
    next: "",
    updatedAt: "",
  };
  const goals = data.goals.filter(
    (g) => g.week === week && g.horizon === "week",
  );
  const nextWeek = addDays(week, 7);
  const nextPlan = data.weeks[nextWeek];
  const nextGoals = data.goals.filter(
    (g) => g.week === nextWeek && g.horizon === "week",
  );
  const field = (
    key: "startPlan" | "good" | "unfinished" | "goalReview" | "next",
    title: string,
    hint: string,
  ) => (
    <label className="routine-field">
      <strong>{title}</strong>
      <span>{hint}</span>
      <textarea
        rows={3}
        value={reflection[key] ?? ""}
        onChange={(event) =>
          onChange({
            ...reflection,
            [key]: event.target.value,
            updatedAt: new Date().toISOString(),
          })
        }
      />
    </label>
  );
  return (
    <Modal
      title={start ? "Måndagscheck" : "Fredagscheck"}
      description={
        scheduled
          ? `${fullDate(activity.date)} · ${time(activity.start)}–${time(activity.end)}`
          : fullDate(activity.date)
      }
      onClose={onClose}
    >
      <div className="stack weekly-routine">
        <p className="muted" role="status">
          {storageLabel}
        </p>
        {!start && (
          <WeekReview
            data={data}
            week={week}
            onFinish={onReviewFinish}
            onDecision={onTaskDecision}
          />
        )}
        {start && data.reflections[addDays(week, -7)]?.next && (
          <section className="previous-week-summary">
            <h3>Från förra veckans fredagscheck</h3>
            <p className="career-notes">
              {data.reflections[addDays(week, -7)].next}
            </p>
          </section>
        )}
        {start && data.reflections[addDays(week, -7)]?.reviewSummary && (
          <details>
            <summary>Förra veckans sparade resultat</summary>
            <p className="career-notes">
              {data.reflections[addDays(week, -7)].reviewSummary}
            </p>
          </details>
        )}
        {start ? (
          <>
            <p>
              Bestäm veckans viktigaste resultat, skapa veckomål och välj sedan
              vilka uppgifter som ska få tid i kalendern.
            </p>
            {field(
              "startPlan",
              "Veckans startplan",
              "Skriv ett önskat resultat per rad. Förslagen går att ändra innan målen skapas.",
            )}
          </>
        ) : (
          <>
            {field(
              "good",
              "Sammanfattning av veckan",
              "Vad blev gjort och vad fungerade?",
            )}
            {field(
              "unfinished",
              "Det som återstår",
              "Vilka uppgifter återstår, och vad behöver bokas om?",
            )}
          </>
        )}
        {start && (
          <MondayGoals
            data={data}
            text={reflection.startPlan ?? ""}
            onCreate={onCreateGoals}
          />
        )}
        {start && (
          <section className="routine-planning">
            <h3>Från mål till veckoplan</h3>
            <p>
              Välj konkreta uppgifter och vanotillfällen, ange tidsbehov och
              granska vad som ryms i den här veckan.
            </p>
            <button className="button primary" onClick={onPlanWeek}>
              Planera veckans mål och vanor
            </button>
          </section>
        )}
        <section
          className="routine-goals"
          aria-label={start ? "Veckans mål" : "Måluppfyllelse"}
        >
          <details open={start}>
            <summary>{start ? "Veckans mål" : "Måluppfyllelse"}</summary>
            <p>Avbockade uppgifter visar genomförandet för respektive mål.</p>
            {goals.map((goal) => {
              const tasks = data.tasks.filter(
                (task) => task.goalId === goal.id,
              );
              const done = tasks.filter((task) => task.done).length;
              return (
                <div className="routine-goal" key={goal.id}>
                  <strong>{goal.title}</strong>
                  {goal.description && <p>{goal.description}</p>}
                  <span>
                    {tasks.length
                      ? `${done} av ${tasks.length} uppgifter · ${Math.round((done / tasks.length) * 100)} %`
                      : "Inga uppgifter kopplade – bedöm målet i anteckningarna."}
                  </span>
                  {tasks.map((task) => (
                    <label className="routine-task" key={task.id}>
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => onTask(task.id)}
                      />
                      <span>{task.title}</span>
                    </label>
                  ))}
                </div>
              );
            })}
            {!goals.length && <p>Inga veckomål finns för den här veckan.</p>}
            <button className="button secondary" onClick={onGoals}>
              Öppna mål och uppgifter
            </button>
          </details>
        </section>
        {!start && (
          <>
            {field(
              "goalReview",
              "Bedömning av måluppfyllelse",
              "Vilka mål är uppnådda, delvis uppnådda eller kvar? Ange vad som återstår.",
            )}
            <section className="routine-next" aria-label="Nästa vecka">
              <h3>Nästa vecka · {weekNumber(nextWeek)}</h3>
              <p>
                {fullDate(nextWeek)}–{fullDate(addDays(nextWeek, 4))}
              </p>
              <p>
                {nextPlan
                  ? `${nextPlan.activities.length} pass i den sparade planen.`
                  : "Nästa vecka har ingen sparad plan ännu."}
              </p>
              {nextGoals.length > 0 && (
                <ul>
                  {nextGoals.map((goal) => (
                    <li key={goal.id}>{goal.title}</li>
                  ))}
                </ul>
              )}
              {field(
                "next",
                "Plan inför nästa vecka",
                "Notera prioriteringar, bokningar och uppgifter som behöver föras över.",
              )}
              <button className="button secondary" onClick={onNextWeek}>
                Öppna nästa vecka
              </button>
            </section>
          </>
        )}
        <div className="routine-actions">
          {scheduled && (
            <button className="text-button" onClick={onEdit}>
              Ändra tid eller pass
            </button>
          )}
          {!start ? (
            <button className="button secondary" onClick={onClose}>
              Stäng checken
            </button>
          ) : !scheduled ? (
            <button className="button secondary" onClick={onClose}>
              Klar
            </button>
          ) : activity.status !== "done" ? (
            <button className="button secondary" onClick={onComplete}>
              Markera som genomförd
            </button>
          ) : (
            <span>Passet är genomfört.</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
