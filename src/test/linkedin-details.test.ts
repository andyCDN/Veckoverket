import { afterEach, it, expect, vi } from "vitest";
import {
  parseJobPage,
  plainText,
} from "../../supabase/functions/_shared/linkedin-job-details";
import { linkedInJobHandler } from "../../supabase/functions/_shared/linkedin-job-handler";
import {
  applyJobDetails,
  loadJobDetails,
} from "../lib/linkedin-details-client";
import { linkedInDrafts, importLinkedInJobs } from "../lib/linkedin-import";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";
const url = "https://www.linkedin.com/jobs/view/123456/";
const record = {
  "@type": "JobPosting",
  title: "Utvecklare &amp; designer",
  hiringOrganization: { "@type": "Organization", name: "Exempel AB" },
  url,
  identifier: { name: "LinkedIn", value: "123456" },
  description: "<p>Bygg tjänster.</p><p>Sista ansökningsdag: 2026-12-02</p>",
  jobLocation: {
    address: { addressLocality: "Stockholm", addressCountry: "SE" },
  },
  employmentType: ["FULL_TIME"],
  datePosted: "2026-11-10T08:00:00Z",
  validThrough: "2026-12-10T23:59:59Z",
  baseSalary: {
    currency: "SEK",
    value: { minValue: 45000, maxValue: 55000, unitText: "MONTH" },
  },
};
const html = (job: unknown = record) =>
  `<html><script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "Organization", name: "LinkedIn" }, job] })}</script></html>`;
const request = (
  body: unknown = { url },
  token = "valid",
  origin = "https://andycdn.github.io",
) =>
  new Request("https://app.test/functions/v1/linkedin-job", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const handler = (fetcher: typeof fetch) =>
  linkedInJobHandler({
    origin: "https://andycdn.github.io",
    authenticate: async (token) => (token === "valid" ? "user" : null),
    fetch: fetcher,
  });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("läser titel, riktig arbetsgivare, ort, form och beskrivning ur JobPosting", () => {
  expect(parseJobPage(html(), "123456")).toMatchObject({
    role: "Utvecklare & designer",
    organization: "Exempel AB",
    location: "Stockholm, SE",
    employmentType: "Heltid",
    deadline: "2026-12-02",
    postedOn: "2026-11-10",
    validThrough: "2026-12-10",
    salary: "45000–55000 SEK MONTH",
  });
});
it("förväxlar inte annonsens giltighetstid med sista ansökningsdag", () => {
  expect(
    parseJobPage(html({ ...record, description: "Arbeta med oss" }), "123456")
      .deadline,
  ).toBe("");
});
it("läser gästsidans titel och företag, men ingen påhittad titel från URL", () => {
  expect(
    parseJobPage(
      '<h1 class="top-card-layout__title">Utredare</h1><a class="topcard__org-name-link">Kommunen</a>',
    ),
  ).toMatchObject({ role: "Utredare", organization: "Kommunen" });
  expect(parseJobPage("<h1>Sign in</h1>")).toMatchObject({
    role: "",
    organization: "",
  });
  expect(parseJobPage("Ingen annons")).toMatchObject({
    role: "",
    organization: "",
  });
});
it("läser märkt inklistrad annonstext och tar bort aktiva HTML-element", () => {
  expect(
    parseJobPage(
      "Tjänst: Designer\nArbetsgivare: Bolaget\nOrt: Göteborg\nSista ansökningsdag: 2026-12-01",
    ),
  ).toMatchObject({
    role: "Designer",
    organization: "Bolaget",
    location: "Göteborg",
    deadline: "2026-12-01",
  });
  expect(plainText("<script>alert(1)</script><p>Hej &aring; &#246;</p>")).toBe(
    "Hej å ö",
  );
});
it("hämtar rätt JobPosting bland flera och tar inte en annan annons när id skiljer sig", () => {
  expect(
    parseJobPage(
      html([
        {
          ...record,
          url: "https://www.linkedin.com/jobs/view/222/",
          identifier: { name: "LinkedIn", value: "222" },
          title: "Fel",
        },
        record,
      ]),
      "123456",
    ).role,
  ).toBe("Utvecklare & designer");
  expect(
    parseJobPage(
      html({
        ...record,
        url: "https://www.linkedin.com/jobs/view/222/",
        identifier: { name: "LinkedIn", value: "222" },
      }),
      "123456",
    ).role,
  ).toBe("");
});
it("hämtning skriver inte över manuella ändringar och uppgifterna sparas efter granskning", () => {
  const d = linkedInDrafts(url, [])[0],
    details = parseJobPage(html(), "123456");
  const enriched = applyJobDetails(
    { ...d, role: "Min titel", editedFields: ["role"] },
    details,
  );
  expect(enriched.role).toBe("Min titel");
  expect(enriched.organization).toBe("Exempel AB");
  expect(enriched.notes).toContain("Annons giltig till: 2026-12-10");
  const data = createData();
  data.applications = [];
  const saved = importLinkedInJobs(data, [enriched]);
  expect(saved.added[0].advertisement?.text).toContain("Bygg tjänster");
  expect(saved.added[0].notes).toContain("Ort: Stockholm");
  expect(() => decodeData(JSON.stringify(saved.data))).not.toThrow();
});
it("nekar oinloggat konto, främmande ursprung och andra värdar utan externa hämtningar", async () => {
  const f = vi.fn();
  const h = handler(f as typeof fetch);
  expect((await h(request({ url }, "bad"))).status).toBe(401);
  expect((await h(request({ url }, "valid", "https://evil.test"))).status).toBe(
    403,
  );
  expect((await h(request({ url: "http://127.0.0.1/private" }))).status).toBe(
    400,
  );
  expect(f).not.toHaveBeenCalled();
});
it("hämtar bara den valda publika annonsen och skickar aldrig användartoken till LinkedIn", async () => {
  const f = vi.fn<typeof fetch>(
    async () =>
      new Response(html(), { headers: { "Content-Type": "text/html" } }),
  );
  const response = await handler(f as typeof fetch)(request());
  expect(response.status).toBe(200);
  expect((await response.json()).details.organization).toBe("Exempel AB");
  expect(f.mock.calls[0][0]).toBe(url);
  expect(JSON.stringify(f.mock.calls)).not.toContain("Bearer");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("följer inte en omdirigering till annan värd eller inloggningssida", async () => {
  for (const location of [
    "https://evil.test/",
    "https://www.linkedin.com/authwall",
  ]) {
    const f = vi.fn(
      async () => new Response(null, { status: 302, headers: { location } }),
    );
    const r = await handler(f as typeof fetch)(request());
    expect(r.status).toBe(422);
    expect(f).toHaveBeenCalledTimes(1);
  }
});
it("tillåter bara omdirigering till samma LinkedIn-jobb", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: {
          location: "https://www.linkedin.com/jobs/view/utvecklare-123456/",
        },
      }),
    )
    .mockResolvedValueOnce(new Response(html()));
  expect((await handler(f as typeof fetch)(request())).status).toBe(200);
  expect(f).toHaveBeenCalledTimes(2);
});
it("visar begripliga fel vid blockering, tom annons och för stor respons", async () => {
  for (const response of [
    new Response("blocked", { status: 429 }),
    new Response("<h1>Sign in</h1>"),
    new Response("x".repeat(1500001)),
  ]) {
    const r = await handler(
      vi.fn<typeof fetch>(async () => response) as typeof fetch,
    )(request());
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect((await r.json()).error).toBeTruthy();
  }
});
it("CORS-förfrågningar kräver ingen inloggning och anrop begränsas per konto", async () => {
  const f = vi.fn<typeof fetch>(async () => new Response(html())),
    h = handler(f as typeof fetch);
  expect(
    (
      await h(
        new Request("https://app.test/", {
          method: "OPTIONS",
          headers: { Origin: "https://andycdn.github.io" },
        }),
      )
    ).status,
  ).toBe(204);
  for (let i = 0; i < 60; i++) expect((await h(request())).status).toBe(200);
  expect((await h(request())).status).toBe(429);
  expect(f).toHaveBeenCalledTimes(60);
});

it("nätverksfel visas begripligt och sena svar ersätter inte inklistrade uppgifter", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_LINKEDIN_JOB_ENDPOINT", "");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  await expect(
    loadJobDetails(url, new AbortController().signal),
  ).rejects.toThrow("kunde inte ansluta");
  const draft = linkedInDrafts(url, [])[0],
    details = parseJobPage(html());
  const pasted = applyJobDetails(
    draft,
    { ...details, role: "Inklistrad titel" },
    "paste",
  );
  expect(applyJobDetails(pasted, { ...details, role: "Sent svar" }).role).toBe(
    "Inklistrad titel",
  );
});
