"use client";
import type { AppData, DailyCheckIn } from "@/lib/types";
import { DailyTodos } from "./daily-todos";
import { Modal } from "./modal";

export function DailyCheckInModal({
  data,
  date,
  onSave,
  onRemove,
  onClose,
}: {
  data: AppData;
  date: string;
  onSave: (value: DailyCheckIn, start: boolean) => string | undefined;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Att göra idag"
      description="Små steg för jobb och nätverkande. Börja med en sak."
      onClose={onClose}
    >
      <div className="stack daily-check-in">
        <DailyTodos
          data={data}
          date={date}
          onUpdate={(value, start) => onSave(value, start)}
        />
        <p className="help">
          Bocka av det lilla steget när det är gjort. Ansökans status hanteras
          på jobbkortet. Listan ändrar inte deadlines eller bokad tid.
        </p>
        <div className="career-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Tillbaka till planen
          </button>
          {data.dailyCheckIns?.[date] && (
            <button type="button" className="text-button" onClick={onRemove}>
              Återställ dagens lista
            </button>
          )}
        </div>
        <details className="check-in-evidence">
          <summary>Forskningsgrunden</summary>
          <p>
            Ett tydligt delmål och en konkret startsignal kan hjälpa oss att gå
            från avsikt till handling. Här öppnar Börja rätt underlag och visar
            ett litet steg att ta direkt.
          </p>
          <ul>
            <li>
              <a
                href="https://doi.org/10.1146/annurev-psych-021524-110536"
                target="_blank"
                rel="noopener noreferrer"
              >
                Handlingsplaner: forskningsöversikt, 2025
              </a>
            </li>
            <li>
              <a
                href="https://doi.org/10.1037/apl0001040"
                target="_blank"
                rel="noopener noreferrer"
              >
                Konkreta delmål: fältexperiment, 2023
              </a>
            </li>
            <li>
              <a
                href="https://doi.org/10.1037/a0035923"
                target="_blank"
                rel="noopener noreferrer"
              >
                Målsättning och jobbsökande: metaanalys, 2014
              </a>
            </li>
          </ul>
          <p>
            Det här är en praktisk tillämpning. Just den här att-göra-listan har
            inte utvärderats vetenskapligt.
          </p>
        </details>
      </div>
    </Modal>
  );
}
