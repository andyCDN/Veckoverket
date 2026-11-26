"use client";
import { useState } from "react";
import type { JobApplication } from "@/lib/types";
import { today } from "@/lib/date";
import { suggestedFollowUpDate } from "@/lib/application-flow";
import { Modal } from "./modal";
export function ApplicationSent({
  application,
  onSave,
  onClose,
  mode = "send",
}: {
  application: JobApplication;
  onSave: (date: string) => string | undefined;
  onClose: () => void;
  mode?: "send" | "follow-up";
}) {
  const [date, setDate] = useState(
      mode === "send" ? suggestedFollowUpDate() : application.followUpDate,
    ),
    [error, setError] = useState("");
  return (
    <Modal
      title={mode === "send" ? "Markera ansökan skickad" : "Ändra uppföljning"}
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
        {mode === "send" ? (
          <p>
            Bekräfta när du har skickat ansökan. Status och historik uppdateras
            i Veckoverket.
          </p>
        ) : (
          <p>
            Välj när du vill följa upp den skickade ansökan. Status och dokument
            bevaras.
          </p>
        )}
        {mode === "send" && application.nextAction && (
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
          Uppföljningsdatumet avgör när appen påminner dig. Sparade dokument och
          kalenderutfall behålls. Inget nytt kalenderpass bokas.
        </p>
        <p className="help">
          Förslag: följ upp om en vecka. Ändra datumet om arbetsgivaren har
          angett när du får besked.
        </p>
        {date && (
          <button
            type="button"
            className="text-button"
            onClick={() => setDate("")}
          >
            Ingen bevakning för den här ansökan
          </button>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="button primary">
          {mode === "send" ? "Bekräfta skickad" : "Spara bevakning"}
        </button>
      </form>
    </Modal>
  );
}
