import { load } from "cheerio";
import { JOB_WATCH_SOURCES } from "../src/lib/job-watch-config.ts";

export { JOB_WATCH_SOURCES };
const normalize = (value) => value.normalize("NFKC").toLocaleLowerCase("sv-SE");
const rolePattern =
  /utred|handlägg|sakkunn|strateg|projektled|projektchef|projektansvar|projektkoord|samordn|verksamhetsutveckl|organisationsutveckl|utvecklingsled|kommunikat|kommunikation|pressansvar|presschef|public affairs|opinions|påverkan|intressepolit|policy|politiskt|kansli|generalsekreter|förbundssekreter|förbundschef|verksamhetschef|enhetschef|avdelningschef|förvaltningschef|insaml|fundrais|chefssekreter/iu;
const specialistPattern =
  /sjuksköter|undersköter|socialsekreter|socionom|biståndshandlägg|hemtjänst|vård|omsorgsboende|gruppbostad|servicehus|\blss\b|förskol|\brektor\b/iu;
const locationPattern =
  /stockholm|sundbyberg|solna|nacka|huddinge|haninge|tyresö|täby|danderyd|lidingö|sollentuna|järfälla|botkyrka|södertälje|salem|vaxholm|värmdö|vallentuna|upplands|sigtuna|nynäshamn|norrtälje|ekerö|österåker|distans|remote|flexibelt|hela sverige|ej specificerad/iu;

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
    if (
      advertisement &&
      !(
        source.id === "ideella-jobb"
          ? /^\/jobs\/[^/]+\/?$/u
          : /^\/lediga-jobb\/platsannonser\/[^/]+\/?$/u
      ).test(url.pathname)
    )
      return;
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
    : $("article a.btn--primary").first();
  const applicationUrl = safeApplicationUrl(application.attr("href"), job.url);
  return {
    ...job,
    deadline: date(dateText),
    text,
    summary: clean(text, 420),
    ...(applicationUrl ? { applicationUrl } : {}),
  };
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

export async function fetchSourcePage(url, options = {}) {
  const source = JOB_WATCH_SOURCES.find((s) => sourceUrl(url, s));
  if (!source) throw new Error("Okänd annonskälla.");
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
  if (!response.ok)
    throw new Error(`${source.name} svarade med HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > 5_000_000)
    throw new Error("Annonskällans svar är för stort.");
  return text;
}

export async function scanWatchSource(source, day, read = fetchSourcePage) {
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
  } else {
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
  }
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
          (job) => job.deadline >= day,
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
          (job) => job.sourceId === source.id && job.deadline >= day,
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
