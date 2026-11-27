import type { AppData, JobCvCheck, JobCvProfile } from "./types";
import type { AdRequirement } from "./job-review";
import { jobUrlKey } from "./job-ad-url";

export const CV_TEXT_LIMIT = 60000;
export type RequirementComparison = AdRequirement & {
  verdict: "supported" | "review" | "missing";
  evidence: string;
  suggestions: string[];
};

function validJobKey(key: unknown) {
  return (
    typeof key === "string" &&
    key.length <= 2048 &&
    (!!jobUrlKey(key) || /^application:[\w-]{1,200}$/u.test(key))
  );
}

export function validateJobCvProfile(
  value: unknown,
): asserts value is JobCvProfile | undefined {
  if (value === undefined) return;
  const p = value as JobCvProfile;
  if (
    !p ||
    typeof p !== "object" ||
    Array.isArray(p) ||
    typeof p.text !== "string" ||
    p.text.trim().length < 40 ||
    p.text.length > CV_TEXT_LIMIT ||
    typeof p.updatedAt !== "string" ||
    p.updatedAt.length > 100 ||
    !Number.isFinite(Date.parse(p.updatedAt)) ||
    !Array.isArray(p.checks) ||
    p.checks.length > 1000
  )
    throw new Error("CV-underlaget är ogiltigt.");
  const seen = new Set<string>();
  for (const check of p.checks) {
    if (
      !check ||
      !validJobKey(check.jobKey) ||
      typeof check.requirement !== "string" ||
      !check.requirement.trim() ||
      check.requirement.length > 4000 ||
      !["required", "preferred"].includes(check.kind) ||
      !["supported", "missing"].includes(check.verdict) ||
      typeof check.evidence !== "string" ||
      check.evidence.length > 1500 ||
      (check.verdict === "supported" &&
        (check.evidence.trim().length < 8 ||
          !p.text.includes(check.evidence))) ||
      (check.verdict === "missing" && check.evidence !== "")
    )
      throw new Error("En CV-jämförelse är ogiltig.");
    const key = JSON.stringify([check.jobKey, check.kind, check.requirement]);
    if (seen.has(key)) throw new Error("CV-jämförelsen innehåller dubbletter.");
    seen.add(key);
  }
}

export function saveJobCvProfile(
  data: AppData,
  text: string,
  now = new Date(),
): AppData {
  const clean = text.replace(/\r\n?/gu, "\n").trim();
  if (data.jobSearch?.cvProfile?.text === clean) return data;
  const cvProfile: JobCvProfile = {
    text: clean,
    updatedAt: now.toISOString(),
    checks: [],
  };
  validateJobCvProfile(cvProfile);
  return { ...data, jobSearch: { ...data.jobSearch, cvProfile } };
}

export function removeJobCvProfile(data: AppData): AppData {
  if (!data.jobSearch?.cvProfile) return data;
  const { cvProfile: _profile, ...jobSearch } = data.jobSearch;
  return { ...data, jobSearch };
}

const stopWords = new Set(
  "att och eller inom samt som med har ska skall du vi dig ditt dina din för från till ett en den det de av är vara var varit mycket god goda hög relevant relevanta motsvarande erfarenhet erfarenheter erfaren utbildning kunskap kunskaper arbete arbetet arbeta arbetat söker söker god förmåga flera års minst gärna meriterande krävs krav exempelvis också behöver dokumenterad gedigen bakgrund aktuell tidigare ansvar åren både".split(
    " ",
  ),
);
function terms(text: string) {
  return new Set(
    (
      text
        .normalize("NFKC")
        .toLocaleLowerCase("sv-SE")
        .match(/[\p{L}\d]+/gu) ?? []
    )
      .filter((word) => word.length >= 4 && !stopWords.has(word))
      .map((word) => (word.length > 7 ? word.slice(0, 7) : word)),
  );
}

/** These are candidate excerpts only. Shared words never certify a qualification. */
export function cvEvidenceSuggestions(requirement: string, cv: string) {
  const wanted = terms(requirement);
  if (!wanted.size) return [];
  const fragments = [
    ...new Set(
      cv
        .split(/\n+|(?<=[.!?])\s+/u)
        .map((s) => s.trim())
        .filter((s) => s.length >= 8),
    ),
  ];
  return fragments
    .filter(
      (line) =>
        !/(?:saknar|ingen erfarenhet|inte arbetat|inte (?:har|haft)|utan erfarenhet)/iu.test(
          line,
        ),
    )
    .map((line) => {
      const tokens = terms(line);
      const hits = [...wanted].filter((word) => tokens.has(word));
      const score = hits.reduce((sum, word) => sum + word.length, 0);
      const first = hits[0];
      const offset = line.toLocaleLowerCase("sv-SE").indexOf(first ?? "");
      const start = line.length > 900 ? Math.max(0, offset - 200) : 0;
      return { evidence: line.slice(start, start + 900), score };
    })
    .filter((row) => row.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => row.evidence);
}

export function compareJobRequirements(
  requirements: AdRequirement[],
  jobKeys: string[],
  profile?: JobCvProfile,
  withSuggestions = true,
): RequirementComparison[] {
  const keys = new Set(jobKeys.map((key) => jobUrlKey(key) ?? key));
  const checks =
    profile?.checks.filter((check) =>
      keys.has(jobUrlKey(check.jobKey) ?? check.jobKey),
    ) ?? [];
  return requirements.map((requirement) => {
    const check = checks.find(
      (check) =>
        check.kind === requirement.kind &&
        check.requirement === requirement.text,
    );
    return {
      ...requirement,
      verdict: check?.verdict ?? "review",
      evidence: check?.evidence ?? "",
      suggestions:
        profile && !check && withSuggestions
          ? cvEvidenceSuggestions(requirement.text, profile.text)
          : [],
    };
  });
}

export function saveJobCvCheck(
  data: AppData,
  jobKeys: string[],
  requirement: AdRequirement,
  verdict: JobCvCheck["verdict"] | "review",
  evidence = "",
): AppData {
  const profile = data.jobSearch?.cvProfile;
  if (!profile) throw new Error("Lägg till ditt CV-underlag först.");
  const keys = jobKeys.map((key) => jobUrlKey(key) ?? key).filter(validJobKey);
  if (!keys.length) throw new Error("Jobbet saknar en giltig identitet.");
  const checks = profile.checks.filter(
    (check) =>
      !(
        keys.includes(jobUrlKey(check.jobKey) ?? check.jobKey) &&
        check.kind === requirement.kind &&
        check.requirement === requirement.text
      ),
  );
  if (verdict !== "review")
    checks.push({
      jobKey: keys[0],
      requirement: requirement.text,
      kind: requirement.kind,
      verdict,
      evidence: verdict === "supported" ? evidence.trim() : "",
    });
  const cvProfile = { ...profile, checks: checks.slice(-1000) };
  validateJobCvProfile(cvProfile);
  return { ...data, jobSearch: { ...data.jobSearch, cvProfile } };
}
