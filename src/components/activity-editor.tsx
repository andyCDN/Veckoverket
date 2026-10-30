"use client";
import { orderedCategories, categoryLabel } from "@/lib/presentation";
import { useState } from "react";
import { Check, Trash2, LockKeyhole, ShieldCheck, Move } from "lucide-react";
import { Modal } from "./modal";
import { GoogleCategorySelect } from "./google-category-select";
import {
  addDays,
  fullDate,
  monday,
  parseTime,
  time,
  uid,
  weekday,
} from "@/lib/date";
import { validatePlan } from "@/lib/planner";
import { bookingConstraints } from "@/lib/auto-planning";
import { GOOGLE_CATEGORY_ID } from "@/lib/external-calendar";
import {
  AUTO_CATEGORY,
  googleCategoryChoices,
  resolvedCalendarCategory,
} from "@/lib/calendar-categories";
import { googleEventKey } from "@/lib/external-calendar";
import type { Activity, AppData, RecurringActivity } from "@/lib/types";
import { canSwapActivity } from "@/lib/activity-swap";
export function ActivityEditor({
  activity,
  data,
  activities,
  date,
  initialStart,
  followUp,
  onSave,
  onDelete,
  onClose,
  onCategorize,
  onSwap,
}: {
  activity?: Activity;
  data: AppData;
  activities: Activity[];
  date: string;
  initialStart?: number;
  followUp?: { source: Activity; week: string; minutes: number };
  onSave: (
    a: Activity,
    recurrence?: RecurringActivity,
    removeRecurrence?: boolean,
  ) => void;
  onDelete: (id: string, series: boolean) => void;
  onClose: () => void;
  onCategorize: (activity: Activity, categoryId: string) => void;
  onSwap: (firstId: string, secondId: string) => string | undefined;
}) {
  const initialCategory = activity?.external
    ? (googleCategoryChoices(data)[googleEventKey(activity)] ?? AUTO_CATEGORY)
    : activity?.categoryId;
  const [calendarCategory, setCalendarCategory] = useState(
    initialCategory ?? AUTO_CATEGORY,
  );
  const [form, setForm] = useState<Activity>(
    activity ?? {
      id: uid(),
      title: followUp ? `Ombokning: ${followUp.source.title}` : "",
      description: followUp
        ? `Ersätter missat pass ${followUp.source.date} ${time(followUp.source.start)}–${time(followUp.source.end)}.`
        : "",
      categoryId: followUp?.source.categoryId ?? "career",
      date,
      start: initialStart ?? data.settings.start,
      end: Math.min(
        data.settings.end,
        (initialStart ?? data.settings.start) + (followUp?.minutes ?? 60),
      ),
      estimatedMinutes: followUp?.minutes ?? 60,
      blockType: "flexible",
      priority: 3,
      status: "planned",
      source: "manual",
      ...(followUp
        ? {
            followUpOf: { week: followUp.week, activityId: followUp.source.id },
            goalId: followUp.source.goalId,
          }
        : {}),
    },
  );
  const [repeat, setRepeat] = useState(
    activity?.recurrenceId ? "weekly" : "none",
  );
  const [error, setError] = useState("");
  const [swapTarget, setSwapTarget] = useState("");
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
      [
        ...bookingConstraints(activities, data).filter((a) => a.id !== form.id),
        updated,
      ],
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
        followUpOf: _followUp,
        external: _external,
        routine: _routine,
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
  if (activity?.external) {
    const source = activity.external;
    const format = (value: string) =>
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(value));
    return (
      <Modal
        title={activity.title}
        description="Importerad händelse från Google Kalender."
        onClose={onClose}
      >
        <div className="stack">
          <GoogleCategorySelect
            categories={data.categories}
            value={calendarCategory}
            automaticName={categoryLabel(
              data.categories.find(
                (c) =>
                  c.id ===
                  resolvedCalendarCategory(
                    data,
                    activity,
                    googleCategoryChoices(data, {
                      [googleEventKey(activity)]: AUTO_CATEGORY,
                    }),
                  ).categoryId,
              ),
            )}
            onChange={setCalendarCategory}
          />
          <p>
            Kategorin används för färg, filtrering och tidsuppföljning i
            Veckoverket.
          </p>
          <button
            className="button primary"
            disabled={calendarCategory === initialCategory}
            onClick={() => onCategorize(activity, calendarCategory)}
          >
            <Check size={16} />
            Spara kategori
          </button>
          <p>
            {source.allDay
              ? `${fullDate(source.originalStart)} – ${fullDate(addDays(source.originalEnd, -1))}`
              : `${format(source.originalStart)} – ${format(source.originalEnd)}`}
          </p>
          <p>
            {source.busy
              ? "Upptagen tid reserveras i Veckoverket."
              : "Händelsen visas som ledig och blockerar inte planeringen."}
          </p>
          {activity.description && (
            <p className="external-event-description">{activity.description}</p>
          )}
          <p>
            Datum, tid och innehåll ändras i Google Kalender. Hämta sedan veckan
            igen via kalenderkopplingen.
          </p>
          {source.url && (
            <a
              className="button secondary"
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              Öppna i Google Kalender
            </a>
          )}
          <button className="button primary" onClick={onClose}>
            Stäng
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal
      title={
        activity
          ? "Redigera aktivitet"
          : followUp
            ? "Boka om missat pass"
            : "Ny aktivitet"
      }
      description="Ange livsområde, datum och tid för aktiviteten."
      onClose={onClose}
    >
      <form onSubmit={submit} className="stack">
        {followUp && (
          <p className="followup-context">
            {followUp.source.title} / {followUp.source.date}. Ersättningspasset
            kontrolleras mot kalenderns upptagna tider.
          </p>
        )}
        <label>
          Namn
          <input
            autoFocus
            required
            maxLength={100}
            placeholder="Aktivitetens namn"
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
              {orderedCategories(data.categories)
                .filter((c) => c.id !== GOOGLE_CATEGORY_ID)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c)}
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
            <select
              value={repeat}
              disabled={Boolean(activity?.routine)}
              onChange={(e) => setRepeat(e.target.value)}
            >
              <option value="none">
                {activity?.routine
                  ? "Automatiskt varje vecka"
                  : "Bara denna gång"}
              </option>
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
            placeholder="Beskrivning (valfritt)"
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>
        {activity && canSwapActivity(activity, data) && (
          <fieldset className="activity-swap">
            <legend>Byt plats på två pass</legend>
            <p>
              Passen behåller sin längd, kategori och kopplingar. Övriga
              bokningar flyttas inte.
            </p>
            <label>
              Byt plats med
              <select
                value={swapTarget}
                onChange={(e) => setSwapTarget(e.target.value)}
              >
                <option value="">Välj pass</option>
                {activities
                  .filter(
                    (a) => a.id !== activity.id && canSwapActivity(a, data),
                  )
                  .sort(
                    (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.date} {time(a.start)}–{time(a.end)} · {a.title}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={
                !swapTarget ||
                JSON.stringify(form) !== JSON.stringify(activity) ||
                repeat !== (activity.recurrenceId ? "weekly" : "none")
              }
              onClick={() => {
                const issue = onSwap(activity.id, swapTarget);
                if (issue) setError(issue);
              }}
            >
              Byt plats
            </button>
            {JSON.stringify(form) !== JSON.stringify(activity) && (
              <p>Spara ändringarna innan du byter plats.</p>
            )}
          </fieldset>
        )}
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
