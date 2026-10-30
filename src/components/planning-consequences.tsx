import type { AppData } from "@/lib/types";
import type { PlanningPreview } from "@/lib/career-planning";
import { activityDeadline, jobShare } from "@/lib/planning-insights";
import { deadlineTiming, deadlineWork } from "@/lib/deadline-scheduling";
import { addDays, monday, planningBoundary, time } from "@/lib/date";

export function PlanningConsequences({
  base,
  result,
}: {
  base: AppData;
  result: PlanningPreview;
}) {
  const boundary = planningBoundary(),
    week = monday(boundary.date);
  const old = Object.values(base.weeks).flatMap((p) => p.activities),
    share = jobShare(result.data.weeks[week]?.activities ?? []);
  const risks = deadlineWork(result.data)
    .filter(
      (w) =>
        w.deadline.date <= addDays(boundary.date, 7) ||
        w.activities.some((a) => a.date === boundary.date),
    )
    .map((w) => ({
      id: w.deadline.id,
      title: w.deadline.title,
      message: deadlineTiming(w, boundary),
    }))
    .filter(
      (w) =>
        ![
          "Arbetstid är bokad före deadline.",
          "Arbetspassen är genomförda.",
        ].includes(w.message),
    );
  return (
    <section className="stack" aria-label="Konsekvenser av omplaneringen">
      <h2>Pass som flyttas</h2>
      {!result.activities.length && (
        <p>Inga tider ändras i det här förslaget.</p>
      )}
      <ul>
        {result.activities.map((a) => {
          const before = old.find((v) => v.id === a.id),
            due = activityDeadline(base, a);
          return (
            <li key={a.id}>
              <strong>{a.title}</strong>
              <p>
                {before
                  ? `${before.date} ${time(before.start)}–${time(before.end)} → `
                  : ""}
                {a.date} {time(a.start)}–{time(a.end)}
              </p>
              <p>
                {due
                  ? `Deadline/uppföljning: ${due.date} ${time(due.minute)}. `
                  : ""}
                Prioritet {a.priority}.
              </p>
            </li>
          );
        })}
      </ul>
      {!!result.unplaced?.length && (
        <>
          <h2>Kunde inte placeras</h2>
          <ul>
            {result.unplaced.map((a) => (
              <li key={a.id}>
                {a.title} · {a.end - a.start} min
                {activityDeadline(base, a)
                  ? ` · Deadline ${activityDeadline(base, a)!.date}`
                  : ""}
              </li>
            ))}
          </ul>
          <p>
            Ingen del av förslaget har sparats. Frigör tid eller ändra
            tidsbehovet och skapa ett nytt förslag.
          </p>
        </>
      )}
      <h2>Deadlines att kontrollera</h2>
      {risks.length ? (
        <ul>
          {risks.map((r) => (
            <li key={r.id}>
              {r.title}: {r.message}
            </li>
          ))}
        </ul>
      ) : (
        <p>Inga identifierade deadlinevarningar för den närmaste veckan.</p>
      )}
      <p>
        Jobbsök{" "}
        {share.percent === null ? "saknar bokad tid" : `${share.percent} %`} av
        veckans tid för jobbsök och nätverkande. Målet är cirka 75 %. Vid samma
        deadline och prioritet ordnas passen mot fördelningen. Passens längd och
        kategori bevaras.
      </p>
    </section>
  );
}
