"use client";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import { DAY_NAMES, time, weekNumber } from "@/lib/date";
import { plannedDays } from "@/lib/planner";
import type { Settings } from "@/lib/types";

export function CutoutMark() {
  return (
    <svg className="cutout-mark" aria-hidden="true" viewBox="0 0 200 200">
      <path
        d="m100 15 19 61 56-31-37 54 50 31-64-6-18 61-19-59-64 16 51-43-43-49 58 28z"
        fill="var(--red)"
        stroke="var(--ink)"
        strokeWidth="5"
        transform="rotate(8 100 100)"
      />
      <path
        d="m100 15 19 61 56-31-37 54 50 31-64-6-18 61-19-59-64 16 51-43-43-49 58 28z"
        fill="none"
        stroke="var(--blue)"
        strokeWidth="5"
        transform="translate(6 4) rotate(8 100 100)"
      />
    </svg>
  );
}
function dayRange(settings: Settings) {
  const days = plannedDays(settings);
  return days.length
    ? `${DAY_NAMES[days[0]]}–${DAY_NAMES[days.at(-1)!]}`
    : "Inga planeringsdagar";
}
export function MastheadCover({
  week,
  settings,
  name,
  connected,
  onHome,
  onAccount,
  onHelp,
}: {
  week: string;
  settings: Settings;
  name: string;
  connected: boolean;
  onHome: () => void;
  onAccount: () => void;
  onHelp: () => void;
}) {
  const days = plannedDays(settings);
  return (
    <header className="punk-hero">
      <div className="ink-strip" aria-hidden="true">
        <span>Veckoverket / Nr 002</span>
        <b>✳</b>
        <span>Pass / Datum / Tider / Kategorier</span>
        <b>✳</b>
        <span>Veckoverket / Nr 002</span>
      </div>
      <div className="punk-topline">
        <span>
          <CutoutMark />
          Veckoplan / DIY-fanzine
        </span>
        <span>
          <span className="cover-profile">{name} /</span>
          <button className="text-button" onClick={onAccount}>
            {connected ? "Anslutet konto" : "Lokalt demoläge"}
            <ArrowUpRight size={12} />
          </button>
          <button className="text-button" onClick={onHelp}>
            <CircleHelp size={12} />
            Hjälp
          </button>
        </span>
      </div>
      <div className="punk-cover-layout">
        <div className="punk-brand-column">
          <span className="punk-cut-label">Tvåfärgstryck / Riso edition</span>
          <button
            className="punk-brand"
            onClick={onHome}
            aria-label="Veckoverket, startsida"
          >
            <span>Vecko</span>
            <span className="punk-brand-blue">
              verket
              <CutoutMark />
            </span>
          </button>
          <p className="punk-brand-subtitle">
            Veckoplan / {dayRange(settings)}.<br />
            Pass / Tider / Kategorier.
          </p>
          <div className="punk-scribble" aria-hidden="true">
            <svg viewBox="0 0 340 55" preserveAspectRatio="none">
              <path d="M2 36 C30 5 45 50 77 19 S145 28 178 12 S246 45 275 15 S313 34 338 3" />
              <path d="M8 49 L335 20" />
            </svg>
          </div>
        </div>
        <div className="punk-cover-stack">
          <div className="punk-cover-halftone" aria-hidden="true" />
          <div className="punk-cover-stamp" aria-hidden="true">
            Nr.
            <br />
            00
            <br />2<CutoutMark />
          </div>
          <div className="punk-cover-note">
            <span className="cover-index">Omslag / Nr 002</span>
            <strong>
              Vecko
              <br />
              plan
              <br />
              <em>Nr.</em>
              <br />
              002.
            </strong>
            <small>
              {dayRange(settings)} / {time(settings.start)}–{time(settings.end)}
            </small>
          </div>
          <span className="punk-tape" aria-hidden="true">
            Utgåva
            <br />
            002
          </span>
        </div>
      </div>
      <div className="punk-rule-banner">
        <span>
          Jobbsök <b>×</b> Lärande <b>×</b> Musik <b>×</b> Träning <b>×</b>{" "}
          Familj
        </span>
        <span>
          Vecka {weekNumber(week)} / {days.length} dagar <b>↗</b>
        </span>
      </div>
    </header>
  );
}
export function IssueSpread({ settings }: { settings: Settings }) {
  const days = plannedDays(settings);
  const range = days.length
    ? `${DAY_NAMES[days[0]].slice(0, 3)}–${DAY_NAMES[days.at(-1)!].slice(0, 3)}`
    : "Inga dagar";
  return (
    <section className="punk-spread" aria-label="Veckans schema">
      <div className="punk-spread-copy">
        <span className="section-tag">
          [ Mittuppslag / {range} / {time(settings.start)}–{time(settings.end)}{" "}
          ]
        </span>
        <h2>
          Veckans
          <br />
          <span>schema.</span>
        </h2>
        <p>
          {range} / {time(settings.start)}–{time(settings.end)} / Aktiviteter
        </p>
      </div>
      <div className="punk-burst" aria-hidden="true">
        Nr
        <br />
        00
        <br />2
      </div>
    </section>
  );
}
export function BackCoverInfo({
  onReflection,
  onStorage,
}: {
  onReflection: () => void;
  onStorage: () => void;
}) {
  return (
    <section className="punk-backcover" aria-label="Lagring och veckohistorik">
      <div className="punk-archive-stamp" aria-hidden="true">
        Vecko
        <br />
        arkiv
        <br />
        002
        <br />✳
      </div>
      <div className="punk-back-copy">
        <span className="section-tag">[ Baksidan / Utgåva 002 ]</span>
        <h2>
          Vecko
          <br />
          <span>arkiv.</span>
        </h2>
        <p>
          Veckoplaner, mål och reflektioner sparas i webbläsaren. Export och
          import finns under inställningar.
        </p>
        <div className="backcover-actions">
          <button className="text-button" onClick={onReflection}>
            Visa veckoreflektioner
            <ArrowUpRight size={13} />
          </button>
          <button className="text-button" onClick={onStorage}>
            Lagring och säkerhetskopiering
            <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
      <div className="punk-back-mark" aria-hidden="true">
        Nr.
        <br />
        00
        <br />
        2.
      </div>
    </section>
  );
}
