import { expect, it } from "vitest";
import {
  advertisementRequirements,
  orderedJobReviews,
  reviewWatchJob,
} from "../lib/job-review";
import { reviewJobFixture, reviewText } from "./fixtures/job-review";
import { matchesWatchProfile } from "../../scripts/job-watch-sources.mjs";

it("kräver stöd i arbetsuppgifter och krav innan ett jobb prioriteras", () => {
  const job = reviewJobFixture(),
    review = reviewWatchJob(job);
  expect(review.kind).toBe("priority");
  expect(review.evidence).toBe(
    "Du leder vårt påverkansarbete och tar fram remissvar.",
  );
  expect(job.text).toContain(review.evidence);
  expect(review.requirements).toEqual([
    {
      text: "Du har relevant högskoleutbildning inom statsvetenskap eller motsvarande.",
      kind: "required",
    },
    {
      text: "Du har flera års erfarenhet av politiskt arbete.",
      kind: "required",
    },
    { text: "Erfarenhet av EU-samordning är meriterande.", kind: "preferred" },
  ]);
});

it("låter inte en titel, en sammanfattning eller arbetsgivarens namn ersätta granskad fulltext", () => {
  expect(
    reviewWatchJob(reviewJobFixture({ text: undefined, summary: reviewText }))
      .kind,
  ).toBe("incomplete");
  expect(
    reviewWatchJob(
      reviewJobFixture({
        role: "Strategisk kommunikatör",
        text: "En kort annons.",
      }),
    ).kind,
  ).toBe("incomplete");
  expect(
    reviewWatchJob(
      reviewJobFixture({
        text: reviewText.replace(
          "Du leder vårt påverkansarbete och tar fram remissvar. Du analyserar politiska beslutsprocesser och samordnar arbetet med opinionsbildning.",
          "Arbetet gäller löpande registrering av leveranser. Du fyller i arbetsgivarens lagerjournal och tar emot inkommande leveranser.",
        ),
      }),
    ).kind,
  ).toBe("possible");
});

it("matchar inte ordet kansli inuti Regeringskansliet", () => {
  expect(
    matchesWatchProfile(
      reviewJobFixture({ role: "SIEM-tekniker till Regeringskansliet" }),
    ),
  ).toBe(false);
  expect(matchesWatchProfile(reviewJobFixture({ role: "Kanslichef" }))).toBe(
    true,
  );
});

it("skiljer teknisk kommunikation och forskningsroller från kommunikations- och policyarbete", () => {
  for (const role of [
    "Forskningsingenjör i kvantsäker kommunikation",
    "SIEM-tekniker till Regeringskansliet",
    "Enhetschef inom ringmärkning och palynologi",
    "Doktorand inom värdering och policy",
    "Strategisk inköpare inom IT",
    "Handläggare vid Must",
  ])
    expect(reviewWatchJob(reviewJobFixture({ role })).kind, role).toBe(
      "outside",
    );
});

it("lyfter ett uttryckligt specialistkrav före en generell titelträff", () => {
  const text = reviewText.replace(
    "Du har relevant högskoleutbildning inom statsvetenskap eller motsvarande.",
    "Du har en masterexamen inom fysik eller motsvarande teknisk utbildning.",
  );
  const review = reviewWatchJob(reviewJobFixture({ role: "Utredare", text }));
  expect(review.kind).toBe("possible");
  expect(review.concerns[0]).toContain("specialistområde");
  expect(review.requirements[0].text).toContain(
    "eller motsvarande teknisk utbildning",
  );
});

it("betraktar inte en meriterande specialistexamen som ett obligatoriskt krav", () => {
  const job = reviewJobFixture({
    text: reviewText.replace(
      "Erfarenhet av EU-samordning är meriterande.",
      "Masterexamen inom fysik är meriterande.",
    ),
  });
  const review = reviewWatchJob(job);
  expect(review.kind).toBe("priority");
  expect(review.concerns).toEqual([]);
  expect(review.requirements.at(-1)).toEqual({
    text: "Masterexamen inom fysik är meriterande.",
    kind: "preferred",
  });
});

it("behåller likvärdiga alternativ och håller ihop förkortningar i kravtexten", () => {
  const text = reviewText.replace(
    "Du har relevant högskoleutbildning inom statsvetenskap eller motsvarande.",
    "Du har relevant högskoleutbildning, t.ex. inom statsvetenskap, juridik eller naturvetenskap, eller likvärdig erfarenhet.",
  );
  const review = reviewWatchJob(reviewJobFixture({ text }));
  expect(review.kind).toBe("priority");
  expect(review.requirements[0].text).toBe(
    "Du har relevant högskoleutbildning, t.ex. inom statsvetenskap, juridik eller naturvetenskap, eller likvärdig erfarenhet.",
  );
});

it("missar inte forskarutbildningskravet för att utbildningen samtidigt nämner ett samhällsvetenskapligt ämne", () => {
  const text = reviewText.replace(
    "Du har relevant högskoleutbildning inom statsvetenskap eller motsvarande.",
    "Doktorsexamen inom nationalekonomi krävs.",
  );
  expect(
    reviewWatchJob(reviewJobFixture({ role: "Utredare", text })).kind,
  ).toBe("possible");
});

it("hämtar krav från kandidatdelen och ignorerar beskrivningar av kollegor och rekryteringsprocessen", () => {
  const text = `${reviewText}\nVi har kollegor med olika erfarenhet. Vårt urval görs med en upprättad kravprofil och intervjuer.`;
  const requirements = advertisementRequirements(text);
  expect(requirements).toHaveLength(3);
  expect(requirements.some((item) => item.text.includes("kollegor"))).toBe(
    false,
  );
});

it("hittar erfarenhetskrav i en punktlista efter Vi söker dig som", () => {
  const text = `Du leder vårt politiska påverkansarbete och tar fram remissvar och budskap till opinionsbildningen. I rollen samordnar du arbetet med hela förbundet.\nVi söker dig som\narbetat i minst 5 år som kommunikationschef eller tjänst vi bedömer likvärdig\nhar arbetat med public affairs eller samhällsfrågor\nDet är meriterande om du har\nerfarenhet från ideell verksamhet\nÖvrig information\nVi använder en upprättad kravprofil i vår rekryteringsprocess.`;
  const review = reviewWatchJob(
    reviewJobFixture({ role: "Enhetschef public affairs", text }),
  );
  expect(review.kind).toBe("priority");
  expect(review.requirements[0]).toMatchObject({
    kind: "required",
    text: "arbetat i minst 5 år som kommunikationschef eller tjänst vi bedömer likvärdig",
  });
  expect(review.requirements.at(-1)?.kind).toBe("preferred");
});

it("prioriterar inte oklart placerade eller geografiskt felriktade jobb", () => {
  expect(reviewWatchJob(reviewJobFixture({ location: "Göteborg" })).kind).toBe(
    "outside",
  );
  expect(reviewWatchJob(reviewJobFixture({ location: "" })).kind).toBe(
    "possible",
  );
  for (const location of [
    "Bromma",
    "Solna",
    "Stockholm eller Östersund",
    "Distans",
  ])
    expect(reviewWatchJob(reviewJobFixture({ location })).kind).toBe(
      "priority",
    );
});

it("ger inte hög prioritet när tydliga krav inte kan urskiljas", () => {
  const text =
    "Arbetsuppgifter\nDu leder vårt politiska påverkansarbete, utformar remissvar och samordnar förbundets opinionsbildning. Du tar fram analyser och underlag för politiska beslut och representerar förbundet vid möten med beslutsfattare.";
  expect(reviewWatchJob(reviewJobFixture({ text })).kind).toBe("possible");
});

it("ordnar arbetsinnehåll före deadline och ändrar inte källdata", () => {
  const jobs = [
    reviewJobFixture({
      role: "Forskningsingenjör i kvantsäker kommunikation",
      deadline: "2026-11-26",
    }),
    reviewJobFixture({ role: "Utredare", deadline: "2026-11-27" }),
    reviewJobFixture(),
  ];
  const before = structuredClone(jobs);
  expect(orderedJobReviews(jobs).map(({ job }) => job.role)).toEqual([
    "Politiskt sakkunnig",
    "Utredare",
    "Forskningsingenjör i kvantsäker kommunikation",
  ]);
  expect(jobs).toEqual(before);
});

it("läser inte uttryckligen borttagna examenskrav som obligatoriska", () => {
  const text = reviewText.replace(
    "Du har flera års erfarenhet av politiskt arbete.",
    "Du har flera års erfarenhet av politiskt arbete. Du behöver inte ha juristexamen.",
  );
  const review = reviewWatchJob(reviewJobFixture({ text }));
  expect(review.kind).toBe("priority");
  expect(
    review.requirements.some((item) => item.text.includes("juristexamen")),
  ).toBe(false);
});

it("använder inte en negerad arbetsuppgift som stöd för rekommendation", () => {
  const text = reviewText.replace(
    "Du leder vårt påverkansarbete och tar fram remissvar. Du analyserar politiska beslutsprocesser och samordnar arbetet med opinionsbildning.",
    "Arbetsuppgifterna omfattar inte politiskt arbete. Policyarbete ingår inte i rollen. Huvuduppgiften är administration av leveranser och register.",
  );
  expect(reviewWatchJob(reviewJobFixture({ text })).kind).toBe("possible");
});

it("prioriterar redan granskade roller som användaren aktivt söker utan att ändra ansökningarna", () => {
  const jobs = [
    reviewJobFixture({ role: "Presschef" }),
    reviewJobFixture({
      role: "Utredare",
      url: "https://example.org/investigator",
    }),
  ];
  const applications = [{ role: "Utredare", status: "sent" as const }],
    before = structuredClone(applications);
  expect(orderedJobReviews(jobs)[0].job.role).toBe("Presschef");
  const personalized = orderedJobReviews(jobs, applications);
  expect(personalized[0].job.role).toBe("Utredare");
  expect(personalized[0].review.preference).toContain("aktiva ansökningar");
  expect(applications).toEqual(before);
  expect(
    orderedJobReviews(jobs, [{ role: "Utredare", status: "rejected" }])[0].job
      .role,
  ).toBe("Presschef");
});

it("låter inte ett valt yrke åsidosätta granskningen av ett specialistkrav", () => {
  const job = reviewJobFixture({
    role: "Utredare",
    text: reviewText.replace(
      "Du har relevant högskoleutbildning inom statsvetenskap eller motsvarande.",
      "Masterexamen inom fysik krävs.",
    ),
  });
  const result = orderedJobReviews(
    [job],
    [{ role: "Utredare", status: "sent" }],
  )[0];
  expect(result.review.kind).toBe("possible");
  expect(result.review.preference).toBeUndefined();
});

it("bedömer kommunikations- och policyarbete efter arbetsuppgifterna även inom ett tekniskt ämnesområde", () => {
  for (const role of [
    "Kommunikatör inom cybersäkerhet",
    "Policyexpert inom informationssäkerhet",
  ])
    expect(reviewWatchJob(reviewJobFixture({ role })).kind).toBe("priority");
  expect(
    reviewWatchJob(
      reviewJobFixture({
        role: "IT-samordnare till kommunikationsavdelningen",
      }),
    ).kind,
  ).toBe("outside");
});
