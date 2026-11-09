"use client";
import { useState } from "react";
import type { AppData } from "@/lib/types";
import { mondayGoalDrafts, type MondayGoalDraft } from "@/lib/monday-goals";
import { orderedCategories, categoryLabel } from "@/lib/presentation";
import { GOOGLE_CATEGORY_ID } from "@/lib/external-calendar";
export function MondayGoals({
  data,
  text,
  onCreate,
  step = 0,
  onNext,
}: {
  data: AppData;
  text: string;
  onCreate: (drafts: MondayGoalDraft[]) => number;
  step?: number;
  onNext?: () => void;
}) {
  const [drafts, setDrafts] = useState<MondayGoalDraft[]>([]);
  const [message, setMessage] = useState("");
  const categories = orderedCategories(data.categories).filter(
    (c) => c.id !== GOOGLE_CATEGORY_ID,
  );
  const update = (index: number, patch: Partial<MondayGoalDraft>) =>
    setDrafts((current) =>
      current.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  return (
    <section
      className="stack routine-planning"
      aria-label="Skapa veckomål från måndagschecken"
    >
      <h3>{step === 0 ? "Vad vill du uppnå?" : "Vad behöver göras?"}</h3>
      {step === 0 && (
        <>
          <p>
            Skriv ett önskat resultat per rad i startplanen. Du kan ange
            uppgifter efter | och skilja dem med semikolon, till exempel: Två
            ansökningar skickade | Anpassa CV; Skicka ansökningar.
          </p>
          <button
            className="button secondary"
            disabled={!text.trim() || !categories.length}
            onClick={() => {
              setDrafts(
                mondayGoalDrafts(
                  text,
                  categories.find((c) => c.id === "career")?.id ??
                    categories[0].id,
                ),
              );
              setMessage("");
            }}
          >
            Ta fram veckomål från startplanen
          </button>
        </>
      )}
      {drafts.length > 0 && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 0 && onNext) {
              onNext();
              return;
            }
            const count = onCreate(drafts);
            setMessage(
              count
                ? `${count} veckomål har skapats med uppgifter. Fortsätt till Boka tid för att planera dem.`
                : "Inga nya mål skapades. Målen finns redan i veckan eller är inte valda.",
            );
            if (count) setDrafts([]);
          }}
        >
          <p>
            Granska förslagen. Varje mål behöver minst en konkret uppgift.
            Befintliga mål ändras inte.
          </p>
          {drafts.map((draft, i) => (
            <fieldset className="stack routine-goal" key={i}>
              <legend>Målförslag {i + 1}</legend>
              <label className="routine-task">
                <input
                  type="checkbox"
                  checked={draft.selected}
                  onChange={(e) => update(i, { selected: e.target.checked })}
                />
                Skapa detta mål
              </label>
              <label>
                Veckomål
                <input
                  required={draft.selected}
                  maxLength={120}
                  value={draft.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                />
              </label>
              <label>
                Område
                <select
                  value={draft.categoryId}
                  onChange={(e) => update(i, { categoryId: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              {step === 1 && (
                <label>
                  Uppgifter – en per rad
                  <textarea
                    required={draft.selected}
                    rows={3}
                    value={draft.tasks}
                    onChange={(e) => update(i, { tasks: e.target.value })}
                  />
                </label>
              )}
            </fieldset>
          ))}
          <button
            className="button primary"
            disabled={!drafts.some((d) => d.selected)}
          >
            {step === 0 && onNext
              ? "Fortsätt med uppgifter"
              : "Skapa valda veckomål"}
          </button>
        </form>
      )}
      {step === 1 && !drafts.length && !message && (
        <p>
          Använd veckans befintliga uppgifter eller gå tillbaka och ta fram nya
          målförslag.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
