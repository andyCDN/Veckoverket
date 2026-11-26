"use client";
import { useEffect, useState } from "react";
import { today, uid } from "@/lib/date";
import type { JobApplication } from "@/lib/types";
import { appPath } from "@/lib/app-path";
import { jobUrlKey } from "@/lib/job-ad-url";

type Job = {
  role: string;
  organization: string;
  url: string;
  location: string;
  deadline: string;
  summary: string;
};
type Feed = { updatedAt: string | null; jobs: Job[] };
function validJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const j = value as Job;
  return (
    [j.role, j.organization, j.url, j.location, j.deadline, j.summary].every(
      (v) => typeof v === "string",
    ) &&
    !!j.role.trim() &&
    !!j.organization.trim() &&
    j.url.length <= 2048 &&
    /^https:\/\//i.test(j.url) &&
    !!jobUrlKey(j.url) &&
    (!j.deadline || /^\d{4}-\d{2}-\d{2}$/.test(j.deadline))
  );
}
const key = (url: string) => jobUrlKey(url) ?? "";
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
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
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
    fetch(
      "https://raw.githubusercontent.com/andyCDN/Veckoverket/main/public/jobbspaning.json?t=" +
        Date.now(),
      { cache: "no-store", signal: controller.signal },
    )
      .catch(() =>
        fetch(appPath("/jobbspaning.json"), {
          cache: "no-store",
          signal: controller.signal,
        }),
      )
      .then(async (response) => {
        if (!response.ok) throw new Error("Jobbspaningen kunde inte hämtas.");
        const value = (await response.json()) as Feed;
        if (!Array.isArray(value.jobs)) throw new Error("Ogiltig jobbspaning.");
        if (!controller.signal.aborted) {
          setFeed({
            updatedAt:
              typeof value.updatedAt === "string" ? value.updatedAt : null,
            jobs: value.jobs.filter(validJob),
          });
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
    applications.map((a) => key(a.advertisement?.url || "")),
  );
  const hidden = new Set([...dismissedUrls, ...legacyHidden].map(key));
  const visible = (feed?.jobs ?? []).filter(
    (j) =>
      (!j.deadline || j.deadline >= today()) &&
      !seen.has(key(j.url)) &&
      !hidden.has(key(j.url)),
  );
  return (
    <section className="job-workspace stack" aria-label="Jobbspaning">
      <div className="job-toolbar">
        <div>
          <h2>Jobbspaning</h2>
          <p>
            {feed?.updatedAt
              ? "Senast uppdaterad: " +
                new Date(feed.updatedAt).toLocaleString("sv-SE", {
                  timeZone: "Europe/Stockholm",
                })
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
      {visible.map((j) => (
        <article
          key={j.url}
          className="career-card stack"
          aria-label={`${j.role} · ${j.organization}`}
        >
          <h3>{j.role}</h3>
          <p>
            {j.organization} · {j.location}
          </p>
          <p>
            {j.deadline
              ? "Sök senast " + j.deadline
              : "Sista ansökningsdag saknas"}
          </p>
          <p>{j.summary}</p>
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
                  advertisement: { url: j.url, text: "" },
                })
              }
            >
              Spara jobb
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
