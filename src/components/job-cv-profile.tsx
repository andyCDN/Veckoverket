"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CV_TEXT_LIMIT } from "@/lib/job-cv-match";
import {
  appendCvDocument,
  readCvFile,
  validateCvFiles,
} from "@/lib/cv-file-import";
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
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const [state, setState] = useState({
    text: profile?.text ?? "",
    error: "",
    reading: false,
    progress: "",
    files: [] as {
      name: string;
      status: "added" | "duplicate" | "error";
      detail: string;
    }[],
  });
  const { text, error, reading, progress, files } = state;
  const readFiles = async (selected: File[]) => {
    try {
      validateCvFiles(selected);
    } catch (error) {
      setState((current) => ({
        ...current,
        error:
          error instanceof Error ? error.message : "Filerna kunde inte läsas.",
      }));
      return;
    }
    const token = ++request.current;
    setState((current) => ({
      ...current,
      error: "",
      files: [],
      reading: true,
    }));
    for (let index = 0; index < selected.length; index++) {
      const file = selected[index];
      if (request.current !== token) return;
      setState((current) => ({
        ...current,
        progress: `Läser ${index + 1} av ${selected.length}: ${file.name}`,
      }));
      try {
        const document = await readCvFile(file);
        if (request.current !== token) return;
        setState((current) => {
          try {
            const result = appendCvDocument(current.text, document);
            const counts =
              document.format === "text"
                ? "Textfil"
                : `${document.format.toUpperCase()} · ${document.slides} ${document.slides === 1 ? "bild" : "bilder"} med text${document.hiddenSlides ? ` · ${document.hiddenSlides} ${document.hiddenSlides === 1 ? "dold bild överhoppad" : "dolda bilder överhoppade"}` : ""}${document.emptySlides ? ` · ${document.emptySlides} ${document.emptySlides === 1 ? "bild saknar" : "bilder saknar"} läsbar text` : ""}`;
            return {
              ...current,
              text: result.text,
              files: [
                ...current.files,
                {
                  name: file.name,
                  status: result.added ? "added" : "duplicate",
                  detail: result.added
                    ? counts
                    : "Samma text finns redan i underlaget.",
                },
              ],
            };
          } catch (error) {
            return {
              ...current,
              files: [
                ...current.files,
                {
                  name: file.name,
                  status: "error",
                  detail:
                    error instanceof Error
                      ? error.message
                      : "Texten kunde inte läggas till.",
                },
              ],
            };
          }
        });
      } catch (error) {
        if (request.current !== token) return;
        setState((current) => ({
          ...current,
          files: [
            ...current.files,
            {
              name: file.name,
              status: "error",
              detail:
                error instanceof Error
                  ? error.message
                  : "Filen kunde inte läsas.",
            },
          ],
        }));
      }
    }
    if (request.current === token)
      setState((current) => ({ ...current, reading: false, progress: "" }));
  };
  return (
    <Modal title="CV för jobbmatchning" onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (reading) return;
          const error = onSave(text) ?? "";
          if (error) setState((current) => ({ ...current, error }));
        }}
      >
        <p>
          Klistra in ditt CV eller läs in en eller flera PowerPoint-filer.
          Relevanta utdrag föreslås vid annonsens krav. Du bekräftar vilka
          utdrag som faktiskt styrker kraven.
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
          onChange={(event) => {
            const text = event.target.value;
            setState((current) => ({ ...current, text }));
          }}
        />
        <label>
          Läs in filer (PowerPoint eller text)
          <input
            type="file"
            multiple
            disabled={reading}
            accept=".ppt,.pptx,.txt,.md,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) void readFiles(files);
            }}
          />
        </label>
        <p className="help">
          Välj högst 10 filer, upp till 20 MB per fil och 60 MB tillsammans. Ny
          text läggs till i underlaget och sparas när du väljer Spara
          CV-underlag. Dolda presentationsbilder och talaranteckningar tas inte
          med. Text som ligger i foton eller skärmbilder behöver kompletteras
          manuellt.
        </p>
        {reading && <p role="status">{progress || "Läser filer…"}</p>}
        {files.length > 0 && (
          <section className="cv-import-results" aria-label="Inlästa filer">
            <p role="status">
              {reading
                ? "Inläsning pågår."
                : `${files.filter((file) => file.status === "added").length} ${files.filter((file) => file.status === "added").length === 1 ? "fil tillagd" : "filer tillagda"}${files.some((file) => file.status === "error") ? ` · ${files.filter((file) => file.status === "error").length} kunde inte läsas` : ""}. Kontrollera texten före sparning.`}
            </p>
            <ul>
              {files.map((file, index) => (
                <li key={`${index}:${file.name}`}>
                  <strong>{file.name}</strong> ·{" "}
                  {file.status === "added"
                    ? "Tillagd"
                    : file.status === "duplicate"
                      ? "Redan inläst"
                      : "Kunde inte läsas"}
                  <p>{file.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        {profile && (
          <p className="help">
            Om du ändrar CV-texten behöver tidigare kravbedömningar kontrolleras
            igen.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="career-actions">
          <button className="button primary" disabled={reading}>
            Spara CV-underlag
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Avbryt
          </button>
          {profile && (
            <button
              type="button"
              className="text-button"
              disabled={reading}
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
