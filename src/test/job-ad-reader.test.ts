import { afterEach, expect, it, vi } from "vitest";
import {
  jobAdvertisementUrl,
  parsePlatsbankenAd,
  platsbankenJobUrl,
  readJobAdvertisement,
} from "../lib/job-ad-reader";
import { platsbankenAd, platsbankenUrl } from "./fixtures/platsbanken-ad";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("känner igen Platsbankens länkar och tar bort spårning för dubblettkontrollen", () => {
  for (const url of [
    platsbankenUrl,
    `${platsbankenUrl}/?utm_source=linkedin#ansok`,
    "http://www.arbetsformedlingen.se/platsbanken/annonser/31722867",
    "arbetsformedlingen.se/platsbanken/annonser/31722867",
  ])
    expect(jobAdvertisementUrl(url)).toBe(platsbankenUrl);
  expect(
    jobAdvertisementUrl(
      "https://se.linkedin.com/jobs/view/designer-123456?trk=x",
    ),
  ).toBe("https://www.linkedin.com/jobs/view/123456/");
  expect(jobAdvertisementUrl("https://example.org/jobs/1?lang=sv")).toBe(
    "https://example.org/jobs/1?lang=sv",
  );
});

it("behandlar inte främmande värdar eller ogiltiga jobbadresser som Platsbanken", () => {
  for (const url of [
    "https://arbetsformedlingen.se.evil.test/platsbanken/annonser/31722867",
    "https://arbetsformedlingen.se@evil.test/platsbanken/annonser/31722867",
    "https://user:secret@arbetsformedlingen.se/platsbanken/annonser/31722867",
    "https://arbetsformedlingen.se:8443/platsbanken/annonser/31722867",
    "file://arbetsformedlingen.se/platsbanken/annonser/31722867",
    "https://arbetsformedlingen.se/platsbanken/annonser/",
    "https://arbetsformedlingen.se/platsbanken/annonser/31722867/extra",
  ])
    expect(platsbankenJobUrl(url)).toBeUndefined();
});

it("läser rätt titel, organisation och hela annonstexten med uttrycklig ansökningsdag", () => {
  expect(parsePlatsbankenAd(platsbankenAd, "31722867")).toEqual({
    role: platsbankenAd.headline,
    organization: "Naturvårdsverket",
    description: platsbankenAd.description.text,
    deadline: "2026-12-06",
    postedOn: "2026-11-12",
    validThrough: "2026-12-07",
    location: "Stockholm alternativt Östersund",
    employmentType: "Heltid · Vanlig anställning",
    salary: "",
  });
  const description = `${"Ett långt stycke om tjänsten. ".repeat(1000)}\nSista stycket om ansökan.`;
  expect(
    parsePlatsbankenAd(
      { ...platsbankenAd, description: { text: description } },
      "31722867",
    ).description,
  ).toBe(description);
});

it("kan läsa HTML-reservtext och saknade fält utan att gissa sista ansökningsdag", () => {
  expect(
    parsePlatsbankenAd(
      {
        ...platsbankenAd,
        employer: { workplace: "Kontoret" },
        description: {
          text_formatted:
            "<p>Arbeta med oss &amp; våra kunder.</p><script>evil()</script>",
        },
        application_deadline: null,
        workplace_address: { municipality: "Östersund" },
      },
      "31722867",
    ),
  ).toMatchObject({
    organization: "Kontoret",
    description: "Arbeta med oss & våra kunder.",
    deadline: "",
    validThrough: "2026-12-07",
    location: "Östersund",
  });
  expect(
    parsePlatsbankenAd(
      { ...platsbankenAd, application_deadline: "2026-02-31T23:59:59" },
      "31722867",
    ).deadline,
  ).toBe("");
});

it("nekar fel annons, borttagen annons och oväntade API-svar", () => {
  for (const ad of [null, [], {}, { ...platsbankenAd, id: "999" }])
    expect(() => parsePlatsbankenAd(ad, "31722867")).toThrow(
      "inga läsbara annonsuppgifter",
    );
  expect(() =>
    parsePlatsbankenAd({ ...platsbankenAd, removed: true }, "31722867"),
  ).toThrow("tagits bort");
});

it("hämtar endast annons-id från det publika API:et utan kontots autentisering", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(platsbankenAd));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await readJobAdvertisement(
      `${platsbankenUrl}?utm_source=test`,
      new AbortController().signal,
    ),
  ).toMatchObject({
    role: platsbankenAd.headline,
    organization: "Naturvårdsverket",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://jobsearch.api.jobtechdev.se/ad/31722867",
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(
    /Authorization|apikey/,
  );
});

it("visar användbara fel för utgångna annonser, anropsgränser och nätverksproblem", async () => {
  for (const [status, message] of [
    [404, "finns inte längre"],
    [410, "finns inte längre"],
    [429, "för många anrop"],
    [503, "kunde inte hämtas"],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status })),
    );
    await expect(
      readJobAdvertisement(platsbankenUrl, new AbortController().signal),
    ).rejects.toThrow(message);
  }
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Network error")),
  );
  await expect(
    readJobAdvertisement(platsbankenUrl, new AbortController().signal),
  ).rejects.toThrow("Kunde inte ansluta");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("<html>Maintenance</html>")),
  );
  await expect(
    readJobAdvertisement(platsbankenUrl, new AbortController().signal),
  ).rejects.toThrow("inga läsbara annonsuppgifter");
});

it("avbryter pågående hämtning och skickar inga anrop för webbplatser som saknar stöd", async () => {
  const fetcher = vi.fn<typeof fetch>(async (_, init) => {
    init?.signal?.throwIfAborted();
    return Response.json(platsbankenAd);
  });
  vi.stubGlobal("fetch", fetcher);
  for (const url of [
    "http://127.0.0.1/private",
    "https://arbetsformedlingen.se.evil.test/platsbanken/annonser/31722867",
    "https://example.org/job/42",
  ])
    await expect(
      readJobAdvertisement(url, new AbortController().signal),
    ).rejects.toThrow("stöder Platsbanken och LinkedIn");
  expect(fetcher).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(
    readJobAdvertisement(platsbankenUrl, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});
