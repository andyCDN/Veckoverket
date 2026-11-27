import type { AppData } from "./types";
import { jobUrlKey } from "./job-ad-url";
import { NO_DAILY_FOCUS } from "./daily-check-in";
import { applicationAdvertisementUrls } from "./job-identity";

export function validateDismissedJobUrls(value: unknown) {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.length > 10000 ||
    value.some(
      (url) => typeof url !== "string" || url.length > 2048 || !jobUrlKey(url),
    )
  )
    throw new Error("Listan över bortvalda jobb är ogiltig.");
}

export function dismissJobUrl(data: AppData, url: string): AppData {
  const key = jobUrlKey(url);
  if (!key || data.dismissedJobUrls?.some((value) => jobUrlKey(value) === key))
    return data;
  return {
    ...data,
    dismissedJobUrls: [...(data.dismissedJobUrls ?? []), key].slice(-10000),
  };
}

export function restoreDismissedJobs(data: AppData, url?: string): AppData {
  const key = url === undefined ? undefined : jobUrlKey(url);
  if (url !== undefined && !key) return data;
  const decisions = data.jobSearch?.decisions ?? [];
  const matching = decisions.filter(
    (decision) =>
      decision.kind === "dismissed" &&
      (!key ||
        [decision.url, ...decision.additionalUrls].some(
          (value) => jobUrlKey(value) === key,
        )),
  );
  const keys = new Set(
    matching
      .flatMap((decision) => [decision.url, ...decision.additionalUrls])
      .map(jobUrlKey),
  );
  if (key) keys.add(key);
  const dismissedJobUrls = key
    ? (data.dismissedJobUrls?.filter((value) => !keys.has(jobUrlKey(value))) ??
      [])
    : [];
  return {
    ...data,
    dismissedJobUrls,
    ...(data.jobSearch
      ? {
          jobSearch: {
            ...data.jobSearch,
            decisions: decisions.filter((item) => !matching.includes(item)),
          },
        }
      : {}),
  };
}

export function removeJobApplication(data: AppData, id: string): AppData {
  const job = data.applications?.find((application) => application.id === id);
  if (!job) return data;
  const key = `application:${id}`;
  const next: AppData = {
    ...data,
    ...(data.jobSearch?.weeklyPicks
      ? {
          jobSearch: {
            ...data.jobSearch,
            weeklyPicks: Object.fromEntries(
              Object.entries(data.jobSearch.weeklyPicks).map(([week, ids]) => [
                week,
                ids.filter((value) => value !== id),
              ]),
            ),
          },
        }
      : {}),
    weeks: Object.fromEntries(
      Object.entries(data.weeks).map(([week, plan]) => [
        week,
        {
          ...plan,
          activities: plan.activities.map((activity) =>
            activity.jobApplicationIds?.includes(id)
              ? {
                  ...activity,
                  jobApplicationIds: activity.jobApplicationIds.filter(
                    (value) => value !== id,
                  ),
                }
              : activity,
          ),
        },
      ]),
    ),
    applications: data.applications!.filter(
      (application) => application.id !== id,
    ),
    ...(data.careerActions
      ? {
          careerActions: data.careerActions.filter(
            (action) => action.applicationId !== id,
          ),
        }
      : {}),
    ...(data.dailyCheckIns
      ? {
          dailyCheckIns: Object.fromEntries(
            Object.entries(data.dailyCheckIns).map(([date, checkIn]) => [
              date,
              {
                ...checkIn,
                applicationIds: checkIn.applicationIds.filter(
                  (value) => value !== id,
                ),
                ...(checkIn.completedKeys
                  ? {
                      completedKeys: checkIn.completedKeys.filter(
                        (value) => value !== key,
                      ),
                    }
                  : {}),
                ...(checkIn.deferredKeys
                  ? {
                      deferredKeys: checkIn.deferredKeys.filter(
                        (value) => value !== key,
                      ),
                    }
                  : {}),
                focus:
                  checkIn.focus.kind === "application" &&
                  checkIn.focus.id === id
                    ? { ...NO_DAILY_FOCUS }
                    : checkIn.focus,
              },
            ]),
          ),
        }
      : {}),
  };
  return applicationAdvertisementUrls(job).reduce(
    (state, url) => dismissJobUrl(state, url),
    next,
  );
}
