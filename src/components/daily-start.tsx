"use client";
import { useEffect, useState } from "react";
import type { Activity, AppData, DailyCheckIn } from "@/lib/types";
import {
  dailyStart,
  gentleChoices,
  previewGentleDay,
  type GentlePreview,
} from "@/lib/daily-start";
import { fullDate, monday, planningBoundary, time } from "@/lib/date";
import { dailyTodoPlan } from "@/lib/daily-check-in";
import { DailyTodos } from "./daily-todos";
import { Modal } from "./modal";
export function DailyStart({
  data,
  week,
  onOpen,
  onPlan,
  onGentle,
  onCheckIn,
  onUpdateTodos,
}: {
  data: AppData;
  week: string;
  onOpen: (a: Activity) => void;
  onPlan: (taskId: string) => void;
  onGentle: () => void;
  onCheckIn: () => void;
  onUpdateTodos: (
    value: DailyCheckIn,
    start: boolean,
    date: string,
  ) => string | undefined;
}) {
  const [boundary, setBoundary] = useState(planningBoundary);
  useEffect(() => {
    const timer = setInterval(() => setBoundary(planningBoundary()), 60000);
    return () => clearInterval(timer);
  }, []);
  if (week !== monday(boundary.date)) return null;
  const model = dailyStart(data, boundary),
    choice = model.recommendation;
  const todos = dailyTodoPlan(data, boundary.date);
  const hasDailyTodos = todos.items.length > 0;
  return (
    <section className="daily-start" aria-label="Din dagstart">
      <header>
        <div>
          <small>{fullDate(model.date)}</small>
          <h2>Börja här idag</h2>
        </div>
        <button className="button secondary" onClick={onGentle}>
          Låg ork idag
        </button>
      </header>
      {!model.gentle && (
        <DailyTodos
          data={data}
          date={boundary.date}
          compact
          onUpdate={onUpdateTodos}
        />
      )}
      <div className="daily-check-in-invitation">
        <button className="button secondary" onClick={onCheckIn}>
          Visa dagens att göra
        </button>
      </div>
      {model.gentle && (
        <p className="daily-gentle-note">Dagen är anpassad efter din ork.</p>
      )}
      {(!hasDailyTodos || model.gentle) &&
        (choice ? (
          <div className="daily-recommendation">
            <div>
              <span>En sak att börja med</span>
              <h3>{choice.title}</h3>
              <p>
                {choice.activity
                  ? `${time(choice.activity.start)}–${time(choice.activity.end)} · bokat idag`
                  : `${choice.minutes} min uppskattad tid · behöver bokas`}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() =>
                choice.activity
                  ? onOpen(choice.activity)
                  : onPlan(choice.task!.id)
              }
            >
              {choice.activity ? "Öppna pass" : "Boka tid"}
            </button>
          </div>
        ) : (
          <p>
            {model.gentleDone
              ? "Dagens lilla insats är genomförd. Du behöver inte välja något nytt här."
              : model.gentle
                ? "Befintliga åtaganden får vara dagens plan. Resten av arbetet finns kvar för senare."
                : "Ingen uppgift behöver väljas just nu. Du kan låta dagen vara som den är, eller välja något i måndagschecken."}
          </p>
        ))}
      {model.next && model.next.id !== choice?.activity?.id && (
        <div className="daily-next">
          <span>
            Nästa bokade pass · {time(model.next.start)}–{time(model.next.end)}
          </span>
          <button className="text-button" onClick={() => onOpen(model.next!)}>
            {model.next.title}
          </button>
        </div>
      )}
      {!model.next && (
        <p className="muted daily-next">Inga fler bokade pass idag.</p>
      )}
    </section>
  );
}
export function GentleDayModal({
  data,
  onApply,
  onClose,
}: {
  data: AppData;
  onApply: (next: AppData, base: AppData) => boolean;
  onClose: () => void;
}) {
  const [boundary] = useState(planningBoundary),
    choices = gentleChoices(data, boundary);
  const [key, setKey] = useState(
    () =>
      choices.find((c) => c.activity?.taskId || c.task)?.key ??
      choices[0]?.key ??
      "",
  );
  const [minutes, setMinutes] = useState(15),
    [proposal, setProposal] = useState<{
      base: AppData;
      result: GentlePreview;
    } | null>(null),
    [error, setError] = useState("");
  const reset = () => {
    setProposal(null);
    setError("");
  };
  return (
    <Modal
      title="En lättare plan för idag"
      description={fullDate(boundary.date)}
      onClose={onClose}
    >
      <div className="stack gentle-day">
        <p>
          Välj en liten insats. Du får granska förslaget innan något ändras.
          Möten, vanor, låst tid och påbörjade pass ligger kvar.
        </p>
        <label>
          Vad vill du behålla idag?
          <select
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              reset();
            }}
          >
            <option value="">Bara befintliga åtaganden</option>
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        {key && (
          <label>
            En lagom insats
            <select
              value={minutes}
              onChange={(e) => {
                setMinutes(Number(e.target.value));
                reset();
              }}
            >
              <option value={15}>15 minuter</option>
              <option value={30}>30 minuter</option>
            </select>
          </label>
        )}
        <button
          className={proposal ? "button secondary" : "button primary"}
          onClick={() => {
            if (planningBoundary().date !== boundary.date) {
              setError("Dagen har ändrats. Stäng och öppna förslaget igen.");
              setProposal(null);
              return;
            }
            setProposal({
              base: data,
              result: previewGentleDay(data, key, minutes, planningBoundary()),
            });
            setError("");
          }}
        >
          Visa förslag för idag
        </button>
        {proposal && (
          <section
            className="gentle-preview stack"
            aria-label="Förslag för en lättare dag"
          >
            {proposal.result.errors.map((message) => (
              <p role="alert" key={message}>
                {message}
              </p>
            ))}
            {!proposal.result.errors.length && (
              <>
                <h3>
                  {proposal.result.focus
                    ? "Dagens lilla insats"
                    : "Behåll befintliga åtaganden"}
                </h3>
                {proposal.result.focus && (
                  <p>
                    <strong>{proposal.result.focus.title}</strong>
                    <br />
                    {time(proposal.result.focus.start)}–
                    {time(proposal.result.focus.end)} ·{" "}
                    {proposal.result.focus.end - proposal.result.focus.start}{" "}
                    min
                  </p>
                )}
                {proposal.result.changes.length > 0 && (
                  <ul>
                    {proposal.result.changes.map((change, i) => (
                      <li key={i}>
                        <strong>{change.title}</strong> · {change.minutes} min
                        <br />
                        {change.kind === "move"
                          ? `Flyttas till ${fullDate(change.to!.date)} ${time(change.to!.start)}–${time(change.to!.end)}`
                          : change.kind === "release"
                            ? "Det generella tidsblocket frigörs. Inga mål eller uppgifter tas bort."
                            : change.from.taskId ===
                                proposal.result.focus?.taskId
                              ? "Resten av uppgiften återstår. Efter den lilla insatsen kan du välja Mer tid."
                              : `Uppgiften förs till Nästa steg för ${fullDate(change.queuedFor!)}. Ingen ny tid kunde bokas.`}
                      </li>
                    ))}
                  </ul>
                )}
                <details>
                  <summary>
                    Åtaganden som ligger kvar ({proposal.result.fixed.length})
                  </summary>
                  <ul>
                    {proposal.result.fixed.map((a) => (
                      <li key={a.id}>
                        {time(a.start)}–{time(a.end)} · {a.title}
                      </li>
                    ))}
                  </ul>
                </details>
                <p>
                  Generella tidsblock fylls inte på automatiskt idag. Veckans
                  mål och tidigare genomförd tid bevaras. Du kan ångra
                  ändringen.
                </p>
                <button
                  className="button primary"
                  onClick={() => {
                    const now = planningBoundary();
                    if (proposal.result.date !== now.date) {
                      setError(
                        "Dagen har ändrats. Stäng och öppna förslaget igen.",
                      );
                      return;
                    }
                    if (
                      (proposal.result.focus &&
                        proposal.result.focus.start < now.minute) ||
                      proposal.result.changes.some(
                        (c) => c.from.start < now.minute,
                      )
                    ) {
                      setError(
                        "Tiden har gått sedan förslaget togs fram. Visa ett nytt förslag innan du godkänner.",
                      );
                      setProposal(null);
                      return;
                    }
                    if (onApply(proposal.result.data, proposal.base)) onClose();
                    else {
                      setError(
                        "Planen har ändrats. Visa ett nytt förslag innan du anpassar dagen.",
                      );
                      setProposal(null);
                    }
                  }}
                >
                  Godkänn dagens plan
                </button>
              </>
            )}
          </section>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="text-button" onClick={onClose}>
          Behåll planen som den är
        </button>
      </div>
    </Modal>
  );
}
