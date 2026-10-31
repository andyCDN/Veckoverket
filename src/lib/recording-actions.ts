import type { AppData, CareerAction } from "./types";
import type {
  RecordingSession,
  RecordingSegment,
} from "../../supabase/functions/_shared/recording-schema";
import { addDays, planningBoundary, weekday } from "./date";
import { isLocalDate } from "./google-time";
import { saveCareerAction } from "./career-actions";

const normalize = (s: string) =>
  s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
/** Locate the quote in the ordered transcript; never invent a timestamp. */
export function evidenceSegments(
  segments: RecordingSegment[],
  evidence: string,
): number[] {
  const quote = normalize(evidence);
  if (quote.length < 5) return [];
  const ordered = [...segments].sort((a, b) => a.index - b.index);
  const ranges: { index: number; start: number; end: number }[] = [];
  let source = "";
  for (const segment of ordered) {
    // Do not join transcripts across missing audio parts.
    if (ranges.length && segment.index !== ranges.at(-1)!.index + 1)
      source += "\u0000";
    else if (source) source += " ";
    const start = source.length;
    source += normalize(segment.transcript);
    ranges.push({ index: segment.index, start, end: source.length });
  }
  const start = source.indexOf(quote);
  return start < 0
    ? []
    : ranges
        .filter((r) => r.end > start && r.start < start + quote.length)
        .map((r) => r.index);
}
export function proposedActionDate(value: string, startedAt: string) {
  const date = planningBoundary(new Date(startedAt)).date,
    normalized = normalize(value).replace(/\.$/, "");
  if (isLocalDate(normalized)) return normalized;
  if (normalized === "idag") return date;
  if (normalized === "imorgon" || normalized === "i morgon")
    return addDays(date, 1);
  const days = [
    "måndag",
    "tisdag",
    "onsdag",
    "torsdag",
    "fredag",
    "lördag",
    "söndag",
  ];
  const day = days.findIndex(
    (d) =>
      normalized === d ||
      normalized === `på ${d}` ||
      normalized === `nästa ${d}`,
  );
  if (day < 0) return "";
  const offset = normalized.startsWith("nästa ")
    ? 7 - weekday(date) + day
    : (day - weekday(date) + 7) % 7;
  return addDays(date, offset);
}
function itemId(sessionId: string, text: string) {
  let hash = 14695981039346656037n;
  for (const c of normalize(text))
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(c.codePointAt(0)!)) * 1099511628211n,
    );
  return `recording-action-${sessionId}-${hash.toString(16)}`;
}
export function recordingActionProposals(
  session: RecordingSession,
  segments: RecordingSegment[],
): CareerAction[] {
  if (session.state !== "complete" || !session.summary || session.summaryStale)
    return [];
  const items = [...session.summary.agreements, ...session.summary.nextSteps];
  return [
    ...new Map(
      items.map((item) => {
        const id = itemId(session.id, `${item.text}\n${item.evidence}`);
        const action: CareerAction = {
          id,
          title: item.text,
          date: proposedActionDate(item.when, session.startedAt),
          owner: item.owner,
          reason: `Från samtalet ”${session.title}”. Tidpunkt i samtalet: ${item.when}.`,
          status: "open",
          kind: "task",
          applicationId: session.context.applicationId,
          contactId: session.context.contactId,
          interviewId: session.context.interviewId,
          source: {
            recordingId: session.id,
            evidence: item.evidence,
            segmentIndexes: evidenceSegments(segments, item.evidence),
          },
        };
        return [id, action];
      }),
    ).values(),
  ];
}
/** Validate all selections before returning anything; repeat imports are idempotent. */
export function importRecordingActions(
  data: AppData,
  session: RecordingSession,
  segments: RecordingSegment[],
  selected: CareerAction[],
) {
  const proposals = recordingActionProposals(session, segments);
  if (!proposals.length)
    throw new Error("Inspelningen saknar färdiga åtgärdsförslag.");
  let next = data;
  for (const draft of selected) {
    const original = proposals.find((a) => a.id === draft.id);
    if (!original?.source?.segmentIndexes.length)
      throw new Error(
        "Citatets ljuddel kunde inte verifieras. Läs in underlaget igen.",
      );
    if (data.careerActions?.some((a) => a.id === draft.id)) continue;
    next = saveCareerAction(next, {
      ...draft,
      status: "open",
      source: original.source,
      applicationId: session.context.applicationId,
      contactId: session.context.contactId,
      interviewId: session.context.interviewId,
    });
  }
  return next;
}
