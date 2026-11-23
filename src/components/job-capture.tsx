"use client";
import { useEffect, useRef, useState } from "react";
import type { JobApplication } from "@/lib/types";
import {
  documentUrl,
  validateApplicationMaterials,
} from "@/lib/application-materials";
import {
  detailsFromPastedText,
  detailsNotes,
  loadJobDetails,
} from "@/lib/linkedin-details-client";
import { linkedInJobUrl } from "@/lib/linkedin-import";
import { isLocalDate } from "@/lib/google-time";
import { uid } from "@/lib/date";
import { Modal } from "./modal";

export function JobCapture({
  applications,
  onSave,
  onClose,
}: {
  applications: JobApplication[];
  onSave: (application: JobApplication) => string | undefined;
  onClose: () => void;
}) {
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState<JobApplication | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const review = async (manual = false) => {
    const raw = source.trim(),
      linkOnly = !/\s/.test(raw) && Boolean(documentUrl(raw)),
      url =
        documentUrl(
          linkOnly ? raw : (raw.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? ""),
        ) ?? "";
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setMessage("");
    setError("");
    let details = detailsFromPastedText(linkOnly ? "" : raw);
    if (linkOnly && linkedInJobUrl(url) && !manual) {
      try {
        details = await loadJobDetails(url, controller.signal);
      } catch (e) {
        if (!controller.signal.aborted)
          setMessage(
            e instanceof Error
              ? e.message
              : "Annonsen kunde inte läsas. Fyll i uppgifterna nedan.",
          );
      }
    } else if (linkOnly && !manual)
      setMessage(
        "Länken sparas med jobbet. Fyll i tjänst och arbetsgivare, eller gå tillbaka och klistra in annonstexten för att läsa fler uppgifter.",
      );
    if (controller.signal.aborted) return;
    setDraft({
      id: uid(),
      role: details.role.slice(0, 200),
      organization: details.organization.slice(0, 200),
      status: "draft",
      deadline: isLocalDate(details.deadline) ? details.deadline : "",
      nextAction: "Förbered ansökan",
      nextActionKind: "task",
      nextActionOwner: "Jag",
      followUpDate: "",
      notes: detailsNotes(details).slice(0, 4000),
      advertisement: {
        url: linkedInJobUrl(url) ?? url,
        text: (details.description || (linkOnly ? "" : raw)).slice(0, 60000),
      },
    });
    setBusy(false);
  };
  return (
    <Modal
      title="Lägg till jobb"
      description="Börja med annonsen. Granska uppgifterna innan du sparar."
      onClose={onClose}
    >
      {!draft ? (
        <div className="stack">
          <label>
            Länk eller annonstext
            <textarea
              rows={8}
              maxLength={60000}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Klistra in en jobblänk eller annonsens text"
              disabled={busy}
            />
          </label>
          <p className="help">
            LinkedIn-länkar kan läsas automatiskt. Annonstext tolkas lokalt.
            Uppgifter som saknas fyller du i själv.
          </p>
          <button
            className="button primary"
            disabled={busy || !source.trim()}
            onClick={() => {
              void review();
            }}
          >
            {busy ? "Läser annonsen…" : "Läs uppgifter"}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              void review(true);
            }}
          >
            Fyll i själv
          </button>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              validateApplicationMaterials(draft);
              if (draft.deadline && !isLocalDate(draft.deadline))
                throw new Error("Kontrollera sista ansökningsdagen.");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Kontrollera uppgifterna.",
              );
              return;
            }
            const key = (value: string) =>
              linkedInJobUrl(value) ?? documentUrl(value)?.replace(/#.*$/, "");
            if (
              draft.advertisement?.url &&
              applications.some(
                (a) =>
                  a.advertisement?.url &&
                  key(a.advertisement.url) === key(draft.advertisement!.url),
              )
            ) {
              setError(
                "Det här jobbet finns redan i din lista. Sök efter tjänsten innan du lägger till det igen.",
              );
              return;
            }
            if (!draft.role.trim() || !draft.organization.trim()) {
              setError("Fyll i tjänst och arbetsgivare.");
              return;
            }
            setError(
              onSave({
                ...draft,
                role: draft.role.trim(),
                organization: draft.organization.trim(),
              }) ?? "",
            );
          }}
        >
          <h3>Granska jobbet</h3>
          {message && <p role="status">{message}</p>}
          <label>
            Tjänst
            <input
              required
              maxLength={200}
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            />
          </label>
          <label>
            Arbetsgivare
            <input
              required
              maxLength={200}
              value={draft.organization}
              onChange={(e) =>
                setDraft({ ...draft, organization: e.target.value })
              }
            />
          </label>
          <label>
            Sista ansökningsdag (valfritt)
            <input
              type="date"
              value={draft.deadline}
              onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
            />
          </label>
          <details>
            <summary>Annons och anteckningar</summary>
            <div className="stack">
              <label>
                Annonslänk
                <input
                  type="url"
                  maxLength={2048}
                  value={draft.advertisement?.url ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      advertisement: {
                        url: e.target.value,
                        text: draft.advertisement?.text ?? "",
                      },
                    })
                  }
                />
              </label>
              <label>
                Annonstext
                <textarea
                  rows={6}
                  maxLength={60000}
                  value={draft.advertisement?.text ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      advertisement: {
                        url: draft.advertisement?.url ?? "",
                        text: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                Anteckningar
                <textarea
                  maxLength={4000}
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                />
              </label>
            </div>
          </details>
          <p className="help">
            Jobbet sparas som utkast. Du fortsätter med ansökan och planerar
            arbetstid från jobbets detaljvy.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="career-actions">
            <button className="button primary">Spara jobb</button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              Tillbaka till annonsen
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
