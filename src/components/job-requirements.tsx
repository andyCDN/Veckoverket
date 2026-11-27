"use client";
import { useState } from "react";
import type { AdRequirement } from "@/lib/job-review";
import { advertisementRequirements } from "@/lib/job-review";
import {
  compareJobRequirements,
  type RequirementComparison,
} from "@/lib/job-cv-match";
import type { JobCvCheck, JobCvProfile } from "@/lib/types";

export type JobRequirementCheckHandler = (
  keys: string[],
  requirement: AdRequirement,
  verdict: JobCvCheck["verdict"] | "review",
  evidence?: string,
) => string | undefined;
const labels = {
  supported: "Stöd bekräftat i CV:t",
  review: "Behöver kontrolleras",
  missing: "Saknar stöd i CV:t",
};

function RequirementRow({
  item,
  jobKeys,
  onCheck,
}: {
  item: RequirementComparison;
  jobKeys: string[];
  onCheck: JobRequirementCheckHandler;
}) {
  const [selection, setSelection] = useState(
    item.suggestions.length ? "0" : "other",
  );
  const [custom, setCustom] = useState(""),
    [error, setError] = useState("");
  const evidence =
    selection === "other"
      ? custom
      : (item.suggestions[Number(selection)] ?? "");
  const save = (verdict: JobCvCheck["verdict"] | "review") =>
    setError(onCheck(jobKeys, item, verdict, evidence) ?? "");
  return (
    <li className={`job-requirement is-${item.verdict}`}>
      <p>{item.text}</p>
      <strong className="job-requirement-verdict">
        {labels[item.verdict]}
      </strong>
      {item.verdict === "review" ? (
        <>
          {item.suggestions.length > 0 ? (
            <>
              <label>
                Förslag på CV-utdrag
                <select
                  value={selection}
                  onChange={(event) => setSelection(event.target.value)}
                >
                  {item.suggestions.map((text, index) => (
                    <option key={text} value={index}>
                      Utdrag {index + 1}: {text.slice(0, 90)}
                    </option>
                  ))}
                  <option value="other">Ange annat utdrag från CV:t</option>
                </select>
              </label>
              {selection !== "other" && (
                <blockquote className="job-review-evidence">
                  {evidence}
                </blockquote>
              )}
            </>
          ) : (
            <p className="help">
              Inget tydligt textutdrag hittades automatiskt. Det betyder inte
              att erfarenheten saknas.
            </p>
          )}
          {selection === "other" && (
            <label>
              Utdrag från ditt CV
              <textarea
                rows={3}
                maxLength={1500}
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                placeholder="Kopiera ett relevant utdrag ur det sparade CV-underlaget"
              />
            </label>
          )}
          <p className="help">
            Kontrollera hela kravet, även antal år, examensnivå och eventuella
            alternativ.
          </p>
          <div className="career-actions">
            <button
              type="button"
              className="button secondary"
              disabled={evidence.trim().length < 8}
              onClick={() => save("supported")}
            >
              Bekräfta stödet
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => save("missing")}
            >
              Markera att stöd saknas
            </button>
          </div>
        </>
      ) : (
        <>
          {item.evidence && (
            <blockquote className="job-review-evidence">
              {item.evidence}
            </blockquote>
          )}
          <p className="help">Bedömningen är bekräftad av dig.</p>
          <button
            type="button"
            className="text-button"
            onClick={() => save("review")}
          >
            Kontrollera igen
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </li>
  );
}

export function JobRequirements({
  text,
  jobKeys,
  profile,
  onCheck,
  onProfile,
}: {
  text: string;
  jobKeys: string[];
  profile?: JobCvProfile;
  onCheck: JobRequirementCheckHandler;
  onProfile: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = compareJobRequirements(
    advertisementRequirements(text),
    jobKeys,
    profile,
    expanded,
  );
  return (
    <details
      className="job-cv-comparison"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        Jämför krav med ditt CV
        {profile && items.length
          ? ` · ${items.filter((item) => item.verdict === "supported").length} av ${items.length} bekräftade`
          : ""}
      </summary>
      {expanded &&
        (!profile ? (
          <div className="stack">
            <p>
              CV-underlag saknas. Lägg till CV-texten för att se förslag på
              textstöd och bedöma kraven.
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={onProfile}
            >
              Lägg till CV-underlag
            </button>
          </div>
        ) : !items.length ? (
          <p>
            Inga tydliga krav kunde urskiljas. Läs hela annonsen och komplettera
            annonsunderlaget vid behov.
          </p>
        ) : (
          <div className="stack">
            <p>
              Textutdrag föreslås automatiskt. Bekräfta stödet efter att du
              jämfört hela kravet med ditt CV. Krav utan bekräftelse är osäkra.
            </p>
            {(["required", "preferred"] as const).map((kind) => {
              const group = items.filter((item) => item.kind === kind);
              return (
                group.length > 0 && (
                  <div key={kind}>
                    <h4>
                      {kind === "required" ? "Angivna krav" : "Meriterande"}
                    </h4>
                    <ul className="job-requirement-list">
                      {group.map((item) => (
                        <RequirementRow
                          key={`${profile.updatedAt}:${item.kind}:${item.text}:${item.verdict}`}
                          item={item}
                          jobKeys={jobKeys}
                          onCheck={onCheck}
                        />
                      ))}
                    </ul>
                  </div>
                )
              );
            })}
            <p className="help">
              Kravlistan är ett urval ur annonsen. Bedömningen avgör inte din
              formella behörighet.
            </p>
            <button type="button" className="text-button" onClick={onProfile}>
              Ändra CV-underlag
            </button>
          </div>
        ))}
    </details>
  );
}
