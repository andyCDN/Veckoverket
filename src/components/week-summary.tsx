import type { Activity } from "@/lib/types";
import { hours } from "@/lib/date";
import { categoryMinutes } from "@/lib/planner";

export function WeekSummary({ activities }: { activities: Activity[] }) {
  const total = (status?: Activity["status"]) =>
    Object.values(categoryMinutes(activities, status)).reduce(
      (sum, minutes) => sum + minutes,
      0,
    );
  const minutes = categoryMinutes(
    activities.filter((a) => a.status !== "skipped"),
  );
  const career = minutes.career ?? 0,
    networking = minutes.networking ?? 0;
  const share =
    career + networking
      ? Math.round((career / (career + networking)) * 100)
      : 0;
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
      <div className="week-summary-balance">
        <span>Bokad tid · jobbsök och nätverkande</span>
        <div
          className={`week-balance-bar ${career + networking === 0 ? "is-empty" : ""}`}
          aria-hidden="true"
        >
          <span style={{ width: `${share}%` }} />
        </div>
        <div className="week-balance-labels">
          <span>
            Jobbsök {hours(career)}
            {career + networking > 0 && ` · ${share} %`}
          </span>
          <span>
            Nätverkande {hours(networking)}
            {career + networking > 0 && ` · ${100 - share} %`}
          </span>
        </div>
        <small>Riktvärde: 75 % jobbsök · 25 % nätverkande</small>
      </div>
    </section>
  );
}
