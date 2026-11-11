import { supabase } from "./supabase";
import {
  plainText,
  parseJobPage,
  type JobDetails,
} from "../../supabase/functions/_shared/linkedin-job-details";
import type { LinkedInDraft } from "./linkedin-import";
export function detailsNotes(details: JobDetails) {
  return [
    ["Ort", details.location],
    ["Anställningsform", details.employmentType],
    ["Lön", details.salary],
    ["Publicerad", details.postedOn],
    ["Annons giltig till", details.validThrough],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}
export function applyJobDetails(
  draft: LinkedInDraft,
  details: JobDetails,
  source: "link" | "paste" = "link",
): LinkedInDraft {
  if (source === "link" && draft.readSource === "paste") return draft;
  const values = {
      role: details.role,
      organization: details.organization,
      deadline: details.deadline,
      notes: detailsNotes(details),
      advertisementText: details.description,
    },
    patch: Partial<LinkedInDraft> = {};
  for (const [key, value] of Object.entries(values))
    if (value && !draft.editedFields?.includes(key))
      Object.assign(patch, { [key]: value });
  return {
    ...draft,
    ...patch,
    readSource: source,
    fetchState: details.role && details.organization ? "ready" : "partial",
    fetchMessage:
      details.role && details.organization
        ? source === "paste"
          ? "Uppgifter lästa från inklistrad text. Granska dem innan du importerar."
          : "Uppgifter lästa från annonsen. Granska dem innan du importerar."
        : "Annonsen kunde bara läsas delvis. Komplettera uppgifterna som saknas.",
  };
}
export function detailsFromPastedText(text: string) {
  return parseJobPage(text);
}
export async function loadJobDetails(
  url: string,
  signal: AbortSignal,
): Promise<JobDetails> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const endpoint =
    process.env.NEXT_PUBLIC_LINKEDIN_JOB_ENDPOINT ||
    (base ? `${base.replace(/\/$/, "")}/functions/v1/linkedin-job` : "");
  if (!endpoint)
    throw new Error(
      "Automatisk annonsläsning är inte aktiverad ännu. Klistra in annonstexten i stället.",
    );
  const target = new URL(endpoint);
  const sameOrigin =
    typeof window !== "undefined" && target.origin === window.location.origin;
  if ((!base || target.origin !== new URL(base).origin) && !sameOrigin)
    throw new Error("Annonsläsningen har en ogiltig serveradress.");
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers.apikey = apiKey;
  let response: Response;
  try {
    response = await fetch(target.href, {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(17000)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? "Annonsen tog för lång tid att läsa. Försök igen eller klistra in texten."
        : "Annonsläsningen kunde inte ansluta. Försök igen eller klistra in annonstexten.",
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "Automatisk annonsläsning behöver aktiveras. Klistra in annonstexten i stället."
        : typeof body?.error === "string"
          ? body.error
          : "Annonsen kunde inte läsas. Försök igen eller klistra in annonstexten.",
    );
  const details = body?.details;
  if (
    !details ||
    typeof details.role !== "string" ||
    typeof details.organization !== "string"
  )
    throw new Error("Svaret innehöll inga läsbara annonsuppgifter.");
  return Object.fromEntries(
    [
      "role",
      "organization",
      "location",
      "employmentType",
      "description",
      "deadline",
      "postedOn",
      "validThrough",
      "salary",
    ].map((key) => [
      key,
      plainText(
        details[key],
        key === "description"
          ? 20000
          : key === "role" || key === "organization"
            ? 200
            : 1000,
      ),
    ]),
  ) as JobDetails;
}
