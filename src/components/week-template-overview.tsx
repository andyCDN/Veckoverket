import { DAY_NAMES, time } from "@/lib/date";
import { FOUR_DAY_WEEK } from "@/lib/week-template";

export function WeekTemplateOverview() {
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
        bokningar och ändrade pass behålls.
      </p>
    </div>
  );
}
