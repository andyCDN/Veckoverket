"use client";
import { time } from "@/lib/date";
import { actionWorkflow } from "@/lib/action-workflow";
import type { TrackedAction } from "@/lib/career-actions";
import type { Activity, AppData } from "@/lib/types";

export function ActionKindSelector({
  value,
  onChange,
}: {
  value?: "task" | "waiting";
  onChange: (kind: "task" | "waiting") => void;
}) {
  return (
    <label>
      Typ av nästa steg
      <select
        value={value ?? "task"}
        onChange={(event) => onChange(event.target.value as "task" | "waiting")}
      >
        <option value="task">Egen uppgift</option>
        <option value="waiting">Väntar på annan</option>
      </select>
    </label>
  );
}

export function ActionControl({
  data,
  action,
  onEdit,
  onBook,
  onOpen,
  onComplete,
  editLabel = "Redigera nästa steg",
}: {
  data: AppData;
  action: TrackedAction;
  onEdit: () => void;
  onBook: () => void;
  onOpen: (activity: Activity) => void;
  onComplete: () => void;
  editLabel?: string;
}) {
  const state = actionWorkflow(data, action);
  return (
    <div
      className={`action-control ${state.waiting ? "is-waiting" : "is-task"}`}
    >
      <div className="action-control-meta">
        <span>{state.waiting ? "Väntar på annan" : "Egen uppgift"}</span>
        <strong>{state.label}</strong>
      </div>
      <p>
        {state.waiting ? "Bevaka från" : "Klart senast"}:{" "}
        {action.date || "Datum saknas"} ·{" "}
        {state.waiting ? "Väntar på" : "Ansvarig"}:{" "}
        {action.owner || "Ej fastställt"}
      </p>
      {state.booking && (
        <p className="action-booking">
          {state.booking.date} · {time(state.booking.start)}–
          {time(state.booking.end)} · {state.booking.title}
        </p>
      )}
      {action.status === "open" && (
        <div className="action-control-buttons">
          <button
            className="button primary"
            onClick={() =>
              state.booking
                ? onOpen(state.booking)
                : state.stage === "confirm"
                  ? onComplete()
                  : state.stage === "undated" || state.stage === "reschedule"
                    ? onEdit()
                    : onBook()
            }
          >
            {state.primary}
          </button>
          <button className="text-button" onClick={onEdit}>
            {editLabel}
          </button>
          {state.stage !== "confirm" && (
            <button className="text-button" onClick={onComplete}>
              {state.waiting ? "Avsluta bevakning" : "Markera nästa steg klart"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
