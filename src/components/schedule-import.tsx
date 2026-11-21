"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./modal";
import {
  DAY_NAMES,
  addDays,
  monday,
  today,
  weekday,
  weekLabel,
  weekNumber,
  time,
  uid,
} from "@/lib/date";
import { categoryLabel } from "@/lib/presentation";
import type { AppData } from "@/lib/types";
import {
  EXAMPLE_WEEK_SCHEDULE,
  scheduleImportText,
  parseScheduleText,
  previewScheduleImport,
  scheduleRowErrors,
  type ScheduleImportRow,
  type ScheduleImportPreview,
  type ScheduleImportProof,
} from "@/lib/schedule-import";
import type { SyncPhase } from "@/lib/workspace-sync";

export function ScheduleImport({
  data,
  week,
  cloudEnabled,
  cloudPhase,
  saveError,
  onApply,
  onVerify,
  onRetry,
  onClose,
  onView,
}: {
  data: AppData;
  week: string;
  cloudEnabled: boolean;
  cloudPhase: SyncPhase;
  saveError: string;
  onApply: (preview: ScheduleImportPreview) => string | undefined;
  onVerify: (proof: ScheduleImportProof) => Promise<void>;
  onRetry: () => void;
  onClose: () => void;
  onView: () => void;
}) {
  const initialDefinition =
    data.weeks[week]?.rules?.importedSchedule ?? data.settings.importedSchedule;
  const [text, setText] = useState(() =>
    initialDefinition
      ? scheduleImportText(initialDefinition.blocks)
      : EXAMPLE_WEEK_SCHEDULE,
  );
  const [rows, setRows] = useState<ScheduleImportRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [firstWeek, setFirstWeek] = useState(() =>
    week === monday(today()) && weekday(today()) >= 4 ? addDays(week, 7) : week,
  );
  const [weeks, setWeeks] = useState(4);
  const [useForNewWeeks, setUseForNewWeeks] = useState(true),
    [keepExternal, setKeepExternal] = useState(true);
  const [name, setName] = useState(initialDefinition?.name ?? "Min veckoplan");
  const [operation] = useState(() => ({
    id: uid(),
    importedAt: new Date().toISOString(),
  }));
  const [submitted, setSubmitted] = useState<ScheduleImportPreview | null>(
    null,
  );
  const [saved, setSaved] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const file = useRef<HTMLInputElement>(null),
    runs = useRef(new Map<string, Promise<void>>());
  const rowErrors = rows ? scheduleRowErrors(rows, data.categories) : [];
  const calculated = useMemo(() => {
    if (!rows || submitted || rowErrors.length)
      return { preview: null, error: "" };
    try {
      return {
        preview: previewScheduleImport(data, rows, {
          firstWeek,
          weeks,
          useForNewWeeks,
          keepExternal,
          name,
          ...operation,
        }),
        error: "",
      };
    } catch (error) {
      return {
        preview: null,
        error:
          error instanceof Error
            ? error.message
            : "Schemat kunde inte förhandsgranskas.",
      };
    }
  }, [
    data,
    rows,
    firstWeek,
    weeks,
    useForNewWeeks,
    keepExternal,
    name,
    submitted,
    operation,
    rowErrors.join("|"),
  ]);
  useEffect(() => {
    if (
      !submitted ||
      saved ||
      saveError ||
      (cloudEnabled && cloudPhase !== "synced") ||
      !Object.keys(submitted.proof.signatures).every(
        (w) => data.weeks[w]?.scheduleImport?.id === submitted.proof.id,
      )
    )
      return;
    let active = true;
    const key = `${submitted.proof.id}:${retry}`;
    if (!runs.current.has(key))
      runs.current.set(
        key,
        Promise.resolve().then(() => onVerify(submitted.proof)),
      );
    void runs.current
      .get(key)!
      .then(() => {
        if (active) {
          setSaved(true);
          setError("");
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Den sparade importen kunde inte kontrolleras.",
          );
      });
    return () => {
      active = false;
    };
  }, [
    submitted,
    saved,
    saveError,
    cloudEnabled,
    cloudPhase,
    data,
    onVerify,
    retry,
  ]);
  const patch = (id: string, update: Partial<ScheduleImportRow>) =>
    setRows(
      (current) =>
        current?.map((r) =>
          r.id === id
            ? {
                ...r,
                ...update,
                ...("end" in update ? { inferredEnd: false } : {}),
              }
            : r,
        ) ?? null,
    );
  const analyze = () => {
    const result = parseScheduleText(text, data.categories);
    setParseErrors(result.errors);
    if (!result.errors.length) setRows(result.rows);
    setError("");
  };
  const apply = () => {
    if (!calculated.preview) return;
    const error = onApply(calculated.preview);
    if (error) {
      setError(error);
      return;
    }
    setError("");
    setSubmitted(calculated.preview);
  };
  return (
    <Modal
      wide
      title="Importera veckoschema"
      description="Klistra in, granska och ersätt planeringen för de veckor du väljer."
      onClose={onClose}
    >
      <div className="schedule-import stack">
        {!submitted && !rows && (
          <>
            <p>
              Veckoplanen du tidigare angav är ifylld. Ändra texten eller läs en
              egen text-/CSV-fil.
            </p>
            <label htmlFor="schedule-import-text">
              Klistra in ditt veckoschema
            </label>
            <textarea
              id="schedule-import-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParseErrors([]);
              }}
              rows={12}
              maxLength={100000}
              spellCheck={false}
            />
            <div className="schedule-import-actions">
              <input
                ref={file}
                className="sr-only"
                type="file"
                aria-label="Schemafil"
                accept=".txt,.csv,text/plain,text/csv"
                onChange={async (e) => {
                  const selected = e.target.files?.[0];
                  if (!selected) return;
                  if (selected.size > 100000) {
                    setParseErrors(["Filen får vara högst 100 kB."]);
                    return;
                  }
                  try {
                    setText(await selected.text());
                    setParseErrors([]);
                  } catch {
                    setParseErrors(["Filen kunde inte läsas."]);
                  }
                  e.target.value = "";
                }}
              />
              <button
                className="button secondary"
                onClick={() => file.current?.click()}
              >
                Läs TXT/CSV-fil
              </button>
              <button className="text-button" onClick={() => setText("")}>
                Töm texten
              </button>
            </div>
            <p className="help">
              Skriv veckodag och tider, till exempel “09.00–10.30 Söka jobb”.
              CSV: Dag;Start;Slut;Aktivitet;Område. Tomma tider och “Öppet”
              lämnas obokade.
            </p>
            {parseErrors.length > 0 && (
              <div role="alert">
                <ul>
                  {parseErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              className="button primary"
              disabled={!text.trim()}
              onClick={analyze}
            >
              Granska schema
            </button>
          </>
        )}
        {!submitted && rows && (
          <>
            <p>
              <strong>{rows.length} schemapass per vecka.</strong> Kontrollera
              tiderna. Öppna en rad för att ändra titel, tider eller område.
            </p>
            {rows.some((r) => r.inferredEnd) && (
              <p className="help">
                Vissa sluttider har föreslagits utifrån nästa pass eller passets
                längd. Kontrollera dem innan du importerar.
              </p>
            )}
            <div
              className="schedule-import-rows"
              role="region"
              aria-label="Granska importerade tider"
            >
              {[...new Set(rows.map((r) => r.day))].sort().map((day) => (
                <section key={day} aria-label={DAY_NAMES[day]}>
                  <h3>{DAY_NAMES[day]}</h3>
                  {rows
                    .filter((r) => r.day === day)
                    .map((row) => (
                      <details key={row.id} data-import-row={row.id}>
                        <summary>
                          <span>
                            {time(row.start)}–{time(row.end)}
                          </span>
                          <strong>{row.title}</strong>
                          {!row.categoryId && <span>Välj område</span>}
                        </summary>
                        <div className="schedule-import-row-fields">
                          <label className="schedule-import-title">
                            Titel
                            <input
                              value={row.title}
                              maxLength={200}
                              onChange={(e) =>
                                patch(row.id, { title: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Starttid
                            <input
                              type="time"
                              value={time(row.start)}
                              onChange={(e) => {
                                const [h, m] = e.target.value
                                  .split(":")
                                  .map(Number);
                                patch(row.id, { start: h * 60 + m });
                              }}
                            />
                          </label>
                          <label>
                            Sluttid
                            <input
                              type="time"
                              value={time(row.end)}
                              onChange={(e) => {
                                const [h, m] = e.target.value
                                  .split(":")
                                  .map(Number);
                                patch(row.id, { end: h * 60 + m });
                              }}
                            />
                          </label>
                          <label className="schedule-import-area">
                            Område
                            <select
                              value={row.categoryId}
                              onChange={(e) =>
                                patch(row.id, { categoryId: e.target.value })
                              }
                            >
                              <option value="">Välj område</option>
                              {data.categories
                                .filter((c) => c.id !== "google-calendar")
                                .map((c) => (
                                  <option value={c.id} key={c.id}>
                                    {categoryLabel(c)}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <button
                            className="text-button"
                            onClick={() =>
                              setRows(
                                (current) =>
                                  current?.filter((r) => r.id !== row.id) ?? [],
                              )
                            }
                          >
                            Ta bort raden
                          </button>
                        </div>
                      </details>
                    ))}
                </section>
              ))}
            </div>
            <div className="form-row">
              <label>
                Vecka från (måndag)
                <input
                  type="date"
                  value={firstWeek}
                  min={monday(today())}
                  onChange={(e) => setFirstWeek(e.target.value)}
                />
              </label>
              <label>
                Antal veckor
                <select
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                >
                  {[1, 2, 4, 8, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "vecka" : "veckor"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Namn på schemat
              <input
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={useForNewWeeks}
                onChange={(e) => setUseForNewWeeks(e.target.checked)}
              />
              Använd som standard för nya veckor
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={keepExternal}
                onChange={(e) => setKeepExternal(e.target.checked)}
              />
              Behåll bokningar från Google Kalender/iCal
            </label>
            <p className="help">
              Planerade pass ersätts. Avklarade och missade pass behålls.
              Arbetspass utanför schemats tider flyttas till “Pass utanför
              veckoschemat”. Originalbokningar i din externa kalender finns
              kvar.
            </p>
            {(rowErrors.length > 0 || calculated.error || error) && (
              <div role="alert">
                <ul>
                  {[...rowErrors, calculated.error, error]
                    .filter(Boolean)
                    .map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                </ul>
              </div>
            )}
            {calculated.preview && (
              <section
                className="schedule-import-changes"
                aria-label="Så ändras planeringen"
              >
                <h3>Det här ändras</h3>
                <p>
                  {weeks} {weeks === 1 ? "vecka" : "veckor"} · {rows.length}{" "}
                  schematider per vecka ·{" "}
                  {calculated.preview.changes.reduce(
                    (n, c) => n + c.removed.length,
                    0,
                  )}{" "}
                  tidigare planerade pass ersätts.
                </p>
                {calculated.preview.changes.map((change) => (
                  <details key={change.week}>
                    <summary>
                      Vecka {weekNumber(change.week)} · {weekLabel(change.week)}{" "}
                      · {change.removed.length} pass ersätts
                    </summary>
                    <p>
                      {change.preserved} avklarade/missade pass och{" "}
                      {change.external} kalenderbokningar behålls.
                    </p>
                    {change.removed.length > 0 && (
                      <ul>
                        {change.removed.map((a) => (
                          <li key={a.id}>
                            {a.date} {time(a.start)}–{time(a.end)} · {a.title}
                          </li>
                        ))}
                      </ul>
                    )}
                    {change.conflicts.length > 0 && (
                      <div>
                        <strong>Krockar med bokningar som behålls</strong>
                        <ul>
                          {change.conflicts.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </details>
                ))}
              </section>
            )}
            <div className="schedule-import-actions">
              <button
                className="button secondary"
                onClick={() => {
                  setRows(null);
                  setError("");
                }}
              >
                Tillbaka till texten
              </button>
              <button
                className="button primary"
                disabled={
                  !calculated.preview ||
                  Boolean(saveError) ||
                  cloudPhase === "conflict"
                }
                onClick={apply}
              >
                Ersätt planeringen och importera
              </button>
            </div>
          </>
        )}
        {submitted && (
          <section className="stack" aria-label="Importresultat">
            {saved ? (
              <>
                <h3>Schemat är importerat</h3>
                <p role="status">
                  Sparat och kontrollerat{" "}
                  {cloudEnabled ? "i molnet" : "på den här enheten"}:{" "}
                  {Object.keys(submitted.proof.signatures).length}{" "}
                  {Object.keys(submitted.proof.signatures).length === 1
                    ? "vecka"
                    : "veckor"}{" "}
                  med {submitted.blocks.length}{" "}
                  {submitted.blocks.length === 1 ? "schematid" : "schematider"}{" "}
                  per vecka.
                </p>
                <p>
                  {useForNewWeeks
                    ? "Nya veckor använder också ditt importerade schema."
                    : "Importen gäller de valda veckorna."}
                </p>
                <button className="button primary" onClick={onView}>
                  Visa den importerade veckan
                </button>
              </>
            ) : (
              <>
                {!error && !saveError && (
                  <p role="status">
                    Sparar schemat och kontrollerar den sparade planen…
                  </p>
                )}
                {(error || saveError) && (
                  <>
                    <p role="alert">{error || saveError}</p>
                    <button
                      className="button primary"
                      onClick={() => {
                        setError("");
                        setRetry((n) => n + 1);
                        onRetry();
                      }}
                    >
                      Försök igen
                    </button>
                  </>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
