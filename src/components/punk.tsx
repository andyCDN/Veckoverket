"use client";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import { DAY_NAMES, hours, weekNumber } from "@/lib/date";
import { plannedDays } from "@/lib/planner";
import { appPath } from "@/lib/app-path";
import type { Settings } from "@/lib/types";

export function PlannerMasthead({
  settings,
  minutes,
  week,
}: {
  settings: Settings;
  week: string;
  minutes: number;
}) {
  const days = plannedDays(settings);
  const range = days.length
    ? `${DAY_NAMES[days[0]]}–${DAY_NAMES[days.at(-1)!]}`
    : "Inga planeringsdagar";
  return (
    <header
      className="planner-header"
      aria-label="Veckoverket – veckans schema"
    >
      <div className="planner-header-text">
        <div className="masthead-kicker">
          <strong className="masthead-week">Vecka {weekNumber(week)}</strong>
          <span className="masthead-range">{range}</span>
        </div>
        <div className="title-line">
          <img
            className="standalone-brand-icon"
            src={appPath("/icons/veckoverket-32.png")}
            width={28}
            height={28}
            alt=""
            aria-hidden="true"
          />
          <span className="brand-title">
            Vecko<span>verket</span>
          </span>
          <span className="schema-label">Veckans schema</span>
        </div>
      </div>
      <div className="week-total" aria-label={`${hours(minutes)} planerad tid`}>
        <strong>{hours(minutes).replace(" h", "")}</strong>
        <small>Tim / planerat</small>
      </div>
    </header>
  );
}

export function WorkspaceTools({
  connected,
  onAccount,
  onHelp,
  undoLabel,
  onUndo,
}: {
  connected: boolean;
  onAccount: () => void;
  onHelp: () => void;
  undoLabel?: string;
  onUndo: () => void;
}) {
  return (
    <div className="workspace-tools">
      <button
        className="text-button"
        onClick={onUndo}
        disabled={!undoLabel}
        title={
          undoLabel
            ? `Ångra: ${undoLabel}`
            : "Inget att ångra i den här sessionen"
        }
        aria-label="Ångra senaste ändringen"
      >
        Ångra
      </button>
      <button className="text-button" onClick={onAccount}>
        {connected ? "Konto" : "Lagring"}
        <ArrowUpRight size={11} />
      </button>
      <button className="text-button" onClick={onHelp}>
        <CircleHelp size={12} />
        Hjälp
      </button>
    </div>
  );
}

export function BackCoverInfo({
  storageText,
  onReflection,
  onStorage,
}: {
  storageText: string;
  onReflection: () => void;
  onStorage: () => void;
}) {
  return (
    <section className="punk-backcover" aria-label="Lagring och veckohistorik">
      <div className="punk-archive-stamp" aria-hidden="true">
        Nr
        <br />
        005
        <br />✳
      </div>
      <div className="punk-back-copy">
        <span className="section-tag">[ Baksidan / Utgåva 005 ]</span>
        <h2>Veckoarkiv</h2>
        <p>{storageText}</p>
        <div className="backcover-actions">
          <button className="text-button" onClick={onReflection}>
            Visa veckoreflektioner
            <ArrowUpRight size={12} />
          </button>
          <button className="text-button" onClick={onStorage}>
            Lagring och säkerhetskopiering
            <ArrowUpRight size={12} />
          </button>
        </div>
      </div>
    </section>
  );
}
