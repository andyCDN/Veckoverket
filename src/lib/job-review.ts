import type { JobWatchJob } from "./job-watch-config";
import type { JobApplication } from "./types";

export type AdRequirement = { text: string; kind: "required" | "preferred" };
export type JobReview = {
  kind: "priority" | "possible" | "outside" | "incomplete";
  reason: string;
  evidence: string;
  requirements: AdRequirement[];
  concerns: string[];
  score: number;
  preference?: string;
};

const tidy = (text: string) => text.replace(/\s+/gu, " ").trim();
const normalize = (text: string) =>
  tidy(text.normalize("NFKC")).toLocaleLowerCase("sv-SE");
const qualificationHeading =
  /(?:^|\n)\s*(?:kvalifikationer|din bakgrund|din profil|om dig|vem är du|kravprofil|dina kunskaper)(?=\s|:|$)/iu;
const candidateIntro = /vi söker dig som/iu;
const merit =
  /(?:meriterande|vi ser gärna|det är ett plus|en fördel om|önskvärt)/iu;
const explicitRequired =
  /(?:krävs|krav på|ska ha|måste ha|du behöver ha|obligatorisk|formella krav)/iu;
const requirementContent =
  /(?:utbildning|examen|erfarenhet|arbetat (?:med|som)|minst \d+ år|ledarskap|medborgarskap|behörighet|legitimation|flytande|goda kunskaper i (?:svenska|engelska))/iu;
const sectionEnd =
  /(?:^|\n)\s*(?:ansökan|övrigt|övrig information|anställningsvillkor|anställningsform|om arbetsplatsen|om oss|om naturvårdsverket|kontaktuppgifter|välkommen med din ansökan)\b/iu;

function sentences(text: string) {
  return text
    .replace(/\r\n?/gu, "\n")
    .replace(
      /t\.ex\.|bl\.a\.|m\.m\.|m\.fl\.|\bex\.|\bca\./giu,
      (abbreviation) => abbreviation.replaceAll(".", "\uE000"),
    )
    .split(/\n+|(?<=[.!?])\s+/u)
    .map((line) => tidy(line.replaceAll("\uE000", ".")))
    .filter(Boolean);
}

export function advertisementRequirements(text: string): AdRequirement[] {
  const start = qualificationHeading.exec(text) ?? candidateIntro.exec(text);
  const section = start ? text.slice(start.index) : text;
  const end = sectionEnd.exec(section.slice(1));
  const content = end ? section.slice(0, end.index + 1) : section;
  const chunks = sentences(content);
  let mode: "required" | "preferred" = "required";
  const result: AdRequirement[] = [],
    seen = new Set<string>();
  for (const raw of chunks) {
    const line = raw.replace(/^[•*\-–]\s*/u, "");
    if (
      /(?:behöver inte|måste inte|krävs inte|inget krav|inte (?:ett )?krav)/iu.test(
        line,
      )
    )
      continue;
    if (merit.test(line)) mode = "preferred";
    else if (
      explicitRequired.test(line) ||
      /^(?:krav|kvalifikationer|din bakgrund|din profil)\s*$/iu.test(line)
    )
      mode = "required";
    if (!requirementContent.test(line) || line.length < 15) continue;
    if (
      !/^(?:du |vi söker dig som |vi ser att du |för .{0,80}krävs|minst |flerårig|flera års|gedigen|dokumenterad|aktuell|relevant |avlagd |avslutad |en (?:avslutad|relevant|akademisk)|akademisk |universitets|högskole|eftergymnasial|masterexamen|kandidatexamen|magisterexamen|doktorsexamen|juristexamen|civilingenjörsexamen|utbildning|erfarenhet|kunskap|arbetat |har |mycket god|god förmåga|goda kunskaper|svenskt medborgarskap)/iu.test(
        line,
      ) &&
      !explicitRequired.test(line)
    )
      continue;
    // Outside a qualification section only explicit candidate requirements count.
    if (
      !start &&
      !explicitRequired.test(line) &&
      !/^(?:du har|vi söker dig som har|vi ser att du har)/iu.test(line)
    )
      continue;
    const key = normalize(line);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ text: line, kind: merit.test(line) ? "preferred" : mode });
  }
  return result;
}

const families = [
  {
    role: /politi(?:sk|skt)|policy|public affairs|intressepolit|påverkans|sakkunnig/iu,
    work: /påverkansarbete|politiskt arbete|policy(?:arbete|utveckling|analys)|remiss(?:var|er)|politiska (?:beslut|processer)|opinionsbildning|EU:s? (?:institutioner|beslutsprocesser)/iu,
    reason: "Arbetsuppgifterna gäller politik, policy eller samhällspåverkan.",
    points: 40,
  },
  {
    role: /kommunikatör|kommunikations|presschef|pressansvar|public affairs/iu,
    work: /kommunikations(?:arbete|strategi|plan|insats|rådgivning)|press(?:arbete|frågor|meddelanden)|medie(?:relationer|kontakter)|varumärkes(?:arbete|utveckling)|opinionsbildning|budskap/iu,
    reason:
      "Rollen innehåller strategisk kommunikation, press eller opinionsarbete.",
    points: 38,
  },
  {
    role: /utredare|handläggare|samordnare|strateg|verksamhetsutvecklare/iu,
    work: /beslutsunderlag|utredningar|utredningsarbete|analys(?:arbete|er)|samordna|samordning|remiss(?:var|er)|politiska|civila samhället|verksamhetsutveckling/iu,
    reason:
      "Annonsen beskriver utredning, samordning eller verksamhetsutveckling.",
    points: 26,
  },
  {
    role: /projektledare|projektansvarig|verksamhetschef|enhetschef|avdelningschef|kanslichef|generalsekreterare|förbundschef|insamlingschef/iu,
    work: /leda|ledarskap|utveckla verksamheten|personalansvar|projektledning|projektledare|projektarbete|samordna/iu,
    reason:
      "Arbetsuppgifterna omfattar projektledning eller ledning av verksamhet.",
    points: 22,
  },
];

const otherRole =
  /(?:\b(?:siem|it|support|system|nätverks|applikations)[- ]?tekniker|forskningsingenjör|doktorand|postdoktor|\bforskare\b|systemutvecklare|programmerare|testledare|\bit[- ]strateg|\bit[- ]samordnare|informationssäkerhet|cybersäkerhet|dataskydd|\bnautisk|toxikolog|palynolog|ringmärkning|kapacitetsmodell|redovisning|internrevisor|inköpare|upphandling|hyresjuridisk|klienthandläggare|domstolshandläggare|rättssakkunnig|kvalificerad jurist|markåtkomst|laborativa miljöer|säkerhetstjänst|vid Must|operativ samordning|säkerhetsskydd|underrättelseproduktion|infrastruktursektionen|uttagsfrågor)/iu;
const clearOtherProfession =
  /(?:tekniker|ingenjör|doktorand|postdoktor|\bforskare\b|systemutvecklare|programmerare|testledare)/iu;
const communicationOrPolicyRole =
  /kommunikatör|kommunikations(?:strateg|chef|ansvarig)|presschef|pressansvarig|policyexpert|politiskt sakkunnig|intressepolitisk/iu;
const specialistRequirements = [
  {
    pattern: /doktorsexamen|disputerad|forskarutbildning/iu,
    label: "Annonsen anger forskarutbildning eller doktorsexamen som krav.",
  },
  {
    pattern: /juristexamen|juridisk (?:examen|utbildning)/iu,
    label: "Annonsen anger en särskild juridisk utbildning som krav.",
  },
  {
    pattern:
      /(?:examen|utbildning).{0,130}(?:fysik|toxikologi|biologi|kemi|medicin|civilingenjör|högskoleingenjör|datavetenskap|systemvetenskap)|(?:civilingenjörs|veterinär|sjuksköterske|läkar)examen/iu,
    label:
      "Annonsen har ett uttryckligt utbildningskrav inom ett specialistområde.",
  },
  {
    pattern:
      /(?:erfarenhet|kunskap).{0,120}(?:windows|linux|nätverksarkitektur|python|powershell|elkraft|konstruktion|byggprojekt)/iu,
    label: "Annonsen anger tekniska specialistkunskaper som krav.",
  },
];
const broaderEducation =
  /statsvetenskap|samhällsvetenskap|kommunikation|nationalekonomi|företagsekonomi|exempelvis.{0,100}juridik/iu;
const watchArea =
  /stockholm|sundbyberg|solna|nacka|huddinge|haninge|tyresö|täby|danderyd|lidingö|sollentuna|järfälla|botkyrka|södertälje|salem|vaxholm|värmdö|vallentuna|upplands|sigtuna|nynäshamn|norrtälje|ekerö|österåker|bromma|farsta|kista|hägersten|älvsjö|skarpnäck|skärholmen|vällingby|hässelby|spånga|enskede|distans|remote|flexibelt|hela sverige|ej specificerad/iu;

function workText(text: string) {
  const first =
    /arbetsuppgifter|om (?:tjänsten|rollen|uppdraget)|ditt uppdrag|i rollen|i arbetet ingår/iu.exec(
      text,
    );
  const qualification = qualificationHeading.exec(text);
  const start =
    first && (!qualification || first.index < qualification.index)
      ? first.index
      : 0;
  const content = text.slice(start);
  const end = qualificationHeading.exec(content.slice(1));
  return end ? content.slice(0, end.index + 1) : content;
}

function evidenceFor(text: string, pattern: RegExp) {
  const chunks = sentences(text);
  const line = chunks.find((chunk) => {
    const match = pattern.exec(chunk);
    if (!match || chunk.length < 30) return false;
    const before = chunk.slice(0, match.index),
      after = chunk.slice(match.index + match[0].length);
    return (
      !/(?:inte|ingen|inga|inget|ej)\s+(?:[\p{L}-]+\s+){0,3}$/iu.test(before) &&
      !/^\s+(?:ingår|krävs)\s+inte/iu.test(after)
    );
  });
  if (!line) return "";
  if (line.length <= 360) return line;
  const match = pattern.exec(line)!;
  const start = Math.max(0, match.index - 90),
    end = Math.min(line.length, start + 330);
  return `${start ? "…" : ""}${line.slice(start, end)}${end < line.length ? "…" : ""}`;
}

/** Reviews the advertised role against the search direction. It does not certify a person's eligibility. */
export function reviewWatchJob(job: JobWatchJob): JobReview {
  const text = job.text?.trim() ?? "",
    requirements = advertisementRequirements(text);
  const base = {
    evidence: "",
    requirements,
    concerns: [] as string[],
    score: 0,
  };
  if (text.length < 180)
    return {
      ...base,
      kind: "incomplete",
      reason:
        "Hela annonstexten behövs för att granska arbetsuppgifter och krav.",
    };
  if (
    otherRole.test(job.role) &&
    (clearOtherProfession.test(job.role) ||
      !communicationOrPolicyRole.test(job.role))
  )
    return {
      ...base,
      kind: "outside",
      reason:
        "Rollen har en annan specialistinriktning än det nuvarande sökurvalet.",
    };
  if (job.location && !watchArea.test(job.location))
    return {
      ...base,
      kind: "outside",
      reason: "Placeringen ligger utanför Stockholmsområdet eller distans.",
    };
  const required = requirements.filter((item) => item.kind === "required");
  const specialist = required.find((item) =>
    specialistRequirements.some(
      (rule, index) =>
        rule.pattern.test(item.text) &&
        (index === 0 || !broaderEducation.test(item.text)),
    ),
  );
  const work = workText(text);
  const matched = families.filter(
    (family) => family.role.test(job.role) && !!evidenceFor(work, family.work),
  );
  if (!matched.length)
    return {
      ...base,
      kind: "possible",
      reason:
        "Arbetsuppgifterna ger ännu ingen tydlig träff mot sökinriktningen.",
    };
  const strongest = matched[0];
  const score =
    Math.max(...matched.map((family) => family.points)) +
    (matched.length > 1 ? 8 : 0);
  const evidence = evidenceFor(work, strongest.work);
  if (!job.location || !required.length)
    return {
      ...base,
      kind: "possible",
      evidence,
      score: score - 10,
      reason: !job.location
        ? "Arbetsuppgifterna är relevanta, men placeringen behöver kontrolleras."
        : "Arbetsuppgifterna är relevanta, men tydliga krav kunde inte urskiljas i underlaget.",
    };
  if (specialist) {
    const concern = specialistRequirements.find((rule) =>
      rule.pattern.test(specialist.text),
    )!.label;
    return {
      ...base,
      kind: "possible",
      reason:
        "Arbetsuppgifterna berör sökinriktningen, men ett specialistkrav behöver prövas först.",
      evidence,
      concerns: [concern],
      score: score - 15,
    };
  }
  return {
    ...base,
    kind: "priority",
    reason: strongest.reason,
    evidence,
    score,
  };
}

export function orderedJobReviews(
  jobs: JobWatchJob[],
  applications: Pick<JobApplication, "role" | "status">[] = [],
) {
  const order = { priority: 0, possible: 1, incomplete: 2, outside: 3 };
  const tags = (role: string) =>
    normalize(role).match(
      /politiskt sakkunnig|policyexpert|kommunikatör|kommunikationsstrateg|kommunikationschef|pressansvarig|presschef|handläggare|utredare|projektledare|samordnare|kanslichef|chefssekreterare|verksamhetsutvecklare|enhetschef|avdelningschef|verksamhetschef/gu,
    ) ?? [];
  const preferred = new Set(
    applications
      .filter((job) =>
        ["draft", "sent", "interview", "offer"].includes(job.status),
      )
      .flatMap((job) => tags(job.role)),
  );
  return jobs
    .map((job) => {
      const review = reviewWatchJob(job);
      const similar =
        review.kind === "priority" &&
        tags(job.role).some((tag) => preferred.has(tag));
      return {
        job,
        review: similar
          ? {
              ...review,
              score: review.score + 20,
              preference: "Liknar en roll i dina aktiva ansökningar.",
            }
          : review,
      };
    })
    .sort(
      (a, b) =>
        order[a.review.kind] - order[b.review.kind] ||
        b.review.score - a.review.score ||
        (a.job.deadline || "9999").localeCompare(b.job.deadline || "9999") ||
        a.job.role.localeCompare(b.job.role, "sv"),
    );
}
