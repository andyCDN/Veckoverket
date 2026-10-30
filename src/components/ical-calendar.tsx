"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Link2, Unlink } from "lucide-react";
import type { IcalConnection } from "@/lib/use-ical-calendar";
import type { GoogleSnapshot } from "@/lib/google-calendar";

export function IcalCalendarPanel({
  connection,
  week,
  active,
  automatic,
  onAutomatic,
  onSnapshot,
  onDisconnected,
  loading,
}: {
  connection: IcalConnection;
  week: string;
  active: boolean;
  automatic: boolean;
  onAutomatic: (enabled: boolean) => void;
  onSnapshot: (snapshot: GoogleSnapshot | null) => void;
  onDisconnected: () => void;
  loading: boolean;
}) {
  const [url, setUrl] = useState("");
  const request = useRef(0);
  const { load, read, disconnect } = connection;
  useEffect(() => {
    if (connection.available) void load();
  }, [connection.available, load]);
  useEffect(
    () => () => {
      request.current++;
    },
    [week],
  );
  const disabled = connection.busy || loading;
  async function preview(value?: string) {
    const id = ++request.current;
    onSnapshot(null);
    try {
      const snapshot = await read(week, value);
      if (id === request.current) {
        setUrl("");
        onSnapshot(snapshot);
      }
    } catch {
      /* The connection displays a sanitized error. */
    }
  }
  return (
    <section
      className="integration-setup ical-calendar-panel"
      aria-label="Privat iCal-länk"
    >
      <h3>Privat iCal-länk</h3>
      <p>Anslut en kalender en gång. Ingen Google-inloggning behövs.</p>
      {!connection.available ? (
        <p>
          Logga in med ditt Veckoverket-konto för att spara en privat
          kalenderlänk.
        </p>
      ) : (
        <>
          <details>
            <summary>Så hittar du länken i Google Kalender</summary>
            <ol>
              <li>Öppna Google Kalender i en webbläsare på datorn.</li>
              <li>
                Öppna Inställningar och välj kalendern under Inställningar för
                mina kalendrar.
              </li>
              <li>
                Under Integrera kalender kopierar du Hemlig adress i
                iCal-format.
              </li>
            </ol>
            <p>
              Om adressen saknas kan Google-kontots administratör ha stängt av
              den.
            </p>
          </details>
          {connection.feed && (
            <p role="status">
              <strong>Ansluten: {connection.feed.name}</strong>. Länken är
              sparad.{" "}
              {active
                ? automatic
                  ? "Automatisk uppdatering är på."
                  : "Automatisk uppdatering är pausad."
                : "Förhandsgranska och importera för att använda kalendern i planen."}
            </p>
          )}
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void preview(url.trim());
            }}
          >
            <label>
              Hemlig iCal-adress
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                required
                maxLength={2048}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                disabled={disabled}
              />
            </label>
            <p className="help">
              Länken lagras krypterad på servern och ingår inte i exporterade
              säkerhetskopior. Dela den inte med andra.
            </p>
            <button
              className="button primary"
              type="submit"
              disabled={disabled || !url.trim()}
            >
              <Link2 size={16} />
              {connection.busy
                ? "Hämtar kalendern…"
                : connection.feed
                  ? "Byt länk och förhandsgranska"
                  : "Anslut och förhandsgranska"}
            </button>
          </form>
          {connection.feed && (
            <div className="stack">
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => void preview()}
              >
                <CalendarDays size={16} />
                Förhandsgranska via iCal
              </button>
              {active && (
                <label className="google-calendar-choice">
                  <input
                    type="checkbox"
                    checked={automatic}
                    disabled={disabled}
                    onChange={(e) => onAutomatic(e.target.checked)}
                  />
                  <span>Uppdatera automatiskt när appen är öppen</span>
                </label>
              )}
              <button
                className="text-button danger"
                disabled={disabled}
                onClick={async () => {
                  if (
                    window.confirm(
                      "Koppla från iCal-länken? Den sparade länken raderas och automatisk uppdatering stoppas. Importerade bokningar finns kvar i planen.",
                    )
                  ) {
                    onSnapshot(null);
                    if (await disconnect()) onDisconnected();
                  }
                }}
              >
                <Unlink size={14} />
                Koppla från iCal-länken
              </button>
            </div>
          )}
          <p className="help">
            Efter import uppdateras den visade veckan när appen öppnas och
            därefter var femtonde minut medan den är öppen. Google kan fördröja
            ändringar i iCal-flödet. Ändra bokningarnas tider i Google Kalender.
          </p>
          {connection.lastChecked && (
            <p className="muted">
              Senast hämtad:{" "}
              {new Date(connection.lastChecked).toLocaleString("sv-SE", {
                timeZone: "Europe/Stockholm",
              })}
              .
            </p>
          )}
        </>
      )}
      {connection.error && (
        <div className="inline-error" role="alert">
          <p>{connection.error}</p>
          <a
            href="https://github.com/andyCDN/Veckoverket/blob/main/docs/ical-calendar-setup.md"
            target="_blank"
            rel="noreferrer"
          >
            Installationsguide för iCal
          </a>
        </div>
      )}
    </section>
  );
}
