"use client";
import { useEffect, useRef, useState } from "react";
import type { JobApplication } from "@/lib/types";
import { validateApplicationMaterials } from "@/lib/application-materials";
import {
  detailsFromPastedText,
  detailsNotes,
} from "@/lib/linkedin-details-client";
import { jobAdvertisementUrl, readJobAdvertisement } from "@/lib/job-ad-reader";
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
      linkOnly = !/\s/.test(raw) && Boolean(jobAdvertisementUrl(raw)),
      url =
        jobAdvertisementUrl(
          linkOnly ? raw : (raw.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? ""),
        ) ?? "";
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setMessage("");
    setError("");
    let details = detailsFromPastedText(linkOnly ? "" : raw);
    if (linkOnly && !manual) {
      try {
        details = await readJobAdvertisement(url, controller.signal);
        if (!details.role || !details.organization || !details.description)
          setMessage(
            "Annonsen kunde bara läsas delvis. Komplettera uppgifterna som saknas nedan.",
          );
      } catch (e) {
        if (!controller.signal.aborted)
          setMessage(
            e instanceof Error
              ? e.message
              : "Annonsen kunde inte läsas. Fyll i uppgifterna nedan.",
          );
      }
    }
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
        url,
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
            Länkar från Platsbanken och LinkedIn kan läsas automatiskt. Du kan
            också klistra in annonstexten. Granska titel, arbetsgivare och
            annonstext innan du sparar.
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
              jobAdvertisementUrl(value)?.replace(/#.*$/, "");
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
