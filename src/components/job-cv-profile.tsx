"use client";
import { useId, useState } from "react";
import { CV_TEXT_LIMIT } from "@/lib/job-cv-match";
import type { JobCvProfile } from "@/lib/types";
import { Modal } from "./modal";

export function JobCvProfileEditor({
  profile,
  onClose,
  onSave,
  onRemove,
}: {
  profile?: JobCvProfile;
  onClose: () => void;
  onSave: (text: string) => string | undefined;
  onRemove: () => void;
}) {
  const textId = useId();
  const [text, setText] = useState(profile?.text ?? ""),
    [error, setError] = useState("");
  return (
    <Modal title="CV för jobbmatchning" onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          setError(onSave(text) ?? "");
        }}
      >
        <p>
          Klistra in texten från ditt grund-CV. Relevanta utdrag föreslås vid
          annonsens krav. Du bekräftar vilka utdrag som faktiskt styrker kraven.
        </p>
        <p className="help">
          Underlaget sparas i din privata arbetsyta tillsammans med
          ansökningarna. Jämförelsen görs på din enhet. Länken till CV-agenten
          ger inte tillgång till dokumenten där.
        </p>
        <label htmlFor={textId}>Klistra in CV-text</label>
        <textarea
          id={textId}
          rows={12}
          minLength={40}
          maxLength={CV_TEXT_LIMIT}
          value={text}
          required
          onChange={(event) => setText(event.target.value)}
        />
        <label>
          Läs in textfil (valfritt)
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (
                file.size > CV_TEXT_LIMIT * 4 ||
                !/\.(?:txt|md)$/iu.test(file.name)
              ) {
                setError(
                  "Välj en textfil (.txt eller .md) på högst 240 kB. Kopiera texten från PDF eller Word och klistra in den ovan.",
                );
                return;
              }
              try {
                const content = await file.text();
                if (content.length > CV_TEXT_LIMIT)
                  throw new Error(
                    "CV-texten får innehålla högst 60 000 tecken.",
                  );
                setText(content);
                setError("");
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Textfilen kunde inte läsas.",
                );
              }
            }}
          />
        </label>
        {profile && (
          <p className="help">
            Om du ändrar CV-texten behöver tidigare kravbedömningar kontrolleras
            igen.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="career-actions">
          <button className="button primary">Spara CV-underlag</button>
          <button type="button" className="button secondary" onClick={onClose}>
            Avbryt
          </button>
          {profile && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (
                  window.confirm(
                    "Ta bort CV-underlaget och dina kravbedömningar? Ansökningar och dokumentlänkar finns kvar.",
                  )
                )
                  onRemove();
              }}
            >
              Ta bort CV-underlaget
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
