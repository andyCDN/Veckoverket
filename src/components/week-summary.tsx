import type { Activity } from "@/lib/types";
import { hours } from "@/lib/date";
import { categoryMinutes } from "@/lib/planner";

export function WeekSummary({ activities }: { activities: Activity[] }) {
  const total = (status?: Activity["status"]) =>
    Object.values(categoryMinutes(activities, status)).reduce(
      (sum, minutes) => sum + minutes,
      0,
    );
  return (
    <section className="week-summary" aria-label="Veckans tidsöversikt">
      <dl className="week-summary-totals">
        <div>
          <dt>Planerat</dt>
          <dd>{hours(total())}</dd>
        </div>
        <div>
          <dt>Genomfört</dt>
          <dd>{hours(total("done"))}</dd>
        </div>
        <div>
          <dt>Återstår</dt>
          <dd>{hours(total("planned"))}</dd>
        </div>
        {total("skipped") > 0 && (
          <div>
            <dt>Missat</dt>
            <dd>{hours(total("skipped"))}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
