import { load } from "cheerio";
import { JOB_WATCH_SOURCES } from "../src/lib/job-watch-config.ts";

export { JOB_WATCH_SOURCES };
const normalize = (value) => value.normalize("NFKC").toLocaleLowerCase("sv-SE");
const rolePattern =
  /utred|handlägg|sakkunn|strateg|projektled|projektchef|projektansvar|projektkoord|samordn|verksamhetsutveckl|organisationsutveckl|utvecklingsled|kommunikat|kommunikation|pressansvar|presschef|public affairs|opinions|påverkan|intressepolit|policy|politiskt|kansli|generalsekreter|förbundssekreter|förbundschef|verksamhetschef|enhetschef|avdelningschef|förvaltningschef|insaml|fundrais|chefssekreter/iu;
const specialistPattern =
  /sjuksköter|undersköter|socialsekreter|socionom|biståndshandlägg|hemtjänst|vård|omsorgsboende|gruppbostad|servicehus|\blss\b|förskol|\brektor\b/iu;
const locationPattern =
  /stockholm|sundbyberg|solna|nacka|huddinge|haninge|tyresö|täby|danderyd|lidingö|sollentuna|järfälla|botkyrka|södertälje|salem|vaxholm|värmdö|vallentuna|upplands|sigtuna|nynäshamn|norrtälje|ekerö|österåker|bromma|farsta|kista|hägersten|älvsjö|skarpnäck|skärholmen|vällingby|hässelby|spånga|enskede|distans|remote|flexibelt|hela sverige|ej specificerad/iu;

const adPaths = {
  "ideella-jobb": /^\/jobs\/[^/]+\/?$/u,
  "stockholms-stad": /^\/lediga-jobb\/platsannonser\/[^/]+\/?$/u,
  "jobba-statligt": /^\/jobb\/\d{4}\/[a-z]+\/\d{2,4}\/[^/]+\/?$/iu,
};

export function matchesWatchProfile(job) {
  return (
    rolePattern.test(job.role) &&
    !specialistPattern.test(job.role) &&
    (job.sourceId === "stockholms-stad" || locationPattern.test(job.location))
  );
}

export function sourceUrl(raw, source, advertisement = false) {
  if (typeof raw !== "string" || !raw.trim()) return;
  try {
    const url = new URL(raw, source.url);
    const base = new URL(source.url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== base.hostname ||
      url.port ||
      url.username ||
      url.password
    )
      return;
    if (advertisement && !adPaths[source.id]?.test(url.pathname)) return;
    url.hash = "";
    return url.href;
  } catch {
    /* Invalid source links are never followed. */
  }
}

function safeApplicationUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (
      value &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.href.length <= 2048
    )
      return url.href;
  } catch {
    /* Keep the advertisement link when no safe application URL exists. */
  }
}

export function htmlText(html, limit = 60000) {
  const $ = load(html || "");
  $("script,style,noscript,iframe,form").remove();
  $("br").replaceWith("\n");
  $("p,div,li,h1,h2,h3,h4,section").append("\n");
  return $.root()
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

const clean = (value, limit = 200) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
function date(value) {
  const match = value?.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (
    match &&
    new Date(`${match}T12:00:00Z`).toISOString().slice(0, 10) === match
  )
    return match;
  throw new Error("Annonsens ansökningsdag saknas eller har ändrat format.");
}

export function parseIdeellaListing(html) {
  const source = JOB_WATCH_SOURCES[0],
    $ = load(html);
  const jobs = $(".single-advert")
    .toArray()
    .map((element) => {
      const card = $(element),
        link = card.find(".title a").first();
      const url = sourceUrl(link.attr("href"), source, true);
      const role = clean(link.text()),
        organization = clean(card.find(".sub-title").text());
      if (!url || !role || !organization)
        throw new Error("Ideella jobbs annonslista har ändrat format.");
      return {
        role,
        organization,
        url,
        location: clean(card.find("li.address").text()),
        deadline: date(card.find("li.date").text()),
        summary: "",
        sourceId: source.id,
      };
    });
  if (
    !jobs.length &&
    !$("h5")
      .toArray()
      .some((e) => /^0 jobb$/u.test(clean($(e).text())))
  )
    throw new Error("Ideella jobbs annonslista kunde inte läsas.");
  const more = $("#load-more");
  if (!more.length) return { jobs, pages: 1 };
  const pages = Number(more.attr("data-total-pages"));
  const nonce = html.match(
    /var ajax_call\s*=\s*\{[^\n]*?"nonce"\s*:\s*"([a-zA-Z0-9]+)"/,
  )?.[1];
  let query;
  try {
    query = JSON.parse(more.attr("data-query"));
  } catch {
    /* Validate below. */
  }
  if (
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 30 ||
    !nonce ||
    query?.post_type !== "job"
  )
    throw new Error("Ideella jobbs sidindelning kunde inte läsas.");
  return { jobs, pages, nonce, query };
}

export function ideellaPageBody(listing, page) {
  const body = new URLSearchParams({
    action: "get_newsfeeds_posts",
    total_pages: String(listing.pages),
    current_pages: String(page),
    nonce: listing.nonce,
  });
  function append(value, prefix) {
    for (const [key, item] of Object.entries(value)) {
      if (item && typeof item === "object") append(item, `${prefix}[${key}]`);
      else body.set(`${prefix}[${key}]`, String(item));
    }
  }
  append(listing.query, "query");
  return body;
}

export function parseStockholmListing(html) {
  const source = JOB_WATCH_SOURCES[1],
    $ = load(html);
  const count = Number(
    $(".js-job-ads-filter-form").attr("data-param-ads-count"),
  );
  const jobs = $(".job-ads-list-container > ul > li")
    .toArray()
    .map((element) => {
      const card = $(element),
        link = card.find("h2 a").first();
      const url = sourceUrl(link.attr("href"), source, true),
        role = clean(link.text());
      const organization =
        clean(
          card.find("p").not(".job-ads-application-deadline").first().text(),
        ) || "Stockholms stad";
      if (!url || !role)
        throw new Error("Stockholms stads annonslista har ändrat format.");
      return {
        role,
        organization,
        url,
        location: "Stockholm",
        deadline: date(card.find(".job-ads-application-deadline").text()),
        summary: "",
        sourceId: source.id,
      };
    });
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    count > 500 ||
    (count > 0 && !jobs.length)
  )
    throw new Error("Stockholms stads sidindelning kunde inte läsas.");
  return {
    jobs,
    count,
    pages: jobs.length ? Math.ceil(count / jobs.length) : 1,
  };
}

export function parseWatchAdvertisement(html, job) {
  const $ = load(html),
    ideella = job.sourceId === "ideella-jobb";
  const description = ideella
    ? $("main .content-block .description").first()
    : $(".job-ad__description").first();
  const role = clean(
    ideella
      ? description.siblings(".title").text()
      : $("#job-ad-heading").text(),
  );
  const text = htmlText(description.html());
  if (!role || normalize(role) !== normalize(job.role) || text.length < 100)
    throw new Error("Den fullständiga annonsen kunde inte verifieras.");
  const dateText = ideella
    ? $("main li.date").first().text()
    : $(".job-ad__infobox time").first().attr("datetime");
  const application = ideella
    ? description
        .closest(".single-advert")
        .find("a.btn-theme")
        .filter((_, e) => /ansök/iu.test($(e).text()))
        .first()
    : $(".job-ad__application-info a.btn--primary").first();
  const applicationUrl = safeApplicationUrl(application.attr("href"), job.url);
  return {
    ...job,
    deadline: date(dateText),
    text,
    summary: clean(text, 420),
    ...(applicationUrl ? { applicationUrl } : {}),
  };
}

function statligtAdId(url) {
  return [...new URL(url).pathname.matchAll(/-([1-9]\d{6,9})(?=-|\/$|$)/gu)].at(
    -1,
  )?.[1];
}

export function parseStatligtListing(html) {
  const $ = load(html);
  let tab;
  try {
    tab = JSON.parse($("#__NEXT_DATA__").html()).props.pageProps.data.body
      .jobTab;
  } catch {
    /* Validate the public search model below. */
  }
  const count = tab?.pagination?.totalDisplay;
  if (
    !Array.isArray(tab?.items) ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 10000 ||
    (count > 0 && !tab.items.length)
  )
    throw new Error("Jobba statligts sökresultat kunde inte läsas.");
  const source = JOB_WATCH_SOURCES.find((s) => s.id === "jobba-statligt");
  const jobs = tab.items.map((item) => {
    const url = sourceUrl(item.url, source, true),
      role = clean(item.heading),
      organization = clean(item.agency);
    if (
      item.modelType !== "GovJobAdPage" ||
      !url ||
      !statligtAdId(url) ||
      !role
    )
      throw new Error("Jobba statligts annonslista har ändrat format.");
    return {
      role,
      organization,
      url,
      location: clean(item.location),
      deadline: "",
      summary: "",
      sourceId: source.id,
    };
  });
  return { jobs, count, filters: tab.search?.searchFilters ?? [] };
}

export function statligtPartitions(listing, params) {
  const leaves = (items) =>
    items.flatMap((item) => (item.items?.length ? leaves(item.items) : [item]));
  for (const key of ["Occupation", "Area", "Agency"]) {
    const filter = listing.filters.find((f) => f.queryName === key);
    if (!Array.isArray(filter?.items)) continue;
    const values = params.get(key)?.split(",");
    const options = values
      ? leaves(filter.items).filter((item) => values.includes(item.value))
      : filter.items;
    const active = (options ?? []).filter(
      (item) =>
        /^\d{1,12}$/u.test(item.value) &&
        Number.isInteger(item.hitCount) &&
        item.hitCount > 0,
    );
    if (
      active.length < 2 ||
      active.reduce((sum, item) => sum + item.hitCount, 0) < listing.count
    )
      continue;
    return active.map((item) => {
      const partition = new URLSearchParams(params);
      // Parent occupation values are headings; the public form sends their leaves.
      partition.set(
        key,
        leaves([item])
          .filter((leaf) => /^\d{1,12}$/u.test(leaf.value) && leaf.hitCount > 0)
          .map((leaf) => leaf.value)
          .join(","),
      );
      return partition;
    });
  }
  throw new Error(
    "Jobba statligts träffgräns nåddes utan ett fullständigt sökurval.",
  );
}

export function parseStatligtAdvertisement(ad, job) {
  const id = statligtAdId(job.url);
  if (
    ad?.id !== id ||
    (ad.removed !== true &&
      (typeof ad.headline !== "string" || !ad.headline.trim()))
  )
    throw new Error(
      "Platsbankens original stämmer inte med Jobba statligts annons.",
    );
  if (ad.removed === true) return null;
  const text =
    ad.description?.text?.trim().slice(0, 60000) ||
    htmlText(ad.description?.text_formatted);
  if (!text || text.length < 100)
    throw new Error("Jobba statligts fullständiga annonsunderlag saknas.");
  const address = ad.workplace_address ?? {};
  const organization =
    clean(ad.employer?.name || ad.employer?.workplace) || job.organization;
  if (!organization)
    throw new Error(
      "Jobba statligts arbetsgivare saknas även i originalannonsen.",
    );
  const applicationUrl = safeApplicationUrl(
    ad.application_details?.url,
    job.url,
  );
  return {
    ...job,
    role: clean(ad.headline),
    organization,
    location: clean(address.municipality || address.city || job.location),
    deadline: ad.application_deadline
      ? date(ad.application_deadline.slice(0, 10))
      : "",
    text,
    summary: clean(text, 420),
    additionalUrls: [
      `https://arbetsformedlingen.se/platsbanken/annonser/${id}`,
    ],
    ...(applicationUrl ? { applicationUrl } : {}),
  };
}

async function scanStatligtSource(source, day, read) {
  const queue = [new URLSearchParams({ display: "250" })],
    jobs = [];
  let requests = 0,
    total = 0,
    covered = 0;
  while (queue.length) {
    const batch = queue.splice(0, 2);
    requests += batch.length;
    if (requests > 100)
      throw new Error(
        "Jobba statligts sökurval kräver för många delhämtningar.",
      );
    const pages = await mapLimit(batch, async (params) => ({
      params,
      listing: parseStatligtListing(await read(`${source.url}?${params}`)),
    }));
    for (const { params, listing } of pages) {
      if (requests === 1) total = listing.count;
      jobs.push(...listing.jobs);
      if (listing.jobs.length < listing.count)
        queue.push(...statligtPartitions(listing, params));
      else covered += listing.count;
    }
  }
  const unique = [...new Map(jobs.map((job) => [job.url, job])).values()];
  if (covered < total)
    throw new Error(
      `Alla delar av Jobba statligts sökurval kunde inte läsas (${covered}/${total}).`,
    );
  const selected = unique.filter(matchesWatchProfile);
  const completed = await mapLimit(selected, async (job) => {
    try {
      const data = JSON.parse(
        await read(
          `https://jobsearch.api.jobtechdev.se/ad/${statligtAdId(job.url)}`,
        ),
      );
      return parseStatligtAdvertisement(data, job);
    } catch (error) {
      if (
        error.cause instanceof SourceHttpError &&
        [404, 410].includes(error.cause.status)
      )
        return null;
      throw error;
    }
  });
  return completed.filter(
    (job) =>
      job && (!job.deadline || job.deadline >= day) && matchesWatchProfile(job),
  );
}

async function mapLimit(values, action) {
  const output = new Array(values.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, values.length) }, async () => {
      while (index < values.length) {
        const current = index++;
        output[current] = await action(values[current]);
      }
    }),
  );
  return output;
}

class SourceHttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
    this.retryable = status === 408 || status >= 500;
  }
}

export async function fetchSourcePage(
  url,
  options = {},
  pause = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  const source = JOB_WATCH_SOURCES.find((s) => sourceUrl(url, s));
  const jobTech =
    /^https:\/\/jobsearch\.api\.jobtechdev\.se\/ad\/[1-9]\d{0,23}$/u.test(url);
  if (!source && !jobTech) throw new Error("Okänd annonskälla.");
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent":
            "Veckoverket-JobWatch/1.0 (+https://github.com/andyCDN/Veckoverket)",
          Accept: "text/html,application/json",
          ...options.headers,
        },
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new SourceHttpError(response.status);
      const text = await response.text();
      if (text.length > 5_000_000)
        throw new Error("Annonskällans svar är för stort.");
      return text;
    } catch (error) {
      const retryable =
        error instanceof SourceHttpError
          ? error.retryable
          : error instanceof TypeError ||
            ["TimeoutError", "AbortError"].includes(error?.name);
      if (!retryable || attempt >= 2) {
        const detail = error?.cause?.code ? ` (${error.cause.code})` : "";
        throw new Error(`${new URL(url).pathname}: ${error.message}${detail}`, {
          cause: error,
        });
      }
      await pause(attempt === 0 ? 1000 : 3000);
    }
  }
}

export async function scanWatchSource(source, day, read = fetchSourcePage) {
  if (source.id === "jobba-statligt")
    return scanStatligtSource(source, day, read);
  const first = await read(source.url);
  let jobs;
  if (source.id === "ideella-jobb") {
    const listing = parseIdeellaListing(first);
    const rest = await mapLimit(
      Array.from({ length: listing.pages - 1 }, (_, i) => i + 2),
      async (page) => {
        const body = await read(
          "https://ideellajobb.se/wp-admin/admin-ajax.php",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: ideellaPageBody(listing, page),
          },
        );
        const response = JSON.parse(body);
        if (typeof response.data !== "string")
          throw new Error("Ideella jobbs nästa sida kunde inte läsas.");
        return parseIdeellaListing(response.data).jobs;
      },
    );
    jobs = [...listing.jobs, ...rest.flat()];
  } else if (source.id === "stockholms-stad") {
    const listing = parseStockholmListing(first);
    const rest = await mapLimit(
      Array.from({ length: listing.pages - 1 }, (_, i) => i + 2),
      async (page) => {
        const html = await read(`${source.url}?sida=${page}&sortera=nyast`);
        return parseStockholmListing(html).jobs;
      },
    );
    jobs = [...listing.jobs, ...rest.flat()];
    if (new Set(jobs.map((job) => job.url)).size < listing.count)
      throw new Error(
        "Alla sidor i Stockholms stads annonslista kunde inte läsas.",
      );
  } else throw new Error("Okänd annonskälla.");
  const unique = [...new Map(jobs.map((job) => [job.url, job])).values()];
  return mapLimit(
    unique.filter((job) => job.deadline >= day && matchesWatchProfile(job)),
    async (job) => parseWatchAdvertisement(await read(job.url), job),
  );
}

export async function refreshWatchFeed(
  previous,
  now = new Date(),
  scan = scanWatchSource,
) {
  const checkedAt = now.toISOString();
  const day = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
  }).format(now);
  const results = await Promise.all(
    JOB_WATCH_SOURCES.map(async (source) => {
      const old = previous.sources?.find((s) => s.id === source.id);
      try {
        const jobs = (await scan(source, day)).filter(
          (job) => !job.deadline || job.deadline >= day,
        );
        return {
          jobs,
          source: {
            id: source.id,
            checkedAt,
            lastSuccessfulAt: checkedAt,
            status: "ok",
            count: jobs.length,
          },
        };
      } catch (error) {
        console.error(
          `${source.name}: ${error instanceof Error ? error.message : "Hämtningen misslyckades."}`,
        );
        const jobs = previous.jobs.filter(
          (job) =>
            job.sourceId === source.id &&
            (!job.deadline || job.deadline >= day),
        );
        return {
          jobs,
          source: {
            id: source.id,
            checkedAt,
            lastSuccessfulAt: old?.lastSuccessfulAt ?? null,
            status: "error",
            count: jobs.length,
          },
        };
      }
    }),
  );
  return {
    ...previous,
    updatedAt: results.some((r) => r.source.status === "ok")
      ? checkedAt
      : previous.updatedAt,
    jobs: [
      ...previous.jobs.filter(
        (job) => !JOB_WATCH_SOURCES.some((s) => s.id === job.sourceId),
      ),
      ...results.flatMap((r) => r.jobs),
    ],
    sources: results.map((r) => r.source),
  };
}
