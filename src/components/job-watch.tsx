"use client";
import { useEffect, useState } from "react";
import { addDays, today, uid } from "@/lib/date";
import type {
  JobApplication,
  JobSearchData,
  JobWatchDecision,
} from "@/lib/types";
import { appPath } from "@/lib/app-path";
import { jobUrlKey } from "@/lib/job-ad-url";
import { applicationAdvertisementUrls } from "@/lib/job-identity";
import {
  JOB_WATCH_SOURCES,
  JOB_WATCH_PROFILE,
  type JobWatchFeed,
  type JobWatchJob,
} from "@/lib/job-watch-config";
import {
  parseJobWatchFeed,
  uniqueWatchJobs,
  watchJobUrls,
} from "@/lib/job-watch-feed";
import { orderedJobReviews } from "@/lib/job-review";
import { decisionForJob, DISMISSAL_REASONS } from "@/lib/job-search";
import {
  JobRequirements,
  type JobRequirementCheckHandler,
} from "./job-requirements";
import { Modal } from "./modal";

const key = (url: string) => jobUrlKey(url) ?? "";
const localTime = (value: string) =>
  new Date(value).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" });
export function JobWatch({
  applications,
  dismissedUrls,
  onSave,
  onDismiss,
  onRestore,
  jobSearch,
  onDefer,
  onClearDecision,
  onDismissalReason,
  onProfile,
  onCheck,
  showAll,
  onShowAll: setShowAll,
}: {
  applications: JobApplication[];
  dismissedUrls: string[];
  onSave: (job: JobApplication) => void;
  onDismiss: (job: JobWatchJob) => void;
  onRestore: (url?: string) => void;
  jobSearch?: JobSearchData;
  onDefer: (job: JobWatchJob, revisitOn: string) => string | undefined;
  onClearDecision: (url: string) => void;
  onDismissalReason: (url: string, reason?: JobWatchDecision["reason"]) => void;
  onProfile: () => void;
  onCheck: JobRequirementCheckHandler;
  showAll: boolean;
  onShowAll: (showAll: boolean) => void;
}) {
  const [feed, setFeed] = useState<JobWatchFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [currentDate, setCurrentDate] = useState(today);
  const [laterJob, setLaterJob] = useState<JobWatchJob | null>(null);
  const [revisitOn, setRevisitOn] = useState("");
  const [laterError, setLaterError] = useState("");
  const [decisionMessage, setDecisionMessage] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(today()), 60000);
    return () => clearInterval(timer);
  }, []);
  const defer = (job: JobWatchJob, date?: string) => {
    setLaterJob(job);
    setRevisitOn(date ?? addDays(currentDate, 1));
    setLaterError("");
  };
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
  const candidates = uniqueWatchJobs(feed?.jobs ?? []).filter(
    (j) =>
      (!j.deadline || j.deadline >= currentDate) &&
      !watchJobUrls(j).some(
        (url) => seen.has(key(url)) || hidden.has(key(url)),
      ),
  );
  const decisions = jobSearch?.decisions ?? [];
  const visible = candidates.filter((job) => {
    const decision = decisionForJob(decisions, watchJobUrls(job));
    return decision?.kind !== "later" || decision.revisitOn! <= currentDate;
  });
  const deferred = decisions.filter(
    (decision) =>
      decision.kind === "later" &&
      (!decision.deadline || decision.deadline >= currentDate) &&
      ![decision.url, ...decision.additionalUrls].some(
        (url) => seen.has(key(url)) || hidden.has(key(url)),
      ) &&
      (decision.revisitOn! > currentDate ||
        !candidates.some((job) =>
          decisionForJob([decision], watchJobUrls(job)),
        )),
  );
  const reviewed = orderedJobReviews(visible, applications, jobSearch);
  const priorities = reviewed.filter(
    ({ review }) => review.kind === "priority",
  );
  const returning = reviewed.filter(({ job }) => {
    const decision = decisionForJob(decisions, watchJobUrls(job));
    return decision?.kind === "later" && decision.revisitOn! <= currentDate;
  });
  const startJobs = [
    ...returning,
    ...priorities.filter((row) => !returning.includes(row)),
  ];
  const showing = showAll ? reviewed : startJobs.slice(0, 8);
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
        <div className="career-actions">
          <button className="text-button" onClick={onProfile}>
            CV för jobbmatchning
          </button>
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
      {decisionMessage && <p role="status">{decisionMessage}</p>}
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
          <label className="job-dismissal-reason">
            Orsak till bortval (valfritt)
            <select
              value={
                decisionForJob(decisions, [lastDismissed.url])?.reason ?? ""
              }
              onChange={(event) =>
                onDismissalReason(
                  lastDismissed.url,
                  (event.target.value ||
                    undefined) as JobWatchDecision["reason"],
                )
              }
            >
              <option value="">Ingen orsak vald</option>
              {Object.entries(DISMISSAL_REASONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {deferred.length > 0 && (
        <details className="career-card job-deferred">
          <summary>Bedöm senare ({deferred.length})</summary>
          <ul>
            {deferred.map((decision) => {
              const job = candidates.find((job) =>
                decisionForJob([decision], watchJobUrls(job)),
              );
              return (
                <li key={decision.url}>
                  <p>
                    <strong>{decision.role}</strong> · {decision.organization}
                  </p>
                  <p>
                    Återkommer {decision.revisitOn}
                    {decision.deadline
                      ? ` · Sök senast ${decision.deadline}`
                      : ""}
                  </p>
                  {!job && (
                    <p className="help">
                      Annonsen finns inte i senaste hämtningen. Kontrollera
                      annonslänken innan du går vidare.
                    </p>
                  )}
                  <div className="career-actions">
                    <button
                      className="button secondary"
                      onClick={() => {
                        if (job) {
                          onClearDecision(decision.url);
                          setDecisionMessage(
                            `${decision.role} visas bland träffarna igen.`,
                          );
                        } else
                          onSave({
                            id: uid(),
                            role: decision.role,
                            organization: decision.organization,
                            deadline: decision.deadline,
                            status: "draft",
                            nextAction: "Förbered ansökan",
                            followUpDate: "",
                            notes: "",
                            advertisement: {
                              url: decision.url,
                              additionalUrls: decision.additionalUrls,
                              text: "",
                            },
                          });
                      }}
                    >
                      Bedöm nu
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        defer(
                          job ?? { ...decision, location: "", summary: "" },
                          decision.revisitOn,
                        )
                      }
                    >
                      Ändra återkomstdatum
                    </button>
                    <a
                      href={decision.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Öppna annons
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {!loading && !error && feed?.updatedAt && !visible.length && (
        <p>Inga nya öppna jobb att visa.</p>
      )}
      {!loading && !!visible.length && (
        <div className="job-review-overview stack">
          <p>
            <strong>{Math.min(8, startJobs.length)} jobb att börja med</strong>{" "}
            av {visible.length} öppna träffar.
          </p>
          {returning.length > 0 && (
            <p>
              {returning.length} jobb är tillbaka för bedömning enligt dina
              återkomstdatum.
            </p>
          )}
          <p>
            Prioriterat efter arbetsuppgifter, krav och roller i dina aktiva
            ansökningar. Behörigheten behöver jämföras med din utbildning och
            erfarenhet.
          </p>
          {jobSearch?.cvProfile && (
            <p>
              CV-underlag finns. Dina bekräftade kravbedömningar påverkar
              ordningen. Krav som du markerat utan stöd behöver prövas före
              ansökan.
            </p>
          )}
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
          {!showAll && !startJobs.length && (
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
          {review.interest && <p>{review.interest}</p>}
          {decisionForJob(decisions, watchJobUrls(j))?.kind === "later" && (
            <p className="job-review-reason">Dags att bedöma igen.</p>
          )}
          {review.evidence ? (
            <blockquote className="job-review-evidence">
              {review.evidence}
            </blockquote>
          ) : (
            review.kind === "incomplete" && j.summary && <p>{j.summary}</p>
          )}
          {j.text && (
            <JobRequirements
              text={j.text}
              jobKeys={watchJobUrls(j)}
              profile={jobSearch?.cvProfile}
              onCheck={(...args) => {
                const issue = onCheck(...args);
                if (!issue)
                  setDecisionMessage(
                    args[2] === "missing" && args[1].kind === "required"
                      ? "Bedömningen är sparad. Jobb med krav utan CV-stöd finns under Alla träffar."
                      : "Kravbedömningen är sparad.",
                  );
                return issue;
              }}
              onProfile={onProfile}
            />
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
                  notes: j.summary.slice(0, 4000),
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
              Ta vidare
            </button>
            <button
              className="button secondary"
              disabled={!!j.deadline && j.deadline <= currentDate}
              title={
                j.deadline === currentDate
                  ? "Sista ansökningsdag är idag."
                  : undefined
              }
              onClick={() => defer(j)}
            >
              Bedöm senare
            </button>
            <button
              className="text-button"
              onClick={() => {
                onDismiss(j);
                setLastDismissed({
                  url: j.url,
                  title: `${j.role} · ${j.organization}`,
                });
              }}
            >
              Ointressant
            </button>
          </div>
        </article>
      ))}
      {laterJob && (
        <Modal title="Bedöm jobbet senare" onClose={() => setLaterJob(null)}>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const issue = onDefer(laterJob, revisitOn);
              if (issue) {
                setLaterError(issue);
                return;
              }
              setDecisionMessage(`${laterJob.role} återkommer ${revisitOn}.`);
              setLaterJob(null);
            }}
          >
            <p>
              {laterJob.role} · {laterJob.organization}
            </p>
            <label>
              Bedöm igen den
              <input
                type="date"
                required
                min={addDays(currentDate, 1)}
                max={laterJob.deadline || undefined}
                value={revisitOn}
                onChange={(event) => setRevisitOn(event.target.value)}
              />
            </label>
            <p className="help">
              Jobbet visas bland träffarna igen på den valda dagen. Sista
              ansökningsdag: {laterJob.deadline || "saknas"}.
            </p>
            {laterError && <p role="alert">{laterError}</p>}
            <div className="career-actions">
              <button className="button primary">Spara återkomstdatum</button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setLaterJob(null)}
              >
                Avbryt
              </button>
            </div>
          </form>
        </Modal>
      )}
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
