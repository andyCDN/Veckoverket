"use client";
import { useEffect, useRef, useState } from "react";
import type { ApplicationMaterial, JobApplication } from "@/lib/types";
import {
  documentUrl,
  validateApplicationMaterials,
} from "@/lib/application-materials";
import { today, uid } from "@/lib/date";
import { Modal } from "./modal";
import { readJobAdvertisement } from "@/lib/job-ad-reader";
import { jobUrlKey } from "@/lib/job-ad-url";
export function ApplicationMaterials({
  value,
  onSave,
  onClose,
  firstStep,
}: {
  value: JobApplication;
  firstStep?: string;
  onSave: (v: Pick<JobApplication, "advertisement" | "materials">) => void;
  onClose: () => void;
}) {
  const [ad, setAd] = useState(() =>
    structuredClone(value.advertisement ?? { url: "", text: "" }),
  );
  const [materials, setMaterials] = useState(() =>
    structuredClone(value.materials ?? []),
  );
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const changeAd = (
    patch: Partial<NonNullable<JobApplication["advertisement"]>>,
  ) => {
    request.current?.abort();
    setReading(false);
    setAd((current) => ({ ...current, ...patch }));
  };
  const patch = (id: string, changes: Partial<ApplicationMaterial>) =>
    setMaterials((items) =>
      items.map((m) => (m.id === id ? { ...m, ...changes } : m)),
    );
  return (
    <Modal
      title="Dokumentunderlag"
      description={`${value.role} · ${value.organization}`}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            validateApplicationMaterials({
              ...value,
              advertisement: ad,
              materials,
            });
            onSave({ advertisement: ad, materials });
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Underlaget kunde inte sparas.",
            );
          }
        }}
      >
        {firstStep && (
          <p className="check-in-plan">
            <strong>Första lilla steget</strong>
            <br />
            {firstStep}
          </p>
        )}
        <p>
          Spara annonsen och länkar till de dokumentversioner som används eller
          har skickats. Lägg till en egen rad för varje version.
        </p>
        <label>
          Annonslänk
          <input
            type="url"
            maxLength={2048}
            value={ad.url}
            onChange={(e) => changeAd({ url: e.target.value })}
          />
        </label>
        {documentUrl(ad.url) && (
          <button
            type="button"
            className="button secondary"
            disabled={reading}
            onClick={async () => {
              if (
                ad.text.trim() &&
                !window.confirm(
                  "Ersätta den sparade annonstexten med text från länken?",
                )
              )
                return;
              request.current?.abort();
              const controller = new AbortController();
              request.current = controller;
              setReading(true);
              setError("");
              try {
                const details = await readJobAdvertisement(
                  ad.url,
                  controller.signal,
                  value,
                );
                if (controller.signal.aborted) return;
                if (!details.description.trim())
                  throw new Error(
                    "Ingen fullständig annonstext kunde läsas. Klistra in den nedan.",
                  );
                const seen = new Set<string>();
                const additionalUrls = [
                  ...(ad.additionalUrls ?? []),
                  ...(details.additionalUrls ?? []),
                ].filter((url) => {
                  const key = jobUrlKey(url)!;
                  if (key === jobUrlKey(ad.url) || seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
                setAd({
                  ...ad,
                  text: details.description,
                  ...(additionalUrls.length ? { additionalUrls } : {}),
                  ...(!ad.applicationUrl && details.applicationUrl
                    ? { applicationUrl: details.applicationUrl }
                    : {}),
                });
              } catch (issue) {
                if (!controller.signal.aborted)
                  setError(
                    issue instanceof Error
                      ? issue.message
                      : "Annonsen kunde inte läsas.",
                  );
              } finally {
                if (!controller.signal.aborted) setReading(false);
              }
            }}
          >
            {reading ? "Läser annonsen…" : "Läs annonstext från länken"}
          </button>
        )}
        {documentUrl(ad.url) && (
          <a
            href={documentUrl(ad.url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Öppna annons
          </a>
        )}
        <label>
          Annonstext
          <textarea
            rows={6}
            maxLength={60000}
            value={ad.text}
            onChange={(e) => changeAd({ text: e.target.value })}
          />
        </label>
        <details>
          <summary>Annonskällor och ansökningslänk</summary>
          <div className="stack">
            <label>
              Ansökningssida (valfritt)
              <input
                type="url"
                maxLength={2048}
                value={ad.applicationUrl ?? ""}
                onChange={(event) =>
                  changeAd({ applicationUrl: event.target.value })
                }
              />
            </label>
            {(ad.additionalUrls ?? []).map((url, index) => (
              <div className="stack" key={index}>
                <label>
                  Ytterligare annonslänk {index + 1}
                  <input
                    type="url"
                    maxLength={2048}
                    value={url}
                    onChange={(event) =>
                      changeAd({
                        additionalUrls: ad.additionalUrls!.map((current, i) =>
                          index === i ? event.target.value : current,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    changeAd({
                      additionalUrls: ad.additionalUrls!.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  Ta bort annonskälla {index + 1}
                </button>
              </div>
            ))}
            {(ad.additionalUrls?.length ?? 0) < 20 && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeAd({
                    additionalUrls: [...(ad.additionalUrls ?? []), ""],
                  })
                }
              >
                Lägg till annonskälla
              </button>
            )}
          </div>
        </details>
        {materials.map((m, i) => (
          <fieldset className="stack" key={m.id}>
            <legend>Dokument {i + 1}</legend>
            <label>
              Dokumentnamn
              <input
                required
                maxLength={200}
                value={m.title}
                onChange={(e) => patch(m.id, { title: e.target.value })}
              />
            </label>
            <label>
              Dokumenttyp
              <select
                value={m.kind}
                onChange={(e) =>
                  patch(m.id, {
                    kind: e.target.value as ApplicationMaterial["kind"],
                  })
                }
              >
                <option value="cv">CV</option>
                <option value="letter">Personligt brev</option>
                <option value="other">Övrigt</option>
              </select>
            </label>
            <label>
              Dokumentlänk
              <input
                required
                type="url"
                maxLength={2048}
                value={m.url}
                onChange={(e) => patch(m.id, { url: e.target.value })}
              />
            </label>
            {documentUrl(m.url) && (
              <a
                href={documentUrl(m.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Öppna dokument {i + 1}
              </a>
            )}
            <label>
              Version
              <input
                maxLength={200}
                value={m.version}
                onChange={(e) => patch(m.id, { version: e.target.value })}
              />
            </label>
            <label>
              Skickat datum
              <input
                type="date"
                max={today()}
                value={m.sentOn}
                onChange={(e) => patch(m.id, { sentOn: e.target.value })}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Ta bort dokumentraden? Själva dokumentet i molnlagringen påverkas inte.",
                  )
                )
                  setMaterials((items) => items.filter((x) => x.id !== m.id));
              }}
            >
              Ta bort dokument {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={materials.length >= 100}
          onClick={() =>
            setMaterials((items) => [
              ...items,
              {
                id: uid(),
                title: "CV",
                kind: "cv",
                url: "",
                version: "",
                sentOn: "",
              },
            ])
          }
        >
          Lägg till dokument
        </button>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={reading}>
          Spara dokumentunderlag
        </button>
      </form>
    </Modal>
  );
}
