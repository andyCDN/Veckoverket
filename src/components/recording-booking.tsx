"use client";
import { useState } from "react";
import type { AppData, CareerAction } from "@/lib/types";
import { actionBookingSuggestions } from "@/lib/career-actions";
import { time, planningBoundary } from "@/lib/date";
import { Modal } from "./modal";
export function RecordingBooking({
  data,
  action,
  onSave,
  onClose,
}: {
  data: AppData;
  action: CareerAction;
  onSave: (slot: {
    date: string;
    start: number;
    minutes: number;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(30),
    [slot, setSlot] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const options = actionBookingSuggestions(data, action.id, minutes),
    selected = options.find((v) => `${v.date}:${v.start}` === slot);
  return (
    <Modal
      title="Granska bokning"
      description={action.title}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!selected) return;
          setBusy(true);
          setError("");
          try {
            const boundary = planningBoundary();
            if (
              selected.date < boundary.date ||
              (selected.date === boundary.date &&
                selected.start < boundary.minute)
            )
              throw new Error(
                "Den föreslagna tiden har passerat. Välj en ny tid.",
              );
            await onSave({
              date: selected.date,
              start: selected.start,
              minutes,
            });
            onClose();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Bokningen kunde inte sparas.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          {action.kind === "waiting"
            ? `En bevakning av ${action.owner || "den andra personen"} bokas. Den andras arbete bokas inte som din uppgift.`
            : "Åtgärden och ett kalenderpass sparas tillsammans när du väljer en tid och bekräftar."}
        </p>
        <label>
          Passlängd i minuter
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={minutes}
            onChange={(e) => {
              setMinutes(Number(e.target.value));
              setSlot("");
            }}
          />
        </label>
        <fieldset className="stack">
          <legend>Lediga tider inom dina planeringsregler</legend>
          {options.map((v) => (
            <label className="recording-choice" key={`${v.date}:${v.start}`}>
              <input
                type="radio"
                name="booking-slot"
                value={`${v.date}:${v.start}`}
                checked={slot === `${v.date}:${v.start}`}
                onChange={(e) => setSlot(e.target.value)}
              />
              {v.date} {time(v.start)}–{time(v.end)}
            </label>
          ))}
          {!options.length && (
            <p>
              Ingen ledig tid hittades. Spara åtgärden utan bokning eller frigör
              tid i kalendern.
            </p>
          )}
        </fieldset>
        {selected && (
          <p>
            Förslag: {action.kind === "waiting" ? "Följ upp: " : ""}
            {action.title} · {selected.date} {time(selected.start)}–
            {time(selected.end)}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={!selected || busy}>
          Spara åtgärd och kalenderbokning
        </button>
      </form>
    </Modal>
  );
}
