export const JOB_WATCH_SOURCES = [
  {
    id: "ideella-jobb",
    name: "Ideella jobb",
    url: "https://ideellajobb.se/jobs/",
  },
  {
    id: "stockholms-stad",
    name: "Stockholms stads jobbdatabas",
    url: "https://jobba.stockholm/lediga-jobb/",
  },
] as const;

export const JOB_WATCH_PROFILE =
  "Stockholmsområdet eller distans: utredning, handläggning, projektledning, kommunikation, påverkan och verksamhetsledning.";

export type JobWatchSourceId = (typeof JOB_WATCH_SOURCES)[number]["id"];
export type JobWatchJob = {
  role: string;
  organization: string;
  url: string;
  location: string;
  deadline: string;
  summary: string;
  text?: string;
  sourceId?: JobWatchSourceId;
  additionalUrls?: string[];
  applicationUrl?: string;
};
export type JobWatchSource = {
  id: JobWatchSourceId;
  checkedAt: string;
  lastSuccessfulAt: string | null;
  status: "ok" | "error";
  count: number;
};
export type JobWatchFeed = {
  updatedAt: string | null;
  jobs: JobWatchJob[];
  sources?: JobWatchSource[];
};
