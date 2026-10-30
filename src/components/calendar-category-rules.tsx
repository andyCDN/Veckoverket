"use client";
import { orderedCategories, categoryLabel } from "@/lib/presentation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { AppData, CalendarCategoryRule } from "@/lib/types";
import { uid } from "@/lib/date";
import { GOOGLE_CATEGORY_ID } from "@/lib/external-calendar";
import { applyCalendarCategoryRules } from "@/lib/calendar-categories";

export function CalendarCategoryRules({
  data,
  onChange,
  onApply,
}: {
  data: AppData;
  onChange: (rules: CalendarCategoryRule[]) => void;
  onApply: () => void;
}) {
  const rules = data.calendarCategoryRules ?? [];
  const [editing, setEditing] = useState<string | null>(null),
    [contains, setContains] = useState(""),
    [category, setCategory] = useState(
      data.categories.find((c) => c.id !== GOOGLE_CATEGORY_ID)?.id ?? "",
    ),
    [calendar, setCalendar] = useState("");
  const calendars = [
    ...new Set([
      ...(data.googleCalendar?.calendarIds ?? []),
      ...(data.icalCalendar ? [data.icalCalendar.calendarId] : []),
      ...rules.flatMap((r) => (r.calendarId ? [r.calendarId] : [])),
    ]),
  ];
  const preview = applyCalendarCategoryRules(data);
  function reset() {
    setEditing(null);
    setContains("");
    setCalendar("");
  }
  function move(index: number, direction: number) {
    const next = [...rules];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    onChange(next);
  }
  return (
    <section
      className="category-rules-panel settings-section"
      id="calendar-category-rules"
      aria-labelledby="category-rules-title"
    >
      <h3 id="category-rules-title">Automatisk kategorisering</h3>
      <p>
        Första aktiva regeln som matchar rubriken används vid import och
        uppdatering. Stora och små bokstäver behandlas lika. Manuella
        kategorival behålls.
      </p>
      <form
        className="category-rule-form"
        onSubmit={(event) => {
          event.preventDefault();
          const next: CalendarCategoryRule = {
            id: editing ?? uid(),
            contains: contains.trim(),
            categoryId: category,
            enabled: editing
              ? (rules.find((r) => r.id === editing)?.enabled ?? true)
              : true,
            ...(calendar ? { calendarId: calendar } : {}),
          };
          onChange(
            editing
              ? rules.map((r) => (r.id === editing ? next : r))
              : [...rules, next],
          );
          reset();
        }}
      >
        <label>
          Rubriken innehåller
          <input
            required
            value={contains}
            maxLength={120}
            onChange={(event) => setContains(event.target.value)}
            placeholder="Till exempel Intervju eller Kurs"
          />
        </label>
        <label>
          Regelns kategori
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
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
          Gäller kalender
          <select
            value={calendar}
            onChange={(event) => setCalendar(event.target.value)}
          >
            <option value="">Alla anslutna kalendrar</option>
            {calendars.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <div className="data-actions">
          <button
            className="button secondary"
            type="submit"
            disabled={!contains.trim() || (!editing && rules.length >= 100)}
          >
            <Plus size={16} />
            {editing ? "Spara kategoriregel" : "Lägg till kategoriregel"}
          </button>
          {editing && (
            <button className="text-button" type="button" onClick={reset}>
              Avbryt redigering
            </button>
          )}
        </div>
      </form>
      <ol className="category-rule-list">
        {rules.map((rule, index) => (
          <li key={rule.id} className={rule.enabled ? "" : "is-paused"}>
            <label className="google-calendar-choice">
              <input
                type="checkbox"
                checked={rule.enabled}
                aria-label={`Aktivera regel: ${rule.contains}`}
                onChange={(event) =>
                  onChange(
                    rules.map((r) =>
                      r.id === rule.id
                        ? { ...r, enabled: event.target.checked }
                        : r,
                    ),
                  )
                }
              />
              <span>
                <strong>
                  {rule.contains} →{" "}
                  {data.categories.find((c) => c.id === rule.categoryId)?.name}
                </strong>
                <small>
                  {rule.calendarId || "Alla kalendrar"}
                  {!rule.enabled ? " · pausad" : ""}
                </small>
              </span>
            </label>
            <div className="rule-actions">
              <button
                className="icon-button"
                type="button"
                disabled={index === 0}
                aria-label={`Flytta upp regel: ${rule.contains}`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                disabled={index === rules.length - 1}
                aria-label={`Flytta ned regel: ${rule.contains}`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Redigera regel: ${rule.contains}`}
                onClick={() => {
                  setEditing(rule.id);
                  setContains(rule.contains);
                  setCategory(rule.categoryId);
                  setCalendar(rule.calendarId ?? "");
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Ta bort regel: ${rule.contains}`}
                onClick={() => {
                  onChange(rules.filter((r) => r.id !== rule.id));
                  if (editing === rule.id) reset();
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!rules.length && <p className="muted">Inga kategoriregler sparade.</p>}
      <p className="help">
        Regler sparas direkt. Nya regler används vid nästa kalenderimport. Välj
        Automatisk på en bokning för att återgå från ett manuellt kategorival.
      </p>
      <button
        className="button secondary"
        disabled={preview.count === 0}
        onClick={onApply}
      >
        Tillämpa regler på sparade bokningar ({preview.count})
      </button>
    </section>
  );
}
