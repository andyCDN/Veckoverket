import { documentUrl } from "./application-materials";
import { jobUrlKey } from "./job-ad-url";
import { sameJobTitle } from "./job-identity";
import { isLocalDate } from "./google-time";
import {
  JOB_WATCH_SOURCES,
  type JobWatchFeed,
  type JobWatchJob,
  type JobWatchSource,
} from "./job-watch-config";

export function validWatchJob(value: unknown): value is JobWatchJob {
  if (!value || typeof value !== "object") return false;
  const j = value as JobWatchJob;
  return (
    [j.role, j.organization, j.url, j.location, j.deadline, j.summary].every(
      (v) => typeof v === "string",
    ) &&
    !!j.role.trim() &&
    !!j.organization.trim() &&
    j.role.length <= 200 &&
    j.organization.length <= 200 &&
    j.url.length <= 2048 &&
    /^https:\/\//i.test(j.url) &&
    !!jobUrlKey(j.url) &&
    (j.sourceId === undefined ||
      JOB_WATCH_SOURCES.some((s) => s.id === j.sourceId)) &&
    (j.text === undefined ||
      (typeof j.text === "string" && j.text.length <= 60000)) &&
    (j.applicationUrl === undefined ||
      (typeof j.applicationUrl === "string" &&
        !!documentUrl(j.applicationUrl))) &&
    (j.additionalUrls === undefined ||
      (Array.isArray(j.additionalUrls) &&
        j.additionalUrls.length <= 20 &&
        j.additionalUrls.every(
          (u) => typeof u === "string" && !!jobUrlKey(u),
        ))) &&
    (!j.deadline || isLocalDate(j.deadline))
  );
}

const timestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function parseJobWatchFeed(value: unknown): JobWatchFeed {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as JobWatchFeed).jobs)
  )
    throw new Error("Ogiltig jobbspaning.");
  const feed = value as JobWatchFeed;
  return {
    updatedAt: timestamp(feed.updatedAt) ? feed.updatedAt : null,
    jobs: feed.jobs.filter(validWatchJob),
    sources: Array.isArray(feed.sources)
      ? feed.sources.filter(
          (s): s is JobWatchSource =>
            !!s &&
            JOB_WATCH_SOURCES.some((source) => source.id === s.id) &&
            timestamp(s.checkedAt) &&
            (s.lastSuccessfulAt === null || timestamp(s.lastSuccessfulAt)) &&
            ["ok", "error"].includes(s.status) &&
            Number.isInteger(s.count) &&
            s.count >= 0,
        )
      : [],
  };
}

export function watchJobUrls(job: JobWatchJob) {
  return [job.url, ...(job.additionalUrls ?? [])];
}

/** Coalesce public feed cards only. Private applications still require an explicit merge. */
export function uniqueWatchJobs(jobs: JobWatchJob[]) {
  const result: JobWatchJob[] = [];
  for (const job of jobs) {
    const urls = new Set(watchJobUrls(job).map(jobUrlKey));
    const index = result.findIndex(
      (saved) =>
        watchJobUrls(saved).some((url) => urls.has(jobUrlKey(url))) ||
        (saved.sourceId !== job.sourceId &&
          !!job.deadline &&
          saved.deadline === job.deadline &&
          sameJobTitle(saved, job)),
    );
    if (index < 0) {
      result.push({ ...job });
      continue;
    }
    const saved = result[index];
    result[index] = {
      ...saved,
      text: saved.text || job.text,
      applicationUrl: saved.applicationUrl || job.applicationUrl,
      sourceId: saved.sourceId || job.sourceId,
      additionalUrls: [
        ...new Set([...watchJobUrls(saved), ...watchJobUrls(job)]),
      ]
        .filter((url) => jobUrlKey(url) !== jobUrlKey(saved.url))
        .slice(0, 20),
    };
  }
  return result;
}
