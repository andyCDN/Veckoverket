"use client";
import { useState } from "react";
import type { JobApplication } from "@/lib/types";
import { addDays, today } from "@/lib/date";
import { Modal } from "./modal";
export function ApplicationSent({
  application,
  onSave,
  onClose,
}: {
  application: JobApplication;
  onSave: (date: string) => string | undefined;
  onClose: () => void;
}) {
  const [date, setDate] = useState(addDays(today(), 7)),
    [error, setError] = useState("");
  return (
    <Modal
      title="Markera ansökan skickad"
      description={`${application.role} · ${application.organization}`}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setError(onSave(date) ?? "");
        }}
      >
        <p>
          Bekräfta när du har skickat ansökan. Status och historik uppdateras i
          Veckoverket.
        </p>
        {application.nextAction && (
          <p>
            Nuvarande nästa steg ”{application.nextAction}” ersätts med väntan
            på arbetsgivaren.
          </p>
        )}
        <label>
          Bevaka igen (valfritt)
          <input
            type="date"
            min={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <p className="help">
          Fram till bevakningsdatumet visas jobbet under Väntar på svar. Inget
          kalenderpass bokas och sparade dokument och kalenderutfall behålls.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="button primary">Bekräfta skickad</button>
      </form>
    </Modal>
  );
}
