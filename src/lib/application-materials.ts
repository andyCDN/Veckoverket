import type { AppData, JobApplication } from "./types";
import { recordApplicationEvent } from "./applications";
import { isLocalDate } from "./google-time";

export function documentUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Invalid document links are never rendered as links. */
  }
}
export function validateApplicationMaterials(a: JobApplication) {
  const text = (v: unknown, max: number): v is string =>
    typeof v === "string" && v.length <= max;
  if (a.advertisement !== undefined) {
    const ad = a.advertisement;
    if (
      !ad ||
      typeof ad !== "object" ||
      Array.isArray(ad) ||
      !text(ad.url, 2048) ||
      (ad.url !== "" && !documentUrl(ad.url)) ||
      !text(ad.text, 60000)
    )
      throw new Error("Annonsunderlaget är ogiltigt.");
  }
  if (a.materials !== undefined) {
    if (!Array.isArray(a.materials) || a.materials.length > 100)
      throw new Error("Dokumentunderlaget är ogiltigt.");
    const ids = new Set();
    for (const m of a.materials) {
      if (
        !m ||
        !text(m.id, 200) ||
        !m.id.trim() ||
        ids.has(m.id) ||
        !text(m.title, 200) ||
        !m.title.trim() ||
        !["cv", "letter", "other"].includes(m.kind) ||
        !text(m.url, 2048) ||
        !documentUrl(m.url) ||
        !text(m.version, 200) ||
        !text(m.sentOn, 10) ||
        (m.sentOn !== "" && !isLocalDate(m.sentOn))
      )
        throw new Error("Ett dokumentunderlag är ogiltigt.");
      ids.add(m.id);
    }
  }
}
export function saveApplicationMaterials(
  data: AppData,
  applicationId: string,
  materials: Pick<JobApplication, "advertisement" | "materials">,
  now = new Date(),
): AppData {
  const previous = data.applications?.find((a) => a.id === applicationId);
  if (!previous) throw new Error("Ansökan finns inte kvar.");
  validateApplicationMaterials({ ...previous, ...materials });
  if (
    JSON.stringify([previous.advertisement, previous.materials]) ===
    JSON.stringify([materials.advertisement, materials.materials])
  )
    return data;
  const next = recordApplicationEvent(
    { ...previous, ...structuredClone(materials) },
    "note",
    `Dokumentunderlag uppdaterat · ${materials.materials?.length ?? 0} dokument.`,
    now,
  );
  return {
    ...data,
    applications: data.applications!.map((a) =>
      a.id === applicationId ? next : a,
    ),
  };
}
