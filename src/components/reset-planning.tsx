"use client";
import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import type { AppData } from "@/lib/types";
import { downloadData } from "@/lib/storage";
import { Modal } from "./modal";

export function ResetPlanningModal({
  data,
  cloudEnabled,
  protectedCopy,
  blockedReason,
  onConfirm,
  onClose,
}: {
  data: AppData;
  cloudEnabled: boolean;
  protectedCopy: boolean;
  blockedReason?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const activities = Object.values(data.weeks).flatMap(
    (plan) => plan.activities,
  );
  return (
    <Modal
      title="Nollställ planering och statistik"
      description="Rensa sparad planering och börja med en tom aktuell vecka."
      onClose={onClose}
    >
      <div className="stack reset-planning">
        <p>
          Alla sparade veckor rensas. Statistik och uppföljning som bygger på
          innehållet nollställs.
        </p>
        <dl className="reset-summary">
          <div>
            <dt>Aktiviteter</dt>
            <dd>{activities.length}</dd>
          </div>
          <div>
            <dt>Genomförda och missade pass</dt>
            <dd>{activities.filter((a) => a.status !== "planned").length}</dd>
          </div>
          <div>
            <dt>Mål och uppgifter</dt>
            <dd>{data.goals.length + data.tasks.length}</dd>
          </div>
          <div>
            <dt>Återkommande regler</dt>
            <dd>{data.recurring.length}</dd>
          </div>
          <div>
            <dt>Veckoreflektioner</dt>
            <dd>{Object.keys(data.reflections).length}</dd>
          </div>
        </dl>
        <p>
          Kontot, profilen, sparade planeringsinställningar och kategorier
          behålls.
        </p>
        {activities.some((a) => a.external) && (
          <p>
            Importerade Google-händelser tas bort ur Veckoverket. Kalendern hos
            Google påverkas inte.
          </p>
        )}
        {cloudEnabled && (
          <p>
            Återställningen sparas i ditt konto och hämtas på dina andra enheter
            när de synkroniserar.
          </p>
        )}
        {protectedCopy && (
          <p>Den skyddade lokala kopian ersätts när du bekräftar.</p>
        )}
        <button className="button secondary" onClick={() => downloadData(data)}>
          <Download size={16} /> Exportera säkerhetskopia
        </button>
        <label className="reset-confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>Jag vill ta bort sparad planering och statistik.</span>
        </label>
        {blockedReason && (
          <p className="inline-error" role="alert">
            {blockedReason}
          </p>
        )}
        <div className="reset-actions">
          <button className="button secondary" onClick={onClose}>
            Avbryt
          </button>
          <button
            className="button danger"
            disabled={!confirmed || Boolean(blockedReason)}
            onClick={onConfirm}
          >
            <RotateCcw size={16} /> Nollställ nu
          </button>
        </div>
      </div>
    </Modal>
  );
}
