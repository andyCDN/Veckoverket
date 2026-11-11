"use client";
import { useState } from "react";
import type { AppData, DailyCheckIn } from "@/lib/types";
import { dailyChoices, dailyStart } from "@/lib/daily-start";
import {
  CHECK_IN_CUES,
  CHECK_IN_MOODS,
  RECOVERY_FOCUS,
  checkInPlan,
} from "@/lib/daily-check-in";
import { planningBoundary } from "@/lib/date";
import { Modal } from "./modal";

export function DailyCheckInModal({
  data,
  date,
  onSave,
  onRemove,
  onClose,
}: {
  data: AppData;
  date: string;
  onSave: (value: DailyCheckIn) => string | undefined;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [boundary] = useState(planningBoundary);
  const saved = data.dailyCheckIns?.[date];
  const model = dailyStart(data, boundary);
  const choices = dailyChoices(data, boundary);
  const focuses = new Map<string, DailyCheckIn["focus"]>();
  for (const choice of choices) {
    const taskId = choice.task?.id ?? choice.activity?.taskId;
    const focus: DailyCheckIn["focus"] = taskId
      ? { kind: "task", id: taskId, title: choice.title }
      : { kind: "activity", id: choice.activity!.id, title: choice.title };
    focuses.set(`${focus.kind}:${focus.id}`, focus);
  }
  focuses.set("recovery:recovery", RECOVERY_FOCUS);
  const recommendation = model.recommendation;
  const recommendedTask =
    recommendation?.task?.id ?? recommendation?.activity?.taskId;
  const initialKey = saved
    ? `${saved.focus.kind}:${saved.focus.id}`
    : recommendedTask
      ? `task:${recommendedTask}`
      : recommendation?.activity
        ? `activity:${recommendation.activity.id}`
        : "recovery:recovery";
  const [focusKey, setFocusKey] = useState(
    focuses.has(initialKey) ? initialKey : "",
  );
  const [mood, setMood] = useState<DailyCheckIn["mood"] | "">(
    saved?.mood ?? "",
  );
  const [cue, setCue] = useState<DailyCheckIn["cue"] | "">(
    saved?.cue === "after-booking" && !model.next ? "" : (saved?.cue ?? ""),
  );
  const [error, setError] = useState("");
  const focus = focuses.get(focusKey);
  const draft =
    mood && cue && focus
      ? {
          mood,
          cue,
          focus,
          ...(cue === "after-booking" ? { cueTitle: model.next?.title } : {}),
          updatedAt: new Date().toISOString(),
        }
      : undefined;
  return (
    <Modal
      title="Dagsincheck"
      description="Tre snabba val. Ingen fritext."
      onClose={onClose}
    >
      <form
        className="stack daily-check-in"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft) setError(onSave(draft) ?? "");
        }}
      >
        <fieldset>
          <legend>1. Hur känns det just nu?</legend>
          <div className="check-in-options">
            {Object.entries(CHECK_IN_MOODS).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="check-in-mood"
                  required
                  value={value}
                  checked={mood === value}
                  onChange={() => setMood(value as DailyCheckIn["mood"])}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          2. En liten start på fem minuter
          <select
            required
            value={focusKey}
            onChange={(event) => setFocusKey(event.target.value)}
          >
            <option value="">Välj ett steg</option>
            {[...focuses.entries()].map(([key, value]) => (
              <option key={key} value={key}>
                {value.title}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>3. När börjar du?</legend>
          <div className="check-in-options">
            {Object.entries(CHECK_IN_CUES)
              .filter(([value]) => value !== "after-booking" || model.next)
              .map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="check-in-cue"
                    required
                    value={value}
                    checked={cue === value}
                    onChange={() => setCue(value as DailyCheckIn["cue"])}
                  />
                  {label}
                </label>
              ))}
          </div>
        </fieldset>
        {draft && <p className="check-in-plan">{checkInPlan(draft)}</p>}
        {mood === "heavy" && (
          <p className="help">
            En liten start eller återhämtning får räcka. Du kan också välja Låg
            ork idag i dagsstarten.
          </p>
        )}
        <button className="button primary" disabled={!draft}>
          Spara dagens incheck
        </button>
        {error && <p role="alert">{error}</p>}
        <p className="help">
          Svaren sparas med din plan. Kalendern och bokad tid ändras inte. Du
          kan ändra eller radera svaren.
        </p>
        {saved && (
          <button type="button" className="text-button" onClick={onRemove}>
            Radera dagens incheck
          </button>
        )}
        <details className="check-in-evidence">
          <summary>Varför de här frågorna?</summary>
          <p>
            Ett meningsfullt litet steg och en tydlig startsignal bygger på
            forskning om handlingsplaner. Återhämtning är också ett giltigt val.
            Måendefrågan ger utrymme att stämma av, utan poäng eller diagnoser.
          </p>
          <p>
            Fem minuter och tre frågor är designval. Just den här inchecken är
            inte vetenskapligt utvärderad.
          </p>
          <ul>
            <li>
              <a
                href="https://doi.org/10.1146/annurev-psych-021524-110536"
                target="_blank"
                rel="noopener noreferrer"
              >
                Handlingsplaner: forskningsöversikt, 2025
              </a>
            </li>
            <li>
              <a
                href="https://www.cochrane.org/evidence/CD013305_behavioural-activation-therapy-depression-adults"
                target="_blank"
                rel="noopener noreferrer"
              >
                Meningsfull aktivitet: Cochrane, 2020
              </a>
              <span>
                {" "}
                · stöd från behandling, inte en prövning av denna incheck.
              </span>
            </li>
            <li>
              <a
                href="https://doi.org/10.1371/journal.pone.0272460"
                target="_blank"
                rel="noopener noreferrer"
              >
                Korta pauser: metaanalys, 2022
              </a>
              <span>
                {" "}
                · mindre trötthet; ingen säker generell prestationseffekt.
              </span>
            </li>
          </ul>
        </details>
      </form>
    </Modal>
  );
}
