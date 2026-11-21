import { DAY_NAMES, time } from "@/lib/date";
import {
  FOUR_DAY_WEEK,
  templateBlocks,
  weekendStartsOn,
} from "@/lib/week-template";
import type { Settings } from "@/lib/types";

export function WeekTemplateOverview({
  settings,
}: { settings?: Settings } = {}) {
  if (settings?.importedSchedule)
    return (
      <div
        className="personal-week-overview"
        aria-label="Importerat veckoschema"
      >
        <p>
          <strong>{settings.importedSchedule.name}</strong> · Schemat du
          importerat styr tiderna.
        </p>
        {[...new Set(templateBlocks(settings).map((b) => b.day))]
          .sort()
          .map((day) => (
            <section key={day}>
              <h3>{DAY_NAMES[day]}</h3>
              <ul>
                {templateBlocks(settings)
                  .filter((b) => b.day === day)
                  .map((b) => (
                    <li key={b.id}>
                      <span>
                        {time(b.start)}–{time(b.end)}
                      </span>
                      <strong>{b.title}</strong>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        {weekendStartsOn(settings) < 7 && (
          <p>{DAY_NAMES[weekendStartsOn(settings)]}–söndag är ledig tid.</p>
        )}
      </div>
    );
  return (
    <div className="personal-week-overview" aria-label="Min fyradagarsvecka">
      {[0, 1, 2, 3].map((day) => (
        <section key={day}>
          <h3>{DAY_NAMES[day]}</h3>
          <ul>
            {FOUR_DAY_WEEK.filter((block) => block.day === day).map((block) => (
              <li key={block.id}>
                <span>
                  {time(block.start)}–{time(block.end)}
                </span>
                <strong>{block.title}</strong>
              </li>
            ))}
          </ul>
          {day === 1 && <p className="help">Efter 12.30: öppet.</p>}
          {day === 2 && <p className="help">13.30–15.00: öppet.</p>}
        </section>
      ))}
      <p>
        Fredag–söndag är helg. Nya veckor får inga automatiska arbetspass då.
      </p>
      <p className="help">
        Veckostängning 13.00–13.30 torsdag. Hämtning 15.00–15.30 onsdag. Egna
        bokningar behålls. Veckoschemat styr arbetspassens tider; uppgifter
        använder tiden i de befintliga passen.
      </p>
    </div>
  );
}
