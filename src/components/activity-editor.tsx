"use client";
import { useState } from "react";
import { Check, Trash2, LockKeyhole, ShieldCheck, Move } from "lucide-react";
import { Modal } from "./modal";
import { addDays, monday, parseTime, time, uid, weekday } from "@/lib/date";
import { validatePlan } from "@/lib/planner";
import type { Activity, AppData, RecurringActivity } from "@/lib/types";
export function ActivityEditor({
  activity,
  data,
  activities,
  date,
  initialStart,
  onSave,
  onDelete,
  onClose,
}: {
  activity?: Activity;
  data: AppData;
  activities: Activity[];
  date: string;
  initialStart?: number;
  onSave: (
    a: Activity,
    recurrence?: RecurringActivity,
    removeRecurrence?: boolean,
  ) => void;
  onDelete: (id: string, series: boolean) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Activity>(
    activity ?? {
      id: uid(),
      title: "",
      description: "",
      categoryId: "career",
      date,
      start: initialStart ?? data.settings.start,
      end: Math.min(
        data.settings.end,
        (initialStart ?? data.settings.start) + 60,
      ),
      estimatedMinutes: 60,
      blockType: "flexible",
      priority: 3,
      status: "planned",
      source: "manual",
    },
  );
  const [repeat, setRepeat] = useState(
    activity?.recurrenceId ? "weekly" : "none",
  );
  const [error, setError] = useState("");
  const patch = (v: Partial<Activity>) => setForm((f) => ({ ...f, ...v }));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (monday(form.date) !== monday(date)) {
      setError("Välj ett datum inom den visade veckan.");
      return;
    }
    if (!form.title.trim() || form.end <= form.start) {
      setError("Ange ett namn och en sluttid efter starttiden.");
      return;
    }
    const updated = {
      ...form,
      title: form.title.trim(),
      source: "manual" as const,
    };
    const issues = validatePlan(
      [...activities.filter((a) => a.id !== form.id), updated],
      data.settings,
    );
    const conflict = issues.find((c) => c.id.includes(form.id));
    if (conflict) {
      setError(conflict.message + " " + conflict.suggestion);
      return;
    }
    if (
      form.blockType === "protected" &&
      form.categoryId === "music" &&
      (form.start !== data.settings.start ||
        form.end !== data.settings.lunchStart)
    ) {
      setError(
        "Skyddad musikproduktion behöver en hel förmiddag fram till lunch.",
      );
      return;
    }
    let recurring: RecurringActivity | undefined;
    if (repeat !== "none") {
      const {
        id: _id,
        date: _date,
        status: _status,
        source: _source,
        recurrenceId: _r,
        ...values
      } = updated;
      recurring = {
        ...values,
        id: form.recurrenceId ?? uid(),
        weekdays:
          repeat === "weekdays" ? [0, 1, 2, 3, 4] : [weekday(form.date)],
        startsOn: form.date,
      };
      updated.recurrenceId = recurring.id;
    } else delete updated.recurrenceId;
    onSave(updated, recurring, Boolean(form.recurrenceId && repeat === "none"));
  }
  return (
    <Modal
      title={activity ? "Redigera aktivitet" : "En ny bit av veckan"}
      description="Ge det som är viktigt en egen plats."
      onClose={onClose}
    >
      <form onSubmit={submit} className="stack">
        <label>
          Namn
          <input
            autoFocus
            required
            maxLength={100}
            placeholder="Vad vill du ge tid till?"
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
        <div className="form-row">
          <label>
            Livsområde
            <select
              value={form.categoryId}
              onChange={(e) => patch({ categoryId: e.target.value })}
            >
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Datum
            <input
              type="date"
              required
              value={form.date}
              min={monday(date)}
              max={addDays(monday(date), 6)}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Start
            <input
              type="time"
              required
              step={300}
              value={time(form.start)}
              onChange={(e) => patch({ start: parseTime(e.target.value) })}
            />
          </label>
          <label>
            Slut
            <input
              type="time"
              required
              step={300}
              value={time(form.end)}
              onChange={(e) => patch({ end: parseTime(e.target.value) })}
            />
          </label>
          <label>
            Uppskattning, min
            <input
              type="number"
              min={5}
              max={1440}
              step={5}
              value={form.estimatedMinutes}
              onChange={(e) =>
                patch({ estimatedMinutes: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <fieldset>
          <legend>Hur ska tiden behandlas?</legend>
          <div className="block-options">
            {(
              [
                { value: "flexible", label: "Flexibel", icon: Move },
                { value: "protected", label: "Skyddad", icon: ShieldCheck },
                { value: "locked", label: "Låst", icon: LockKeyhole },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={form.blockType === value ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="blockType"
                  value={value}
                  checked={form.blockType === value}
                  onChange={() => patch({ blockType: value })}
                />
                <Icon size={17} />
                {label}
              </label>
            ))}
          </div>
          <p className="help">
            Låst tid flyttas aldrig automatiskt. Skyddad tid hålls samman.
          </p>
        </fieldset>
        <div className="form-row">
          <label>
            Återkommer
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="none">Bara denna gång</option>
              <option value="weekly">Varje vecka, samma veckodag</option>
              <option value="weekdays">Varje vardag</option>
            </select>
          </label>
          <label>
            Prioritet
            <select
              value={form.priority}
              onChange={(e) => patch({ priority: Number(e.target.value) })}
            >
              <option value={5}>Mycket viktig</option>
              <option value={4}>Viktig</option>
              <option value={3}>Normal</option>
              <option value={2}>Lägre</option>
              <option value={1}>När tid finns</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Koppla till mål
            <select
              value={form.goalId ?? ""}
              onChange={(e) => patch({ goalId: e.target.value || undefined })}
            >
              <option value="">Inget mål</option>
              {data.goals
                .filter(
                  (g) => g.horizon === "long" || g.week === monday(form.date),
                )
                .map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) =>
                patch({ status: e.target.value as Activity["status"] })
              }
            >
              <option value="planned">Planerad</option>
              <option value="done">Genomförd</option>
              <option value="skipped">Blev inte av</option>
            </select>
          </label>
        </div>
        <label>
          Beskrivning
          <textarea
            rows={2}
            maxLength={2000}
            placeholder="En liten anteckning, om du vill."
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {activity && (
            <div className="delete-actions">
              <button
                type="button"
                className="button danger ghost"
                onClick={() => onDelete(activity.id, false)}
              >
                <Trash2 size={16} />
                Ta bort
              </button>
              {activity.recurrenceId && (
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => onDelete(activity.id, true)}
                >
                  Ta bort serien
                </button>
              )}
            </div>
          )}
          <button type="submit" className="button primary">
            <Check size={17} />
            Spara aktivitet
          </button>
        </div>
      </form>
    </Modal>
  );
}
