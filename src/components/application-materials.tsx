"use client";
import { useState } from "react";
import type { ApplicationMaterial, JobApplication } from "@/lib/types";
import {
  documentUrl,
  validateApplicationMaterials,
} from "@/lib/application-materials";
import { today, uid } from "@/lib/date";
import { Modal } from "./modal";
export function ApplicationMaterials({
  value,
  onSave,
  onClose,
}: {
  value: JobApplication;
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
            onChange={(e) => setAd({ ...ad, url: e.target.value })}
          />
        </label>
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
            onChange={(e) => setAd({ ...ad, text: e.target.value })}
          />
        </label>
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
        <button className="button primary">Spara dokumentunderlag</button>
      </form>
    </Modal>
  );
}
