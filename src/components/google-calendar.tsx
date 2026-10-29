"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { CalendarDays, Download, Link2, Unlink } from "lucide-react";
import { Modal } from "./modal";
import type { AppData } from "@/lib/types";
import {
  previewGoogleImport,
  type GoogleSnapshot,
} from "@/lib/google-calendar";
import type { GoogleConnection } from "@/lib/use-google-calendar";
import { fullDate, time, weekLabel } from "@/lib/date";
export function GoogleCalendarModal({
  data,
  week,
  connection,
  onImport,
  onRemove,
  onClose,
}: {
  data: AppData;
  week: string;
  connection: GoogleConnection;
  onImport: (snapshot: GoogleSnapshot, replan: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [snapshot, setSnapshot] = useState<GoogleSnapshot | null>(null),
    [replan, setReplan] = useState(true),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    const available = new Set(connection.calendars.map((c) => c.id));
    const saved = data.googleCalendar?.calendarIds.filter((id) =>
      available.has(id),
    );
    setSelected(
      saved?.length
        ? saved
        : connection.calendars.filter((c) => c.primary).map((c) => c.id),
    );
    setSnapshot(null);
    setLoading(false);
    setError("");
    request.current++;
    // A new Google account must have its calendar selection reviewed again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.connection, week]);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const preview = useMemo(
    () => (snapshot ? previewGoogleImport(data, snapshot, replan) : null),
    [data, snapshot, replan],
  );
  async function fetchWeek() {
    const id = ++request.current;
    setLoading(true);
    setError("");
    setSnapshot(null);
    try {
      const result = await connection.readWeek(
        connection.calendars.filter((c) => selected.includes(c.id)),
        week,
      );
      if (request.current === id) setSnapshot(result);
    } catch (cause) {
      if (request.current === id)
        setError(
          cause instanceof Error && cause.name !== "AbortError"
            ? cause.message
            : "Hämtningen avbröts. Ingen import har sparats.",
        );
    } finally {
      if (request.current === id) setLoading(false);
    }
  }
  const imported = Object.values(data.weeks)
    .flatMap((p) => p.activities)
    .filter((a) => a.external).length;
  return (
    <Modal
      title="Google Kalender"
      description={`Kalenderhändelser för ${weekLabel(week)}.`}
      onClose={onClose}
      wide
    >
      {connection.configured && (
        <Script
          id="google-calendar-identity"
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onReady={connection.markReady}
          onError={connection.scriptError}
        />
      )}
      <div className="stack google-calendar-panel">
        <p>
          Hämta bokningar från Google Kalender till veckoplanen. Upptagen tid
          reserveras i planeringen. Ändra händelsernas datum och tider i Google
          Kalender.
        </p>
        {!connection.configured ? (
          <div className="integration-setup">
            <h3>Google-anslutning saknas</h3>
            <p>
              Installationen behöver kopplas till Google innan du kan välja ett
              konto.
            </p>
            <a
              href="https://github.com/andyCDN/Veckoverket/blob/main/docs/google-calendar-setup.md"
              target="_blank"
              rel="noreferrer"
            >
              Installationsguide för Google Kalender
            </a>
          </div>
        ) : (
          <>
            <div className="google-connection-actions">
              <button
                className="button primary"
                disabled={!connection.ready || connection.connecting || loading}
                onClick={connection.connect}
              >
                <Link2 size={16} />
                {connection.connecting
                  ? "Ansluter…"
                  : connection.connected
                    ? "Byt Google-konto"
                    : "Anslut Google-konto"}
              </button>
              {connection.connected && (
                <button
                  className="text-button"
                  onClick={() => {
                    request.current++;
                    setSnapshot(null);
                    setLoading(false);
                    connection.disconnect();
                  }}
                >
                  <Unlink size={14} />
                  Koppla från Google
                </button>
              )}
            </div>
            {!connection.ready && !connection.error && (
              <p role="status">Laddar Google-inloggningen…</p>
            )}
            {connection.connected && (
              <>
                <fieldset className="google-calendar-choices">
                  <legend>Välj kalendrar</legend>
                  {connection.calendars.map((calendar) => (
                    <label key={calendar.id} className="google-calendar-choice">
                      <input
                        type="checkbox"
                        checked={selected.includes(calendar.id)}
                        disabled={loading}
                        onChange={(event) => {
                          setSnapshot(null);
                          setSelected((ids) =>
                            event.target.checked
                              ? [...ids, calendar.id]
                              : ids.filter((id) => id !== calendar.id),
                          );
                        }}
                      />
                      <span>
                        {calendar.summary}
                        {calendar.primary ? " · huvudkalender" : ""}
                      </span>
                    </label>
                  ))}
                  {!connection.calendars.length && (
                    <p>Inga läsbara kalendrar hittades på kontot.</p>
                  )}
                </fieldset>
                <button
                  className="button secondary"
                  onClick={() => {
                    void fetchWeek();
                  }}
                  disabled={loading || !selected.length}
                >
                  <CalendarDays size={16} />
                  {loading ? "Hämtar kalendern…" : "Förhandsgranska import"}
                </button>
              </>
            )}
          </>
        )}
        {(connection.error || error) && (
          <p className="inline-error" role="alert">
            {error || connection.error}
          </p>
        )}
        {preview && snapshot && (
          <section
            className="google-import-preview"
            aria-label="Förhandsgranskning av Google-import"
          >
            <h3>{preview.count} kalenderposter</h3>
            <p>
              Importen uppdaterar valda kalendrar för den här veckan. Borttagna
              händelser försvinner ur veckans import. Flyttade eller avbokade
              källhändelser uppdateras även där de redan importerats i andra
              veckor.
            </p>
            <label className="google-calendar-choice">
              <input
                type="checkbox"
                checked={replan || Boolean(data.settings.autoPlanning)}
                disabled={Boolean(data.settings.autoPlanning)}
                onChange={(e) => setReplan(e.target.checked)}
              />
              <span>
                Anpassa oredigerade planeringsförslag efter bokningarna
              </span>
            </label>
            <p>
              Egna, genomförda och skyddade aktiviteter bevaras.{" "}
              {data.settings.autoPlanning &&
                "Automatisk veckoplanering är aktiv efter importen."}
            </p>
            {preview.conflicts.length > 0 && (
              <div className="google-import-conflicts" role="status">
                <strong>{preview.conflicts.length} planeringsfrågor</strong>
                {preview.conflicts.slice(0, 4).map((c) => (
                  <p key={c.id}>{c.message}</p>
                ))}
                {replan && !preview.replanned && (
                  <p>
                    Fasta eller egna pass överlappar bokningarna. Importen visas
                    i kalendern. Lös överlappningarna och välj sedan Planera
                    veckan för att skapa nya förslag.
                  </p>
                )}
              </div>
            )}
            <ul className="google-event-preview">
              {snapshot.activities.slice(0, 30).map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>
                  <span>
                    {fullDate(a.date)} ·{" "}
                    {a.external?.allDay
                      ? "Heldag"
                      : `${time(a.start)}–${time(a.end)}`}{" "}
                    · {a.external?.busy ? "Upptagen" : "Ledig"}
                  </span>
                </li>
              ))}
            </ul>
            {snapshot.activities.length > 30 && (
              <p>
                Ytterligare {snapshot.activities.length - 30} kalenderposter
                ingår i importen.
              </p>
            )}
            <button
              className="button primary"
              onClick={() =>
                onImport(
                  snapshot,
                  replan || Boolean(data.settings.autoPlanning),
                )
              }
            >
              <Download size={16} />
              Importera kalenderhändelser
            </button>
          </section>
        )}
        {data.googleCalendar && (
          <p className="muted">
            Senast importerad vecka:{" "}
            {weekLabel(data.googleCalendar.lastImportedWeek)}.
          </p>
        )}
        <p className="help">
          Google-anslutningen gäller den här öppna sidan. Anslut igen efter
          omladdning och förhandsgranska på nytt för att hämta senare ändringar.
          Importerade kalenderposter finns kvar i planen.
        </p>
        {imported > 0 && (
          <button
            className="text-button danger"
            onClick={() => {
              if (
                window.confirm(
                  `Ta bort ${imported} importerade kalenderposter från Veckoverket? Händelserna i Google Kalender påverkas inte.`,
                )
              ) {
                request.current++;
                setSnapshot(null);
                onRemove();
              }
            }}
          >
            Ta bort importerade Google-händelser
          </button>
        )}
      </div>
    </Modal>
  );
}
