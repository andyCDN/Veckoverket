"use client";
import type { Activity, AppData, Reflection } from "@/lib/types";
import { addDays, fullDate, time, weekNumber } from "@/lib/date";
import { Modal } from "./modal";

export function WeeklyRoutineModal({
  activity,
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
}: {
  activity: Activity;
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
      title={activity.title}
      description={`${fullDate(activity.date)} · ${time(activity.start)}–${time(activity.end)}`}
      onClose={onClose}
    >
      <div className="stack weekly-routine">
        <p className="muted" role="status">
          {storageLabel}
        </p>
        {start ? (
          <>
            <p>
              Gå igenom veckans mål och fasta bokningar. Välj uppgifterna som
              ska få tid i kalendern.
            </p>
            {field(
              "startPlan",
              "Veckans startplan",
              "Skriv de viktigaste uppgifterna, när de ska göras och eventuella hinder.",
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
        <section
          className="routine-goals"
          aria-label={start ? "Veckans mål" : "Måluppfyllelse"}
        >
          <h3>{start ? "Veckans mål" : "Måluppfyllelse"}</h3>
          <p>Avbockade uppgifter visar genomförandet för respektive mål.</p>
          {goals.map((goal) => {
            const tasks = data.tasks.filter((task) => task.goalId === goal.id);
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
            Öppna mål och aktiviteter
          </button>
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
          <button className="text-button" onClick={onEdit}>
            Ändra tid eller pass
          </button>
          {activity.status !== "done" ? (
            <button className="button primary" onClick={onComplete}>
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
