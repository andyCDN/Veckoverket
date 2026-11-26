import type { AppData, JobApplication } from "./types";
import { jobAdvertisementUrl, jobUrlKey } from "./job-ad-url";
import { recordApplicationEvent } from "./applications";
import { validateApplicationMaterials } from "./application-materials";
import { isLocalDate } from "./google-time";

type Identity = Pick<JobApplication, "role" | "organization" | "advertisement">;
export function applicationAdvertisementUrls(job: Identity) {
  return [
    ...new Set(
      [
        job.advertisement?.url ?? "",
        ...(job.advertisement?.additionalUrls ?? []),
      ]
        .map((url) => jobAdvertisementUrl(url))
        .filter((url): url is string => Boolean(url)),
    ),
  ];
}
const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("sv-SE")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
export function jobIdentity(
  job: Pick<JobApplication, "role" | "organization">,
) {
  const organization = normalize(job.organization).replace(
    / (?:ab|aktiebolag|publ)$/,
    "",
  );
  let role = normalize(job.role);
  for (const suffix of [
    ` till ${organization}`,
    ` hos ${organization}`,
    ` på ${organization}`,
    ` at ${organization}`,
    ` ${organization}`,
  ])
    if (organization && role.endsWith(suffix)) {
      role = role.slice(0, -suffix.length).trim();
      break;
    }
  return { role, organization };
}
export function sameJobTitle(
  a: Pick<JobApplication, "role" | "organization">,
  b: Pick<JobApplication, "role" | "organization">,
) {
  const left = jobIdentity(a),
    right = jobIdentity(b);
  return Boolean(
    left.role &&
    left.organization &&
    left.role === right.role &&
    left.organization === right.organization,
  );
}
export function jobMatches(incoming: Identity, existing: JobApplication[]) {
  const urls = new Set(applicationAdvertisementUrls(incoming).map(jobUrlKey));
  return existing
    .filter((job) => job.id !== (incoming as JobApplication).id)
    .flatMap<{ job: JobApplication; reason: "url" | "title" }>((job) => {
      if (
        applicationAdvertisementUrls(job).some((url) =>
          urls.has(jobUrlKey(url)),
        )
      )
        return [{ job, reason: "url" as const }];
      if (sameJobTitle(incoming, job))
        return [{ job, reason: "title" as const }];
      return [];
    })
    .sort((a, b) => Number(b.reason === "url") - Number(a.reason === "url"));
}
export function mergeJobAdvertisement(
  data: AppData,
  id: string,
  incoming: JobApplication,
  now = new Date(),
): AppData {
  const existing = data.applications?.find((job) => job.id === id);
  if (!existing)
    throw new Error("Jobbet finns inte kvar. Granska annonsen igen.");
  validateApplicationMaterials(incoming);
  if (incoming.deadline && !isLocalDate(incoming.deadline))
    throw new Error("Kontrollera sista ansökningsdagen.");
  const main = existing.advertisement?.url || incoming.advertisement?.url || "";
  const seen = new Set<string>(),
    urls = [
      ...applicationAdvertisementUrls(existing),
      ...applicationAdvertisementUrls(incoming),
    ].filter((url) => {
      const key = jobUrlKey(url)!;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const additionalUrls = urls.filter(
    (url) => jobUrlKey(url) !== jobUrlKey(main),
  );
  if (additionalUrls.length > 20)
    throw new Error(
      "Jobbet har redan många annonskällor. Ta bort en äldre länk först.",
    );
  const advertisement = {
    ...existing.advertisement,
    url: main,
    text: existing.advertisement?.text || incoming.advertisement?.text || "",
    ...(additionalUrls.length ? { additionalUrls } : {}),
    ...(!existing.advertisement?.applicationUrl &&
    incoming.advertisement?.applicationUrl
      ? { applicationUrl: incoming.advertisement.applicationUrl }
      : {}),
  };
  if (
    JSON.stringify(advertisement) === JSON.stringify(existing.advertisement) &&
    (existing.deadline || incoming.deadline) === existing.deadline
  )
    return data;
  const updated = recordApplicationEvent(
    {
      ...existing,
      advertisement,
      deadline: existing.deadline || incoming.deadline,
    },
    "note",
    "Annonsunderlag från ytterligare en källa har kopplats till ansökan.",
    now,
  );
  validateApplicationMaterials(updated);
  return {
    ...data,
    applications: data.applications!.map((job) =>
      job.id === id ? updated : job,
    ),
  };
}
