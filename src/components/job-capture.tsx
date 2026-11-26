"use client";
import { useEffect, useRef, useState } from "react";
import type { JobApplication } from "@/lib/types";
import { validateApplicationMaterials } from "@/lib/application-materials";
import {
  detailsFromPastedText,
  detailsNotes,
} from "@/lib/linkedin-details-client";
import { jobAdvertisementUrl, readJobAdvertisement } from "@/lib/job-ad-reader";
import type { JobAdDetails } from "@/lib/job-ad-reader";
import { jobMatches } from "@/lib/job-identity";
import { isLocalDate } from "@/lib/google-time";
import { uid } from "@/lib/date";
import { APPLICATION_STATUSES } from "@/lib/applications";
import { Modal } from "./modal";

export function JobCapture({
  applications,
  onSave,
  onClose,
  initialJob,
  onMerge,
  onOpenExisting,
}: {
  applications: JobApplication[];
  onSave: (application: JobApplication) => string | undefined;
  onClose: () => void;
  initialJob?: JobApplication;
  onMerge?: (id: string, application: JobApplication) => string | undefined;
  onOpenExisting?: (id: string) => void;
}) {
  const [source, setSource] = useState(initialJob?.advertisement?.url ?? "");
  const [draft, setDraft] = useState<JobApplication | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const [separate, setSeparate] = useState(false);
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
    let details: JobAdDetails = detailsFromPastedText(linkOnly ? "" : raw);
    if (linkOnly && !manual && !initialJob?.advertisement?.text.trim()) {
      try {
        details = await readJobAdvertisement(
          url,
          controller.signal,
          initialJob,
        );
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
      role: (details.role || initialJob?.role || "").slice(0, 200),
      organization: (
        details.organization ||
        initialJob?.organization ||
        ""
      ).slice(0, 200),
      status: "draft",
      deadline: isLocalDate(details.deadline)
        ? details.deadline
        : (initialJob?.deadline ?? ""),
      nextAction: "Förbered ansökan",
      nextActionKind: "task",
      nextActionOwner: "Jag",
      followUpDate: "",
      notes: [initialJob?.notes, detailsNotes(details)]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000),
      advertisement: {
        ...initialJob?.advertisement,
        url,
        text: (
          details.description ||
          initialJob?.advertisement?.text ||
          (linkOnly ? "" : raw)
        ).slice(0, 60000),
        ...(details.additionalUrls
          ? { additionalUrls: details.additionalUrls }
          : {}),
        ...(details.applicationUrl || initialJob?.advertisement?.applicationUrl
          ? {
              applicationUrl:
                details.applicationUrl ||
                initialJob?.advertisement?.applicationUrl,
            }
          : {}),
      },
    });
    setBusy(false);
  };
  useEffect(() => {
    if (initialJob) void review();
    return () => request.current?.abort();
    // The seed is fixed for this capture; later edits belong to the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const matches = draft ? jobMatches(draft, applications) : [];
  const exact = matches.some((match) => match.reason === "url");
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
            if (exact || (matches.length && !separate)) {
              setError(
                exact
                  ? "Det här jobbet finns redan i din lista. Koppla underlaget till jobbet eller öppna den befintliga ansökan."
                  : "Granska den möjliga dubbletten eller bekräfta att detta är en annan tjänst.",
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
          {Boolean(draft.advertisement?.additionalUrls?.length) && (
            <p className="help">
              Ursprungslänken och ytterligare annonskällor sparas tillsammans.
              Kontrollera att underlaget gäller rätt tjänst.
            </p>
          )}
          <label>
            Tjänst
            <input
              required
              maxLength={200}
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            />
          </label>
          {matches.length > 0 && (
            <section
              className="application-duplicate"
              aria-label="Möjliga dubbletter"
            >
              <h3>
                {exact
                  ? "Jobbet finns redan"
                  : "Möjlig dubblett mellan annonskällor"}
              </h3>
              {matches.map(({ job, reason }) => (
                <div className="stack" key={job.id}>
                  <p>
                    <strong>
                      {job.role} · {job.organization}
                    </strong>
                    <br />
                    {reason === "url"
                      ? "Samma annonslänk"
                      : "Samma tjänst och arbetsgivare"}
                  </p>
                  <p>
                    Status: {APPLICATION_STATUSES[job.status]}
                    {job.deadline
                      ? ` · Sista ansökningsdag ${job.deadline}`
                      : ""}
                  </p>
                  {onMerge && (
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setError(onMerge(job.id, draft) ?? "")}
                    >
                      Samla under befintligt jobb
                    </button>
                  )}
                  {onOpenExisting && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => onOpenExisting(job.id)}
                    >
                      Öppna befintlig ansökan
                    </button>
                  )}
                </div>
              ))}
              {!exact && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={separate}
                    onChange={(event) => setSeparate(event.target.checked)}
                  />
                  Det är en annan tjänst – spara separat
                </label>
              )}
            </section>
          )}
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
              {draft.advertisement?.additionalUrls?.map((url, index) => (
                <a
                  key={url}
                  href={jobAdvertisementUrl(url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ytterligare annonskälla {index + 1}
                </a>
              ))}
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
                        ...draft.advertisement,
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
                        ...draft.advertisement,
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
            Jobbet sparas som utkast. Fortsätt med CV och ansökan i arbetsvyn.
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
