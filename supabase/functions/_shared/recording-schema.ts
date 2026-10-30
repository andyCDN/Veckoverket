export const RECORDING_BUCKET = "interview-recordings";
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const SUMMARY_BATCH_SIZE = 30;
export type RecordingContext = {
  applicationId?: string;
  contactId?: string;
  interviewId?: string;
};
export type SummaryItem = {
  text: string;
  owner: string;
  when: string;
  evidence: string;
};
export type RecordingSummary = {
  agreements: SummaryItem[];
  nextSteps: SummaryItem[];
  uncertainties: string[];
};
export type RecordingSession = {
  id: string;
  title: string;
  context: RecordingContext;
  state: "active" | "stopped" | "complete";
  startedAt: string;
  segmentCount: number;
  summary?: RecordingSummary;
};
export type RecordingSegment = {
  index: number;
  transcript: string;
  durationMs: number;
};
export function wavDuration(bytes: Uint8Array): number {
  if (bytes.length < 46 || bytes.length > MAX_AUDIO_BYTES)
    throw new Error("Ljudsegmentet har ogiltig storlek.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = (start: number, n: number) =>
    String.fromCharCode(...bytes.slice(start, start + n));
  const rate = view.getUint32(24, true),
    length = view.getUint32(40, true);
  if (
    word(0, 4) !== "RIFF" ||
    word(8, 4) !== "WAVE" ||
    word(12, 4) !== "fmt " ||
    word(36, 4) !== "data" ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint16(34, true) !== 16 ||
    rate < 8000 ||
    rate > 192000 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint32(28, true) !== rate * 2 ||
    length !== bytes.length - 44 ||
    length % 2 ||
    view.getUint32(4, true) !== bytes.length - 8
  )
    throw new Error("Ljudet behöver vara ett komplett PCM WAV-segment.");
  const ms = Math.round((length / 2 / rate) * 1000);
  if (ms < 1 || ms > 60000) throw new Error("Ljudsegmentet är för långt.");
  return ms;
}
export function checkedSummary(
  raw: unknown,
  transcript: string,
): RecordingSummary {
  if (!raw || typeof raw !== "object")
    throw new Error("Sammanfattningen har ogiltigt format.");
  const value = raw as Record<string, unknown>,
    output: RecordingSummary = {
      agreements: [],
      nextSteps: [],
      uncertainties: [],
    };
  const normalized = (s: string) =>
    s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const source = normalized(transcript);
  for (const key of ["agreements", "nextSteps"] as const) {
    if (!Array.isArray(value[key]) || value[key].length > 20)
      throw new Error("Sammanfattningen har ogiltigt format.");
    for (const item of value[key] as unknown[]) {
      if (!item || typeof item !== "object")
        throw new Error("Sammanfattningen har ogiltigt format.");
      const r = item as Record<string, unknown>;
      if (
        !["text", "owner", "when", "evidence"].every(
          (k) =>
            typeof r[k] === "string" &&
            (r[k] as string).length <= (k === "evidence" ? 600 : 400),
        ) ||
        !(r.text as string).trim()
      )
        throw new Error("Sammanfattningen har ogiltigt format.");
      const entry = r as unknown as SummaryItem;
      if (
        normalized(entry.evidence).length < 5 ||
        !source.includes(normalized(entry.evidence))
      )
        output.uncertainties.push(`Ej belagt i transkriptionen: ${entry.text}`);
      else
        output[key].push({
          text: entry.text,
          owner: entry.owner || "Ej fastställt",
          when: entry.when || "Ej fastställt",
          evidence: entry.evidence,
        });
    }
  }
  if (
    !Array.isArray(value.uncertainties) ||
    value.uncertainties.length > 20 ||
    !value.uncertainties.every((s) => typeof s === "string" && s.length <= 600)
  )
    throw new Error("Sammanfattningen har ogiltigt format.");
  output.uncertainties.push(...value.uncertainties);
  return output;
}
export function combineSummaries(parts: RecordingSummary[]): RecordingSummary {
  const unique = <T>(items: T[]) =>
    Array.from(new Map(items.map((i) => [JSON.stringify(i), i])).values());
  return {
    agreements: unique(parts.flatMap((p) => p.agreements)),
    nextSteps: unique(parts.flatMap((p) => p.nextSteps)),
    uncertainties: unique(parts.flatMap((p) => p.uncertainties)),
  };
}
export function summaryText(summary: RecordingSummary): string {
  const item = (i: SummaryItem) =>
    `- ${i.text} · Ansvarig: ${i.owner} · Tidpunkt: ${i.when}`;
  return [
    "Uttalade överenskommelser",
    ...(summary.agreements.length
      ? summary.agreements.map(item)
      : ["Inga belagda överenskommelser identifierade."]),
    "",
    "Föreslagna nästa steg",
    ...(summary.nextSteps.length
      ? summary.nextSteps.map(item)
      : ["Inga identifierade."]),
    "",
    "Osäkert eller ej fastställt",
    ...(summary.uncertainties.length
      ? summary.uncertainties.map((s) => `- ${s}`)
      : ["Inga ytterligare uppgifter identifierade."]),
  ].join("\n");
}
