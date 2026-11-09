"use client";
export function PlanningShortcuts({
  onCheck,
  onAdd,
}: {
  onCheck: (kind: "week-start" | "week-review") => void;
  onAdd: (kind: "pass" | "task" | "goal" | "habit") => void;
}) {
  return (
    <section className="planning-shortcuts" aria-label="Veckans arbetsflöde">
      <div className="planning-checks">
        <button
          className="button primary"
          onClick={() => onCheck("week-start")}
        >
          Måndagscheck
        </button>
        <button
          className="button secondary"
          onClick={() => onCheck("week-review")}
        >
          Fredagscheck
        </button>
      </div>
      <p className="workflow-caption">Bestäm · planera · genomför · följ upp</p>
      <details className="add-menu">
        <summary className="button secondary">+ Lägg till</summary>
        <div className="add-menu-options">
          {[
            ["pass", "Pass"],
            ["task", "Uppgift"],
            ["goal", "Mål"],
            ["habit", "Vana"],
          ].map(([kind, label]) => (
            <button
              key={kind}
              className="text-button"
              onClick={(e) => {
                e.currentTarget.closest("details")?.removeAttribute("open");
                onAdd(kind as "pass" | "task" | "goal" | "habit");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
