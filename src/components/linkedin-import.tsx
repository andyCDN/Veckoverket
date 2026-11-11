"use client";
import { useEffect, useRef, useState } from "react";
import type { JobApplication } from "@/lib/types";
import {
  linkedInDrafts,
  LINKEDIN_STEPS,
  type LinkedInDraft,
} from "@/lib/linkedin-import";
import {
  loadJobDetails,
  applyJobDetails,
  detailsFromPastedText,
} from "@/lib/linkedin-details-client";
import { Modal } from "./modal";
export function LinkedInImport({
  applications,
  onImport,
  onClose,
}: {
  applications: JobApplication[];
  onImport: (drafts: LinkedInDraft[]) => { added: number; skipped: number };
  onClose: () => void;
}) {
  const reading = useRef<AbortController | null>(null);
  useEffect(() => () => reading.current?.abort(), []);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<LinkedInDraft[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const change = (key: string, patch: Partial<LinkedInDraft>) => {
    setDrafts((old) =>
      old!.map((d) =>
        d.key === key
          ? {
              ...d,
              ...patch,
              editedFields: [
                ...new Set([...(d.editedFields ?? []), ...Object.keys(patch)]),
              ],
            }
          : d,
      ),
    );
    setError("");
  };
  const startReading = (rows: LinkedInDraft[]) => {
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    const pending = rows.filter((d) => !d.issue);
    let index = 0;
    setDrafts(
      rows.map((d) =>
        d.issue
          ? d
          : {
              ...d,
              fetchState: "loading",
              fetchMessage: "Läser annonsuppgifter…",
            },
      ),
    );
    const worker = async () => {
      while (!controller.signal.aborted && index < pending.length) {
        const row = pending[index++];
        try {
          const details = await loadJobDetails(row.url, controller.signal);
          if (!controller.signal.aborted)
            setDrafts(
              (current) =>
                current?.map((d) =>
                  d.key === row.key ? applyJobDetails(d, details) : d,
                ) ?? null,
            );
        } catch (e) {
          if (!controller.signal.aborted)
            setDrafts(
              (current) =>
                current?.map((d) =>
                  d.key === row.key
                    ? {
                        ...d,
                        fetchState: "error",
                        fetchMessage:
                          e instanceof Error
                            ? e.message
                            : "Annonsen kunde inte läsas.",
                      }
                    : d,
                ) ?? null,
            );
        }
      }
    };
    void Promise.all([worker(), worker()]);
  };
  const selected = drafts?.filter((d) => d.selected).length ?? 0;
  return (
    <Modal title="Importera från LinkedIn" onClose={onClose} wide>
      <div className="stack linkedin-import">
        <p>
          Klistra in jobblänkar så försöker vi läsa tjänst, arbetsgivare och
          andra annonsuppgifter. Granska och rätta uppgifterna innan jobben
          sparas som utkast.
        </p>
        {!drafts ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                startReading(linkedInDrafts(text, applications));
                setError("");
                setMessage("");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Länkarna kunde inte läsas.",
                );
              }
            }}
          >
            <label>
              Jobblänkar – en per rad
              <textarea
                autoFocus
                required
                rows={7}
                maxLength={100000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="https://www.linkedin.com/jobs/view/1234567890/"
              />
            </label>
            <p>
              Öppna ett sparat jobb på LinkedIn och kopiera länken. Upp till 100
              länkar per import.
            </p>
            <button className="button primary">Granska jobben</button>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const result = onImport(drafts);
                if (!result.added)
                  setMessage(
                    result.skipped
                      ? "Jobben finns redan i registret. Inga dubbletter skapades."
                      : "Välj minst ett jobb att importera.",
                  );
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Jobben kunde inte sparas.",
                );
              }
            }}
          >
            <p role="status">
              {selected} valda · {drafts.filter((d) => d.issue).length} länkar
              behöver inte importeras eller kan inte läsas
            </p>
            {drafts.some((d) => d.fetchState === "loading") && (
              <div>
                <p role="status">
                  Läser annonsuppgifter:{" "}
                  {
                    drafts.filter((d) => !d.issue && d.fetchState !== "loading")
                      .length
                  }{" "}
                  av {drafts.filter((d) => !d.issue).length} klara.
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    reading.current?.abort();
                    setDrafts((current) =>
                      current!.map((d) =>
                        d.fetchState === "loading"
                          ? {
                              ...d,
                              fetchState: "error",
                              fetchMessage:
                                "Hämtningen avbröts. Du kan klistra in annonsen eller fylla i uppgifterna.",
                            }
                          : d,
                      ),
                    );
                  }}
                >
                  Avbryt hämtningen
                </button>
              </div>
            )}
            {drafts.map((draft, i) => (
              <fieldset
                className="stack linkedin-import-job"
                key={draft.key}
                disabled={Boolean(draft.issue)}
              >
                <legend>Jobb {i + 1}</legend>
                {draft.issue ? (
                  <>
                    <p>{draft.issue}</p>
                    <p className="linkedin-raw-url">{draft.url}</p>
                  </>
                ) : (
                  <>
                    <label className="routine-task">
                      <input
                        type="checkbox"
                        checked={draft.selected}
                        onChange={(e) =>
                          change(draft.key, { selected: e.target.checked })
                        }
                      />
                      Importera detta jobb
                    </label>
                    <a
                      href={draft.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Öppna annonsen på LinkedIn ↗
                    </a>
                    {draft.fetchMessage && (
                      <p role="status">{draft.fetchMessage}</p>
                    )}
                    <div className="form-row">
                      <label>
                        Tjänst
                        <input
                          required={draft.selected}
                          maxLength={200}
                          value={draft.role}
                          onChange={(e) =>
                            change(draft.key, { role: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Arbetsgivare
                        <input
                          required={draft.selected}
                          maxLength={200}
                          value={draft.organization}
                          onChange={(e) =>
                            change(draft.key, { organization: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Sista ansökningsdag (valfritt)
                      <input
                        type="date"
                        value={draft.deadline}
                        onChange={(e) =>
                          change(draft.key, { deadline: e.target.value })
                        }
                      />
                    </label>
                    <div className="form-row">
                      <label>
                        Nästa steg
                        <select
                          value={draft.nextAction}
                          onChange={(e) =>
                            change(draft.key, { nextAction: e.target.value })
                          }
                        >
                          {LINKEDIN_STEPS.map((step) => (
                            <option key={step} value={step}>
                              {step || "Inget nästa steg ännu"}
                            </option>
                          ))}
                        </select>
                      </label>
                      {draft.nextAction && (
                        <label>
                          Datum för nästa steg
                          <input
                            type="date"
                            value={draft.followUpDate}
                            onChange={(e) =>
                              change(draft.key, {
                                followUpDate: e.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                    <label>
                      Övriga annonsuppgifter
                      <textarea
                        rows={3}
                        value={draft.notes ?? ""}
                        onChange={(e) =>
                          change(draft.key, { notes: e.target.value })
                        }
                      />
                    </label>
                    <details>
                      <summary>Annonsens text och reservimport</summary>
                      <p>
                        Om LinkedIn blockerar läsningen: öppna annonsen och
                        klistra in texten här. Tydliga rubriker som Tjänst:,
                        Arbetsgivare: och Ort: kan läsas automatiskt.
                      </p>
                      <label>
                        Annonsens text
                        <textarea
                          rows={5}
                          maxLength={20000}
                          value={draft.advertisementText ?? ""}
                          onChange={(e) =>
                            change(draft.key, {
                              advertisementText: e.target.value,
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={!draft.advertisementText?.trim()}
                        onClick={() => {
                          const details = detailsFromPastedText(
                            draft.advertisementText ?? "",
                          );
                          setDrafts((current) =>
                            current!.map((d) =>
                              d.key === draft.key
                                ? applyJobDetails(d, details, "paste")
                                : d,
                            ),
                          );
                        }}
                      >
                        Läs inklistrad annons
                      </button>
                    </details>
                  </>
                )}
              </fieldset>
            ))}
            <p>
              Valda nästa steg visas i veckovyn. Kalenderpass skapas först när
              du väljer att boka tid.
            </p>
            <button className="button primary" disabled={!selected}>
              Importera {selected} jobb
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                reading.current?.abort();
                setDrafts(null);
                setError("");
                setMessage("");
              }}
            >
              Tillbaka till länkarna
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className="text-button" onClick={onClose}>
          Avbryt
        </button>
      </div>
    </Modal>
  );
}
