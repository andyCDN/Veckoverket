export type JobDetails = {
  role: string;
  organization: string;
  location: string;
  employmentType: string;
  description: string;
  deadline: string;
  postedOn: string;
  validThrough: string;
  salary: string;
};
const empty = (): JobDetails => ({
  role: "",
  organization: "",
  location: "",
  employmentType: "",
  description: "",
  deadline: "",
  postedOn: "",
  validThrough: "",
  salary: "",
});
export function plainText(input: unknown, max = 20000): string {
  if (typeof input !== "string") return "";
  const entities: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    nbsp: " ",
    lt: "<",
    gt: ">",
    aring: "å",
    auml: "ä",
    ouml: "ö",
    Aring: "Å",
    Auml: "Ä",
    Ouml: "Ö",
  };
  return input
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(?:p|div|li|br|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, e: string) => {
      if (e[0] !== "#") return entities[e] ?? `&${e};`;
      const n =
        e[1].toLowerCase() === "x"
          ? parseInt(e.slice(2), 16)
          : Number(e.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : "";
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, max);
}
function date(value: unknown) {
  if (typeof value !== "string") return "";
  const m = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!m) return "";
  const d = new Date(`${m}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === m
    ? m
    : "";
}
function label(text: string, names: string) {
  return (
    text
      .match(new RegExp(`(?:^|\\n)(?:${names})\\s*:\\s*([^\\n]+)`, "i"))?.[1]
      ?.trim() ?? ""
  );
}
export function parseJobPage(html: string, jobId?: string): JobDetails {
  const output = empty(),
    posts: Record<string, any>[] = [];
  let visited = 0;
  const walk = (v: unknown, depth = 0) => {
    if (!v || depth > 12 || ++visited > 2000) return;
    if (Array.isArray(v)) {
      for (const child of v) walk(child, depth + 1);
      return;
    }
    if (typeof v !== "object") return;
    const o = v as Record<string, any>,
      types = Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]];
    if (
      types.some((t) => typeof t === "string" && /(?:^|\/)JobPosting$/.test(t))
    )
      posts.push(o);
    for (const child of Object.values(o))
      if (child && typeof child === "object") walk(child, depth + 1);
  };
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    try {
      walk(JSON.parse(match[1]));
    } catch {
      try {
        walk(JSON.parse(plainText(match[1])));
      } catch {
        /* Not job data. */
      }
    }
  }
  const matchesSingle = (p: Record<string, any>) => {
    if (!jobId) return true;
    const urlId = String(p.url ?? "").match(
      /\/jobs\/view\/(?:[^/]*-)?(\d+)\/?(?:[?#]|$)/,
    )?.[1];
    const linkedId =
      p.identifier?.name === "LinkedIn"
        ? String(p.identifier?.value ?? "")
        : "";
    return (!urlId || urlId === jobId) && (!linkedId || linkedId === jobId);
  };
  const job =
    posts.find(
      (p) =>
        jobId &&
        (String(p.identifier?.value ?? p.identifier ?? "") === jobId ||
          new RegExp(`/jobs/view/(?:[^/]*-)?${jobId}/?(?:[?#]|$)`).test(
            String(p.url ?? ""),
          )),
    ) ?? (posts.length === 1 && matchesSingle(posts[0]) ? posts[0] : undefined);
  if (job) {
    output.role = plainText(job.title, 200);
    output.organization = plainText(job.hiringOrganization?.name, 200);
    output.description = plainText(job.description);
    output.postedOn = date(job.datePosted);
    output.validThrough = date(job.validThrough);
    output.deadline = date(job.applicationDeadline);
    const locations = Array.isArray(job.jobLocation)
      ? job.jobLocation
      : [job.jobLocation];
    output.location = [
      ...new Set(
        locations
          .map((l: any) => {
            const a = l?.address;
            if (!a) return "";
            return [
              a.addressLocality,
              a.addressRegion,
              typeof a.addressCountry === "string"
                ? a.addressCountry
                : a.addressCountry?.name,
            ]
              .map((v) => plainText(v, 150))
              .filter(Boolean)
              .join(", ");
          })
          .filter(Boolean),
      ),
    ]
      .join(" · ")
      .slice(0, 500);
    if (job.jobLocationType === "TELECOMMUTE")
      output.location = ["Distans", output.location]
        .filter(Boolean)
        .join(" · ");
    const names: Record<string, string> = {
      FULL_TIME: "Heltid",
      PART_TIME: "Deltid",
      CONTRACTOR: "Konsultuppdrag",
      TEMPORARY: "Tidsbegränsad",
      INTERN: "Praktik",
      INTERNSHIP: "Praktik",
      VOLUNTEER: "Ideellt",
      PER_DIEM: "Behovsanställning",
      OTHER: "Annat",
    };
    output.employmentType = (
      Array.isArray(job.employmentType)
        ? job.employmentType
        : [job.employmentType]
    )
      .filter((v: unknown) => typeof v === "string")
      .map((v: string) => names[v] ?? plainText(v, 100))
      .join(", ")
      .slice(0, 300);
    const salary = job.baseSalary,
      value = salary?.value;
    if (value && typeof value === "object") {
      const amount =
        typeof value.value === "number"
          ? String(value.value)
          : [value.minValue, value.maxValue]
              .filter((v: unknown) => typeof v === "number")
              .join("–");
      if (amount)
        output.salary = [
          amount,
          plainText(salary.currency, 10),
          plainText(value.unitText, 30),
        ]
          .filter(Boolean)
          .join(" ");
    }
  }
  if (!output.role)
    output.role = plainText(
      html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1],
      200,
    );
  if (!output.organization)
    output.organization = plainText(
      html.match(
        /<a\b[^>]*class\s*=\s*["'][^"']*topcard__org-name-link[^"']*["'][^>]*>([\s\S]*?)<\/a\s*>/i,
      )?.[1],
      200,
    );
  if (!output.description)
    output.description = plainText(
      html.match(
        /<div\b[^>]*class\s*=\s*["'][^"']*show-more-less-html__markup[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/i,
      )?.[1],
    );
  const text = plainText(html);
  if (!output.role)
    output.role = label(text, "Tjänst|Titel|Jobbtitel|Job title").slice(0, 200);
  if (!output.organization)
    output.organization = label(
      text,
      "Arbetsgivare|Organisation|Företag|Company",
    ).slice(0, 200);
  if (!output.location)
    output.location = label(text, "Ort|Plats|Location").slice(0, 500);
  if (!output.deadline)
    output.deadline = date(
      label(
        output.description || text,
        "Sista ansökningsdag|Ansök senast|Application deadline",
      ),
    );
  if (!/<[a-z]/i.test(html) && !output.description) output.description = text;
  if (
    /^(?:linkedin|sign in|logga in|join linkedin|registrera dig|this job is no longer available|jobbet finns inte längre)$/i.test(
      output.role,
    )
  )
    output.role = "";
  return output;
}
