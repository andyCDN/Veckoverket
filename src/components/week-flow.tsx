"use client";
import { useEffect, useState } from "react";
import type { AppData, Conflict, Task } from "@/lib/types";
import { addDays, fullDate, planningBoundary, today } from "@/lib/date";
import { nextSteps, type NextStep } from "@/lib/next-steps";
import { taskStage, weekTasks, type TaskDecision } from "@/lib/task-workflow";
import { habitWeek } from "@/lib/habits";
import { Modal } from "./modal";

export function PlanningQueue({
  data,
  week,
  onAction,
}: {
  data: AppData;
  week: string;
  onAction: (step: NextStep) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => refresh((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  const items = nextSteps(data, week);
  if (!items.length) return null;
  return (
    <section className="week-action-queue" aria-label="Nästa steg">
      <header>
        <h2>
          Nästa steg <small>{items.length}</small>
        </h2>
        <span>Uppgifter, bevakningar och tid att boka</span>
      </header>
      <ul>
        {(expanded ? items : items.slice(0, 4)).map((item) => (
          <li key={item.key}>
            <div>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </div>
            <button className="button secondary" onClick={() => onAction(item)}>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      {items.length > 4 && (
        <button className="text-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Visa färre" : `Visa alla ${items.length} nästa steg`}
        </button>
      )}
    </section>
  );
}

export function TaskResolution({
  task,
  completed,
  onDecision,
  onClose,
  allowDrop = true,
  context,
}: {
  context?: string;
  allowDrop?: boolean;
  task: Task;
  completed: boolean;
  onDecision: (decision: TaskDecision) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<"more" | "waiting" | null>(null);
  const [minutes, setMinutes] = useState(task.estimatedMinutes ?? 30);
  const [date, setDate] = useState(today());
  const [review, setReview] = useState(task.reviewOn ?? addDays(today(), 2));
  const [owner, setOwner] = useState(task.waitingFor ?? "");
  const [error, setError] = useState("");
  const decide = (decision: TaskDecision) => {
    try {
      setError("");
      onDecision(decision);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Ändringen kunde inte sparas.",
      );
    }
  };
  return (
    <Modal title="Nästa steg efter passet" onClose={onClose}>
      <div className="stack task-resolution">
        {context && <p className="muted">{context}</p>}
        <h3>{task.title}</h3>
        <p>
          {completed
            ? "Genomförd tid är sparad. Är uppgiften klar eller behövs ett nästa steg?"
            : "Välj vad som ska hända med uppgiften härnäst."}
        </p>
        {!choice ? (
          <div className="task-resolution-options">
            <button
              className="button primary"
              onClick={() => decide({ kind: "done" })}
            >
              Klar
            </button>
            <button
              className="button secondary"
              onClick={() => setChoice("more")}
            >
              Mer tid
            </button>
            <button
              className="button secondary"
              onClick={() => setChoice("waiting")}
            >
              Väntar
            </button>
            {allowDrop && (
              <details>
                <summary>Fler alternativ</summary>
                <button
                  className="text-button"
                  onClick={() => decide({ kind: "drop" })}
                >
                  Släpp uppgiften
                </button>
              </details>
            )}
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              decide(
                choice === "more"
                  ? { kind: "more", minutes, date }
                  : { kind: "waiting", owner, date: review },
              );
            }}
          >
            {choice === "more" ? (
              <>
                <label>
                  Återstående minuter
                  <input
                    type="number"
                    required
                    min={15}
                    max={240}
                    step={15}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  />
                </label>
                <label>
                  Dag för återstående arbete
                  <input
                    type="date"
                    required
                    min={today()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <button className="button primary">
                  Planera återstående arbete
                </button>
              </>
            ) : (
              <>
                <label>
                  Vem väntar du på?
                  <input
                    required
                    maxLength={200}
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  />
                </label>
                <label>
                  Följ upp datum
                  <input
                    type="date"
                    required
                    min={today()}
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                  />
                </label>
                <button className="button primary">Spara bevakning</button>
              </>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => setChoice(null)}
            >
              Tillbaka
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

export function WeekReview({
  data,
  week,
  onFinish,
  onDecision,
}: {
  data: AppData;
  week: string;
  onFinish: (ids: string[]) => void;
  onDecision: (id: string, decision: TaskDecision) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const next = addDays(week, 7);
  const tasks = weekTasks(data, week);
  const open = tasks.filter((t) => !t.done && t.state !== "dropped");
  const habits = (data.habits ?? []).filter(
    (h) => !h.paused && h.createdOn <= addDays(week, 6),
  );
  const reflection = data.reflections[week];
  return (
    <section className="week-review-flow" aria-label="Avsluta veckan">
      <h3>Veckans resultat och nästa vecka</h3>
      <p>
        {tasks.filter((t) => t.done).length} uppgifter klara · {open.length}{" "}
        återstår · {tasks.filter((t) => t.state === "dropped").length} släppta
      </p>
      {habits.length > 0 && (
        <details>
          <summary>Vanornas genomförande</summary>
          <ul>
            {habits.map((h) => {
              const s = habitWeek(h, week, data);
              return (
                <li key={h.id}>
                  {h.title}: {s.completed} av {s.target} dagar
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {reflection?.reviewSummary && (
        <details open>
          <summary>Sparad veckosammanfattning</summary>
          <p className="career-notes">{reflection.reviewSummary}</p>
        </details>
      )}
      <h4>Vad ska följa med till nästa vecka?</h4>
      {!open.length && <p>Inga öppna uppgifter återstår.</p>}
      <ul>
        {open.map((task) => (
          <li key={task.id}>
            {task.date && task.date >= next ? (
              <span>
                {task.title} · redan förd vidare till {fullDate(task.date)}
              </span>
            ) : (
              <label>
                <input
                  type="checkbox"
                  aria-label={`För vidare: ${task.title}`}
                  checked={selected.includes(task.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, task.id]
                        : selected.filter((id) => id !== task.id),
                    )
                  }
                />
                <span>
                  {task.title}
                  {task.state === "waiting"
                    ? ` · väntar på ${task.waitingFor}`
                    : ""}
                </span>
              </label>
            )}
            <details>
              <summary>Fler alternativ</summary>
              <button
                className="text-button"
                onClick={() => onDecision(task.id, { kind: "done" })}
              >
                Markera uppgiften klar
              </button>
              <button
                className="text-button"
                onClick={() => onDecision(task.id, { kind: "drop" })}
              >
                Släpp uppgiften
              </button>
            </details>
          </li>
        ))}
      </ul>
      {tasks.some((t) => t.state === "dropped") && (
        <details>
          <summary>Släppta uppgifter</summary>
          {tasks
            .filter((t) => t.state === "dropped")
            .map((t) => (
              <p key={t.id}>
                {t.title}{" "}
                <button
                  className="text-button"
                  onClick={() => onDecision(t.id, { kind: "reopen" })}
                >
                  Återuppta
                </button>
              </p>
            ))}
        </details>
      )}
      <p>
        Valda uppgifter förs till veckan som börjar {fullDate(next)}. Deras
        tidigare planerade pass markeras som missade; genomförda pass och
        ursprungliga mål bevaras.
      </p>
      <button
        className="button primary"
        onClick={() => {
          onFinish(selected);
          setSelected([]);
          setMessage(
            selected.length
              ? "Veckosammanfattningen är sparad. Valda uppgifter finns i nästa vecka."
              : "Veckosammanfattningen är sparad.",
          );
        }}
      >
        {reflection?.reviewSummary
          ? "Uppdatera veckosammanfattningen"
          : "Avsluta veckan"}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function PlanNotices({
  conflicts,
  onSettings,
}: {
  conflicts: Conflict[];
  onSettings: () => void;
}) {
  const errors = conflicts.filter((c) => c.severity === "error"),
    info = conflicts.filter((c) => c.severity !== "error");
  return (
    <div className="plan-notices">
      {errors.length > 0 && (
        <section className="plan-errors" role="alert">
          <h3>Behöver åtgärdas</h3>
          {errors.map((c) => (
            <p key={c.id}>
              <strong>{c.message}</strong>
              <br />
              {c.suggestion}
            </p>
          ))}
          <button className="text-button" onClick={onSettings}>
            Öppna planeringsinställningar
          </button>
        </section>
      )}
      {info.length > 0 && (
        <details className="plan-info">
          <summary>Planeringsinformation ({info.length})</summary>
          {info.map((c) => (
            <p key={c.id}>
              <strong>{c.message}</strong>
              <br />
              {c.suggestion}
            </p>
          ))}
          <button className="text-button" onClick={onSettings}>
            Justera tidsmål och inställningar
          </button>
        </details>
      )}
    </div>
  );
}
