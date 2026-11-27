import type { AppData, JobWatchDecision, JobSearchData } from "./types";
import type { JobWatchJob } from "./job-watch-config";
import { addDays, monday, planningBoundary } from "./date";
import { isLocalDate } from "./google-time";
import { jobUrlKey } from "./job-ad-url";
import { watchJobUrls } from "./job-watch-feed";
import { isClosedApplication } from "./application-overview";
import { dismissJobUrl } from "./job-removal";
import { validateJobCvProfile } from "./job-cv-match";

export const DISMISSAL_REASONS = {
  role: "Fel inriktning",
  requirements: "Kraven passar inte",
  location: "Fel placering",
  other: "Annat",
} as const;

export function weeklyJobIds(data: AppData, week: string) {
  const active = new Set(
    (data.applications ?? [])
      .filter((job) => !isClosedApplication(job))
      .map((job) => job.id),
  );
  return (data.jobSearch?.weeklyPicks?.[week] ?? []).filter((id) =>
    active.has(id),
  );
}

export function toggleWeeklyJob(
  data: AppData,
  week: string,
  id: string,
): AppData {
  if (!isLocalDate(week) || monday(week) !== week)
    throw new Error("Välj en giltig vecka.");
  const job = data.applications?.find((item) => item.id === id);
  if (!job || isClosedApplication(job))
    throw new Error("Välj ett jobb som har en pågående process.");
  const ids = weeklyJobIds(data, week);
  if (!ids.includes(id) && ids.length >= 3)
    throw new Error(
      "Tre jobb är valda. Ta bort ett val innan du väljer ett annat.",
    );
  return {
    ...data,
    jobSearch: {
      ...data.jobSearch,
      weeklyPicks: {
        ...data.jobSearch?.weeklyPicks,
        [week]: ids.includes(id)
          ? ids.filter((value) => value !== id)
          : [...ids, id],
      },
    },
  };
}

export function decisionForJob(
  decisions: JobWatchDecision[] | undefined,
  urls: string[],
) {
  const keys = new Set(urls.map(jobUrlKey).filter(Boolean));
  return decisions?.find((decision) =>
    [decision.url, ...decision.additionalUrls].some((url) =>
      keys.has(jobUrlKey(url)),
    ),
  );
}

function saveDecision(data: AppData, decision: JobWatchDecision): AppData {
  return {
    ...data,
    jobSearch: {
      ...data.jobSearch,
      decisions: [
        ...(data.jobSearch?.decisions ?? []).filter(
          (item) =>
            !decisionForJob([item], [decision.url, ...decision.additionalUrls]),
        ),
        decision,
      ].slice(-1000),
    },
  };
}

export function decideWatchJob(
  data: AppData,
  job: JobWatchJob,
  choice:
    | { kind: "later"; revisitOn: string }
    | { kind: "dismissed"; reason?: JobWatchDecision["reason"] },
  now = new Date(),
): AppData {
  const urls = [
    ...new Set(
      watchJobUrls(job)
        .map(jobUrlKey)
        .filter((url): url is string => !!url),
    ),
  ];
  if (!urls.length) throw new Error("Jobbets annonslänk saknas.");
  if (
    choice.kind === "later" &&
    (!isLocalDate(choice.revisitOn) ||
      choice.revisitOn < addDays(planningBoundary(now).date, 1) ||
      (job.deadline && choice.revisitOn > job.deadline))
  )
    throw new Error(
      "Välj en dag efter idag, senast annonsens sista ansökningsdag.",
    );
  if (
    choice.kind === "dismissed" &&
    choice.reason &&
    !Object.hasOwn(DISMISSAL_REASONS, choice.reason)
  )
    throw new Error("Välj en giltig orsak till bortvalet.");
  const next = saveDecision(data, {
    url: urls[0],
    additionalUrls: urls.slice(1),
    role: job.role,
    organization: job.organization,
    deadline: job.deadline,
    ...choice,
    decidedAt: now.toISOString(),
  });
  return choice.kind === "dismissed"
    ? urls.reduce((state, url) => dismissJobUrl(state, url), next)
    : next;
}

export function clearJobDecision(data: AppData, url: string): AppData {
  const decision = decisionForJob(data.jobSearch?.decisions, [url]);
  if (!decision) return data;
  return {
    ...data,
    jobSearch: {
      ...data.jobSearch,
      decisions: data.jobSearch!.decisions!.filter((item) => item !== decision),
    },
  };
}

export function updateDismissalReason(
  data: AppData,
  url: string,
  reason?: JobWatchDecision["reason"],
): AppData {
  const previous = decisionForJob(data.jobSearch?.decisions, [url]);
  if (!previous || previous.kind !== "dismissed") return data;
  if (reason && !Object.hasOwn(DISMISSAL_REASONS, reason))
    throw new Error("Orsaken är ogiltig.");
  const { reason: _previousReason, ...rest } = previous;
  return saveDecision(data, { ...rest, ...(reason ? { reason } : {}) });
}

export function validateJobSearchData(
  value: unknown,
): asserts value is JobSearchData | undefined {
  if (value === undefined) return;
  const fail = () => {
    throw new Error("Jobbvyns sparade val är ogiltiga.");
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const data = value as JobSearchData;
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.length > 0 && v.length <= max;
  const url = (v: unknown) => text(v, 2048) && !!jobUrlKey(v as string);
  if (data.weeklyPicks !== undefined) {
    if (
      !data.weeklyPicks ||
      typeof data.weeklyPicks !== "object" ||
      Array.isArray(data.weeklyPicks) ||
      Object.keys(data.weeklyPicks).length > 1000
    )
      fail();
    for (const [week, ids] of Object.entries(data.weeklyPicks))
      if (
        !isLocalDate(week) ||
        monday(week) !== week ||
        !Array.isArray(ids) ||
        ids.length > 3 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !text(id, 200))
      )
        fail();
  }
  if (data.decisions !== undefined) {
    if (!Array.isArray(data.decisions) || data.decisions.length > 1000) fail();
    const seen = new Set<string>();
    for (const d of data.decisions) {
      if (
        !d ||
        !url(d.url) ||
        !Array.isArray(d.additionalUrls) ||
        d.additionalUrls.length > 20 ||
        d.additionalUrls.some((v) => !url(v)) ||
        !text(d.role, 200) ||
        !text(d.organization, 200) ||
        !(
          d.deadline === "" ||
          (typeof d.deadline === "string" && isLocalDate(d.deadline))
        ) ||
        !["later", "dismissed"].includes(d.kind) ||
        !text(d.decidedAt, 100) ||
        !Number.isFinite(Date.parse(d.decidedAt)) ||
        (d.kind === "later" &&
          (!isLocalDate(d.revisitOn ?? "") ||
            (d.deadline && d.revisitOn! > d.deadline))) ||
        (d.reason !== undefined && !Object.hasOwn(DISMISSAL_REASONS, d.reason))
      )
        fail();
      for (const value of [d.url, ...d.additionalUrls]) {
        const key = jobUrlKey(value)!;
        if (seen.has(key)) fail();
        seen.add(key);
      }
    }
  }
  validateJobCvProfile(data.cvProfile);
}
