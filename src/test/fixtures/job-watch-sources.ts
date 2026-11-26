import type { JobWatchJob } from "../../lib/job-watch-config";

export const sourceJob: JobWatchJob = {
  role: "Kommunikationsstrateg",
  organization: "Föreningen",
  url: "https://ideellajobb.se/jobs/kommunikationsstrateg/",
  location: "Stockholm",
  deadline: "2026-12-06",
  summary: "",
  sourceId: "ideella-jobb",
};
export const stockholmJob: JobWatchJob = {
  ...sourceJob,
  role: "Utredare",
  organization: "Stockholms stad, Stadsledningskontoret",
  url: "https://jobba.stockholm/lediga-jobb/platsannonser/utredare-12345",
  sourceId: "stockholms-stad",
};
export const sourceText =
  "En fullständig annons med arbetsuppgifter, kvalifikationer och information om hur ansökan ska lämnas in. Arbeta med strategi, projektledning och hållbar utveckling tillsammans med oss.";
export function ideellaCard(job = sourceJob) {
  return `<div class="single-advert"><div class="content-block"><div class="title"><a href="${job.url}">${job.role}</a></div><div class="sub-title">${job.organization}</div></div><li class="address">${job.location}</li><li class="date">Ansök senast: ${job.deadline}</li></div>`;
}
export const ideellaListing = `${ideellaCard()}<div id="load-more" data-total-pages="2" data-query='{ "post_type":"job", "meta_query":{"0":{"key":"job_status","value":"approved"}}}'></div><script>var ajax_call = {"nonce":"public123"};</script>`;
export function stockholmListing(jobs = [stockholmJob], count = jobs.length) {
  return `<div class="js-job-ads-filter-form" data-param-ads-count="${count}"></div><div class="job-ads-list-container"><ul>${jobs.map((job) => `<li><h2><a href="${job.url}">${job.role}</a></h2><p>${job.organization}</p><p class="job-ads-application-deadline">Sista ansökningsdatum: ${job.deadline}</p></li>`).join("")}</ul></div>`;
}
export function sourceAdvertisement(job = sourceJob) {
  if (job.sourceId === "stockholms-stad")
    return `<article><h1 id="job-ad-heading">${job.role}</h1><dl class="job-ad__infobox"><time datetime="${job.deadline}"></time></dl><div class="job-ad__description"><p>${sourceText}</p></div><a class="btn--primary" href="https://stockholmsstad.varbi.com/se/what:login/jobID:12345/apply:1">Ansök</a></article>`;
  return `<main><div class="single-advert"><div class="content-block"><div class="title">${job.role}</div><div class="description"><p>${sourceText}</p></div></div><li class="date">Ansök senast: ${job.deadline}</li><a class="btn-theme" href="https://example.org/apply">Ansök här</a></div></main>`;
}
