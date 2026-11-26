import type { AppData } from "./types";
import { jobUrlKey } from "./job-ad-url";
import { NO_DAILY_FOCUS } from "./daily-check-in";

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
  const dismissedJobUrls = key
    ? (data.dismissedJobUrls?.filter((value) => jobUrlKey(value) !== key) ?? [])
    : [];
  return { ...data, dismissedJobUrls };
}

export function removeJobApplication(data: AppData, id: string): AppData {
  const job = data.applications?.find((application) => application.id === id);
  if (!job) return data;
  const key = `application:${id}`;
  const next: AppData = {
    ...data,
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
  return dismissJobUrl(next, job.advertisement?.url ?? "");
}
