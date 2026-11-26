"use client";
import { useEffect, useState } from "react";
import { today, uid } from "@/lib/date";
import type { JobApplication } from "@/lib/types";
import { appPath } from "@/lib/app-path";
import { jobUrlKey } from "@/lib/job-ad-url";
import { applicationAdvertisementUrls } from "@/lib/job-identity";
import {
  JOB_WATCH_SOURCES,
  JOB_WATCH_PROFILE,
  type JobWatchFeed,
} from "@/lib/job-watch-config";
import {
  parseJobWatchFeed,
  uniqueWatchJobs,
  watchJobUrls,
} from "@/lib/job-watch-feed";
import { orderedJobReviews } from "@/lib/job-review";

const key = (url: string) => jobUrlKey(url) ?? "";
const localTime = (value: string) =>
  new Date(value).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" });
export function JobWatch({
  applications,
  dismissedUrls,
  onSave,
  onDismiss,
  onRestore,
}: {
  applications: JobApplication[];
  dismissedUrls: string[];
  onSave: (job: JobApplication) => void;
  onDismiss: (url: string) => void;
  onRestore: (url?: string) => void;
}) {
  const [feed, setFeed] = useState<JobWatchFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [legacyHidden, setLegacyHidden] = useState<string[]>([]);
  const [lastDismissed, setLastDismissed] = useState<{
    url: string;
    title: string;
  } | null>(null);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("veckoverket-job-watch-hidden") || "[]",
      );
      if (Array.isArray(saved))
        setLegacyHidden(
          saved.filter(
            (v): v is string =>
              typeof v === "string" && v.length <= 2048 && !!jobUrlKey(v),
          ),
        );
    } catch {}
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const read = async (url: string) => {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error("Jobbspaningen kunde inte hämtas.");
      return parseJobWatchFeed(await response.json());
    };
    read(
      "https://raw.githubusercontent.com/andyCDN/Veckoverket/main/public/jobbspaning.json?t=" +
        Date.now(),
    )
      .catch((error) => {
        if (controller.signal.aborted) throw error;
        return read(appPath("/jobbspaning.json"));
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setFeed(value);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Jobbspaningen kunde inte hämtas. Försök igen.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  const seen = new Set(
    applications.flatMap(applicationAdvertisementUrls).map(key),
  );
  const hidden = new Set([...dismissedUrls, ...legacyHidden].map(key));
  const visible = uniqueWatchJobs(feed?.jobs ?? []).filter(
    (j) =>
      (!j.deadline || j.deadline >= today()) &&
      !watchJobUrls(j).some(
        (url) => seen.has(key(url)) || hidden.has(key(url)),
      ),
  );
  const reviewed = orderedJobReviews(visible, applications);
  const priorities = reviewed.filter(
    ({ review }) => review.kind === "priority",
  );
  const showing = showAll ? reviewed : priorities.slice(0, 8);
  return (
    <section className="job-workspace stack" aria-label="Jobbspaning">
      <div className="job-toolbar">
        <div>
          <h2>Jobbspaning</h2>
          <p>
            {feed?.updatedAt
              ? "Senast uppdaterad: " + localTime(feed.updatedAt)
              : "Ingen rapport publicerad ännu."}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setReload((v) => v + 1);
          }}
        >
          Uppdatera
        </button>
      </div>
      {!!feed?.sources?.length && (
        <details className="career-card">
          <summary>Källor och sökurval</summary>
          <p>{JOB_WATCH_PROFILE}</p>
          <p>
            Källorna kontrolleras automatiskt varje dag. Uppdatera hämtar
            senaste resultatet.
          </p>
          <ul>
            {feed.sources.map((source) => {
              const info = JOB_WATCH_SOURCES.find((s) => s.id === source.id)!;
              return (
                <li key={source.id}>
                  <a href={info.url} target="_blank" rel="noopener noreferrer">
                    {info.name}
                  </a>
                  {source.status === "ok"
                    ? ` · ${source.count} lästa annonser · kontrollerad ${localTime(source.checkedAt)}`
                    : source.lastSuccessfulAt
                      ? ` · kunde inte uppdateras · visar senaste lyckade hämtningen från ${localTime(source.lastSuccessfulAt)}`
                      : " · kunde inte hämtas ännu"}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {feed?.sources?.some((source) => source.status === "error") && (
        <p role="status">
          En annonskälla kunde inte uppdateras. Se Källor och sökurval.
        </p>
      )}
      {loading && <p role="status">Hämtar jobb…</p>}
      {error && <p role="alert">{error}</p>}
      {lastDismissed && hidden.has(key(lastDismissed.url)) && (
        <div role="status">
          <p>{lastDismissed.title} har valts bort.</p>
          <button
            className="text-button"
            onClick={() => {
              onRestore(lastDismissed.url);
              setLastDismissed(null);
            }}
          >
            Ångra bortval
          </button>
        </div>
      )}
      {!loading && !error && feed?.updatedAt && !visible.length && (
        <p>Inga nya öppna jobb att visa.</p>
      )}
      {!loading && !!visible.length && (
        <div className="job-review-overview stack">
          <p>
            <strong>{Math.min(8, priorities.length)} jobb att börja med</strong>{" "}
            av {visible.length} öppna träffar.
          </p>
          <p>
            Prioriterat efter arbetsuppgifter, krav och roller i dina aktiva
            ansökningar. Behörigheten behöver jämföras med din utbildning och
            erfarenhet.
          </p>
          <div
            className="career-actions job-lanes"
            role="group"
            aria-label="Visa jobbträffar"
          >
            <button
              className="button secondary"
              aria-pressed={!showAll}
              onClick={() => setShowAll(false)}
            >
              Prioriterade
            </button>
            <button
              className="button secondary"
              aria-pressed={showAll}
              onClick={() => setShowAll(true)}
            >
              Alla träffar ({reviewed.length})
            </button>
          </div>
          {!showAll && !priorities.length && (
            <p>
              Inga tydliga förslag efter granskningen. Alla träffar finns kvar
              att gå igenom.
            </p>
          )}
        </div>
      )}
      {showing.map(({ job: j, review }) => (
        <article
          key={j.url}
          className="career-card stack"
          aria-label={`${j.role} · ${j.organization}`}
        >
          <h3>{j.role}</h3>
          <p>
            {j.organization} · {j.location}
          </p>
          {j.sourceId && (
            <p className="muted">
              Källa:{" "}
              {
                JOB_WATCH_SOURCES.find((source) => source.id === j.sourceId)
                  ?.name
              }
            </p>
          )}
          <p>
            {j.deadline
              ? "Sök senast " + j.deadline
              : "Sista ansökningsdag saknas"}
          </p>
          <p className="job-review-reason">
            <strong>
              {review.kind === "priority"
                ? "Därför lyfts jobbet fram"
                : review.kind === "possible"
                  ? "Behöver granskas närmare"
                  : review.kind === "incomplete"
                    ? "Underlag saknas"
                    : "Utanför sökinriktningen"}
              :
            </strong>{" "}
            {review.reason}
          </p>
          {review.preference && <p>{review.preference}</p>}
          {review.evidence ? (
            <blockquote className="job-review-evidence">
              {review.evidence}
            </blockquote>
          ) : (
            review.kind === "incomplete" && j.summary && <p>{j.summary}</p>
          )}
          {review.concerns.map((concern) => (
            <p key={concern}>{concern}</p>
          ))}
          {!!review.requirements.length && (
            <details className="job-review-requirements">
              <summary>Utvalda krav ur annonsen</summary>
              {review.requirements.some((item) => item.kind === "required") && (
                <>
                  <h4>Angivna krav</h4>
                  <ul>
                    {review.requirements
                      .filter((item) => item.kind === "required")
                      .slice(0, 6)
                      .map((item) => (
                        <li key={item.text}>{item.text}</li>
                      ))}
                  </ul>
                </>
              )}
              {review.requirements.some(
                (item) => item.kind === "preferred",
              ) && (
                <>
                  <h4>Meriterande</h4>
                  <ul>
                    {review.requirements
                      .filter((item) => item.kind === "preferred")
                      .slice(0, 3)
                      .map((item) => (
                        <li key={item.text}>{item.text}</li>
                      ))}
                  </ul>
                </>
              )}
            </details>
          )}
          <div className="career-actions">
            <a
              className="button secondary"
              href={j.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Öppna annons
            </a>
            <button
              className="button primary"
              onClick={() =>
                onSave({
                  id: uid(),
                  role: j.role,
                  organization: j.organization,
                  status: "draft",
                  deadline: j.deadline,
                  nextAction: "Förbered ansökan",
                  nextActionKind: "task",
                  nextActionOwner: "Jag",
                  followUpDate: "",
                  notes: j.summary,
                  advertisement: {
                    url: j.url,
                    text: j.text ?? "",
                    ...(j.additionalUrls?.length
                      ? { additionalUrls: j.additionalUrls }
                      : {}),
                    ...(j.applicationUrl
                      ? { applicationUrl: j.applicationUrl }
                      : {}),
                  },
                })
              }
            >
              Granska jobbet
            </button>
            <button
              className="text-button"
              onClick={() => {
                onDismiss(j.url);
                setLastDismissed({
                  url: j.url,
                  title: `${j.role} · ${j.organization}`,
                });
              }}
            >
              Inte intressant
            </button>
          </div>
        </article>
      ))}
      {!!hidden.size && (
        <button
          className="text-button"
          onClick={() => {
            onRestore();
            setLegacyHidden([]);
            setLastDismissed(null);
            try {
              localStorage.removeItem("veckoverket-job-watch-hidden");
            } catch {}
          }}
        >
          Visa bortvalda jobb igen ({hidden.size})
        </button>
      )}
    </section>
  );
}
