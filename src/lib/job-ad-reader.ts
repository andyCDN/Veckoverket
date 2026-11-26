import { isLocalDate } from "./google-time";
import { linkedInJobUrl } from "./linkedin-import";
import { loadJobDetails } from "./linkedin-details-client";
import { platsbankenJobUrl } from "./job-ad-url";
import { documentUrl } from "./application-materials";
import { sameJobTitle } from "./job-identity";
export { platsbankenJobUrl, jobAdvertisementUrl } from "./job-ad-url";
import {
  plainText,
  type JobDetails,
} from "../../supabase/functions/_shared/linkedin-job-details";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const date = (value: unknown) => {
  const day = typeof value === "string" ? value.slice(0, 10) : "";
  return isLocalDate(day) ? day : "";
};
export type JobAdDetails = JobDetails & {
  additionalUrls?: string[];
  applicationUrl?: string;
};

export function parsePlatsbankenAd(input: unknown, id: string): JobAdDetails {
  const ad = record(input);
  if (ad.removed === true)
    throw new Error(
      "Annonsen har tagits bort från Platsbanken. Klistra in annonstexten eller fyll i uppgifterna nedan.",
    );
  if (ad.id !== id || typeof ad.headline !== "string" || !ad.headline.trim())
    throw new Error(
      "Svaret från Platsbanken innehöll inga läsbara annonsuppgifter. Klistra in annonstexten eller fyll i uppgifterna nedan.",
    );
  const employer = record(ad.employer),
    description = record(ad.description),
    address = record(ad.workplace_address);
  const apply = record(ad.application_details).url;
  const applicationUrl =
    typeof apply === "string" ? documentUrl(apply) : undefined;
  return {
    ...(applicationUrl ? { applicationUrl } : {}),
    role: plainText(ad.headline, 200),
    organization:
      plainText(employer.name, 200) || plainText(employer.workplace, 200),
    description:
      plainText(description.text, 60000) ||
      plainText(description.text_formatted, 60000),
    location:
      plainText(address.city, 500) || plainText(address.municipality, 500),
    employmentType: [
      plainText(record(ad.working_hours_type).label, 150),
      plainText(record(ad.employment_type).label, 150),
    ]
      .filter(Boolean)
      .join(" · "),
    deadline: date(ad.application_deadline),
    postedOn: date(ad.publication_date),
    validThrough: date(ad.last_publication_date),
    salary: plainText(ad.salary_description, 500),
  };
}

export async function readJobAdvertisement(
  url: string,
  signal: AbortSignal,
  hint?: { role: string; organization: string },
): Promise<JobAdDetails> {
  const platsbanken = platsbankenJobUrl(url);
  if (!platsbanken) {
    if (linkedInJobUrl(url)) return loadJobDetails(url, signal);
    if (hint?.role.trim() && hint.organization.trim()) {
      let result: Response;
      try {
        result = await fetch(
          `https://jobsearch.api.jobtechdev.se/search?${new URLSearchParams({ q: `${hint.role} ${hint.organization}`, limit: "10" })}`,
          {
            credentials: "omit",
            referrerPolicy: "no-referrer",
            redirect: "error",
            headers: { Accept: "application/json" },
            signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
          },
        );
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error(
          "Annonsunderlaget kunde inte hämtas. Klistra in den fullständiga annonstexten nedan.",
        );
      }
      if (!result.ok)
        throw new Error(
          "Annonsunderlaget kunde inte hämtas. Klistra in den fullständiga annonstexten nedan.",
        );
      const body = await result.json().catch(() => null);
      const hits: unknown[] = Array.isArray(body?.hits) ? body.hits : [];
      const matches = hits.filter((value) => {
        const ad = record(value);
        return (
          typeof ad.id === "string" &&
          /^[1-9]\d{0,23}$/.test(ad.id) &&
          sameJobTitle(hint, {
            role: plainText(ad.headline, 200),
            organization: plainText(record(ad.employer).name, 200),
          })
        );
      });
      if (matches.length !== 1)
        throw new Error(
          "Ingen entydig annons hittades i Platsbanken. Klistra in den fullständiga annonstexten nedan och granska uppgifterna.",
        );
      const ad = record(matches[0]);
      return {
        ...parsePlatsbankenAd(ad, ad.id as string),
        additionalUrls: [
          `https://arbetsformedlingen.se/platsbanken/annonser/${ad.id}`,
        ],
      };
    }
    throw new Error(
      "Automatisk läsning stöder Platsbanken och LinkedIn. Länken är kvar; klistra in annonstexten eller fyll i uppgifterna nedan.",
    );
  }
  const id = platsbanken.split("/").at(-1)!;
  let response: Response;
  try {
    // The public JobTech API supports browser reads. Account credentials and
    // Supabase session tokens must never be sent to an advertisement source.
    response = await fetch(`https://jobsearch.api.jobtechdev.se/ad/${id}`, {
      headers: { Accept: "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? "Platsbanken tog för lång tid att svara. Försök igen eller klistra in annonstexten."
        : "Kunde inte ansluta till Platsbanken. Försök igen eller klistra in annonstexten.",
    );
  }
  if (!response.ok)
    throw new Error(
      [404, 410].includes(response.status)
        ? "Annonsen finns inte längre i Platsbanken. Klistra in annonstexten eller fyll i uppgifterna nedan."
        : response.status === 429
          ? "Platsbanken tar emot för många anrop just nu. Vänta en stund och försök igen."
          : "Annonsen kunde inte hämtas från Platsbanken. Försök igen eller klistra in annonstexten.",
    );
  const ad: unknown = await response.json().catch(() => null);
  return parsePlatsbankenAd(ad, id);
}
