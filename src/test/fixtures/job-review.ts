import type { JobWatchJob } from "../../lib/job-watch-config";

export const reviewText = `Arbetsuppgifter
Du leder vårt påverkansarbete och tar fram remissvar. Du analyserar politiska beslutsprocesser och samordnar arbetet med opinionsbildning.
Din bakgrund
Du har relevant högskoleutbildning inom statsvetenskap eller motsvarande. Du har flera års erfarenhet av politiskt arbete.
Meriterande
Erfarenhet av EU-samordning är meriterande.
Övrigt
Välkommen med din ansökan.`;

export function reviewJobFixture(
  patch: Partial<JobWatchJob> = {},
): JobWatchJob {
  return {
    role: "Politiskt sakkunnig",
    organization: "Förbundet",
    url: "https://example.org/jobs/policy",
    location: "Stockholm",
    deadline: "2026-12-06",
    summary: "En annons att bedöma.",
    text: reviewText,
    ...patch,
  };
}
