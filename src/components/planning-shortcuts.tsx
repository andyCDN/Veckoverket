"use client";
export function PlanningShortcuts({
  onCheck,
  onAdd,
  reviewLabel = "Fredagscheck",
  startLabel = "Måndagscheck",
  showStart = true,
  showReview = true,
  onImport,
}: {
  reviewLabel?: string;
  startLabel?: string;
  showStart?: boolean;
  showReview?: boolean;
  onImport?: () => void;
  onCheck: (kind: "week-start" | "week-review") => void;
  onAdd: (kind: "pass" | "task" | "goal" | "habit") => void;
}) {
  return (
    <section className="planning-shortcuts" aria-label="Veckans arbetsflöde">
      <div className="planning-checks">
        {showStart && (
          <button
            className="button primary"
            onClick={() => onCheck("week-start")}
          >
            {startLabel}
          </button>
        )}
        {showReview && (
          <button
            className="button secondary"
            onClick={() => onCheck("week-review")}
          >
            {reviewLabel}
          </button>
        )}
      </div>
      <p className="workflow-caption">Bestäm · planera · genomför · följ upp</p>
      <div className="planning-shortcut-actions">
        {onImport && (
          <button className="button secondary" onClick={onImport}>
            Importera schema
          </button>
        )}
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
      </div>
    </section>
  );
}
