"use client";
import { fullDate, hours, time } from "@/lib/date";
import { followUps, type FollowUp } from "@/lib/follow-up";
import type { Activity, AppData } from "@/lib/types";

export function FollowUpPanel({
  data,
  week,
  onReschedule,
  onEdit,
}: {
  data: AppData;
  week: string;
  onReschedule: (item: FollowUp) => void;
  onEdit: (week: string, activity: Activity) => void;
}) {
  const items = followUps(data).filter(
    (item) => item.week === week || item.remaining > 0,
  );
  if (!items.length) return null;
  const remaining = items.reduce((sum, item) => sum + item.remaining, 0);
  return (
    <section
      className="accountability-band"
      aria-label="Uppföljning av missade pass"
    >
      <div className="accountability-head">
        <span className="section-tag">[ Uppföljning ]</span>
        <h2>{items.length} missade pass</h2>
        <p role="status">{hours(remaining)} kvar att boka om</p>
      </div>
      <div className="accountability-list">
        {items.map((item) => (
          <div className="debt-chip" key={`${item.week}/${item.activity.id}`}>
            <div className="debt-text">
              <button
                className="debt-title"
                onClick={() => onEdit(item.week, item.activity)}
              >
                {item.activity.title}
              </button>
              <small>
                {fullDate(item.activity.date)} / {time(item.activity.start)}–
                {time(item.activity.end)}
              </small>
              {item.remaining > 0 && (
                <small>{hours(item.remaining)} återstår</small>
              )}
              {item.replacements.map((replacement) => (
                <button
                  className="replacement-link"
                  key={`${replacement.week}/${replacement.activity.id}`}
                  onClick={() => onEdit(replacement.week, replacement.activity)}
                >
                  {replacement.activity.status === "skipped"
                    ? "Missat ersättningspass"
                    : "Ersättningspass"}
                  : {replacement.activity.date}{" "}
                  {time(replacement.activity.start)}–
                  {time(replacement.activity.end)}
                </button>
              ))}
            </div>
            {item.remaining > 0 ? (
              <button
                className="followup-btn"
                onClick={() => onReschedule(item)}
              >
                Boka om
              </button>
            ) : (
              <span className="followup-state">Ombokad</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
