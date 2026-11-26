import { linkedInJobUrl } from "../../supabase/functions/_shared/linkedin-job-url";
export { linkedInJobUrl };
import type { AppData, JobApplication } from "./types";
import { saveApplication } from "./applications";
import { today, uid } from "./date";
import { isLocalDate } from "./google-time";
import { applicationAdvertisementUrls, jobMatches } from "./job-identity";
export const LINKEDIN_STEPS = ["Bedöm jobbet", "Förbered ansökan", ""] as const;
export type LinkedInDraft = {
  key: string;
  url: string;
  role: string;
  organization: string;
  deadline: string;
  nextAction: string;
  followUpDate: string;
  selected: boolean;
  issue?: string;
  notes?: string;
  advertisementText?: string;
  readSource?: "link" | "paste";
  editedFields?: string[];
  fetchState?: "loading" | "ready" | "partial" | "error";
  fetchMessage?: string;
  separateConfirmed?: boolean;
};
export function linkedInApplicationDraft(
  draft: LinkedInDraft,
  id = draft.key,
): JobApplication {
  return {
    id,
    role: draft.role.trim(),
    organization: draft.organization.trim(),
    status: "draft",
    deadline: draft.deadline,
    nextAction: draft.nextAction,
    followUpDate: draft.nextAction ? draft.followUpDate : "",
    nextActionKind: "task",
    nextActionOwner: "Jag",
    notes: (draft.notes ?? "").slice(0, 4000),
    advertisement: {
      url: linkedInJobUrl(draft.url) ?? draft.url,
      text: (draft.advertisementText ?? "").slice(0, 60000),
    },
  };
}

export function linkedInDrafts(
  text: string,
  applications: JobApplication[],
): LinkedInDraft[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length)
    throw new Error("Klistra in minst en jobblänk, en per rad.");
  if (lines.length > 100 || text.length > 100000)
    throw new Error("Importera högst 100 länkar åt gången.");
  const seen = new Map<string, string>();
  for (const a of applications) {
    for (const source of applicationAdvertisementUrls(a)) {
      const url = linkedInJobUrl(source);
      if (url) seen.set(url, `${a.role} · ${a.organization}`);
    }
  }
  return lines.map((line) => {
    const url = linkedInJobUrl(line);
    const duplicate = url ? seen.get(url) : undefined;
    const issue = !url
      ? "Ingen giltig LinkedIn-länk till ett enskilt jobb."
      : duplicate
        ? `Finns redan: ${duplicate}`
        : undefined;
    if (url && !duplicate) seen.set(url, "en annan länk i den här importen");
    return {
      key: uid(),
      url: url ?? line,
      role: "",
      organization: "",
      deadline: "",
      nextAction: "Bedöm jobbet",
      followUpDate: today(),
      selected: !issue,
      issue,
    };
  });
}
export function importLinkedInJobs(data: AppData, drafts: LinkedInDraft[]) {
  if (drafts.length > 100)
    throw new Error("Importera högst 100 länkar åt gången.");
  const seen = new Set(
    (data.applications ?? [])
      .flatMap(applicationAdvertisementUrls)
      .map((url) => linkedInJobUrl(url))
      .filter(Boolean),
  );
  const added: JobApplication[] = [],
    skipped: string[] = [];
  for (const draft of drafts.filter((d) => d.selected)) {
    const url = linkedInJobUrl(draft.url);
    if (!url)
      throw new Error(
        "En vald jobblänk är ogiltig. Gå tillbaka och rätta länken.",
      );
    if (seen.has(url)) {
      skipped.push(url);
      continue;
    }
    if (
      !draft.role.trim() ||
      draft.role.length > 200 ||
      !draft.organization.trim() ||
      draft.organization.length > 200
    )
      throw new Error(
        "Fyll i tjänst och arbetsgivare för varje valt jobb (högst 200 tecken).",
      );
    if (
      (draft.deadline && !isLocalDate(draft.deadline)) ||
      (draft.followUpDate && !isLocalDate(draft.followUpDate))
    )
      throw new Error("Ange giltiga datum.");
    if (!LINKEDIN_STEPS.some((step) => step === draft.nextAction))
      throw new Error("Välj ett giltigt nästa steg.");
    if (
      draft.separateConfirmed !== true &&
      jobMatches(linkedInApplicationDraft(draft), [
        ...(data.applications ?? []),
        ...added,
      ]).some((match) => match.reason === "title")
    )
      throw new Error(
        "Möjlig dubblett mellan annonskällor. Samla under befintligt jobb eller bekräfta att det är en annan tjänst.",
      );
    added.push(
      saveApplication(undefined, linkedInApplicationDraft(draft, uid())),
    );
    seen.add(url);
  }
  return {
    data: added.length
      ? { ...data, applications: [...(data.applications ?? []), ...added] }
      : data,
    added,
    skipped,
  };
}
