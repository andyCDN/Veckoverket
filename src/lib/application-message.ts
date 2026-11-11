import type { JobApplication, ApplicationStatus } from "./types";
import { addDays, today, uid } from "./date";
import { recordApplicationEvent, saveApplication } from "./applications";

const normalize = (text: string) =>
  text.normalize("NFKC").toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();

// A deterministic identifier for repeated pastes; classification runs locally.
function messageKey(text: string) {
  let hash = 2166136261;
  for (const char of normalize(text))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `[besked:${(hash >>> 0).toString(16)}:${normalize(text).length}]`;
}

export function hasApplicationMessage(
  application: JobApplication,
  text: string,
) {
  return (
    application.history?.some(
      (entry) =>
        entry.kind === "note" && entry.notes.startsWith(messageKey(text)),
    ) ?? false
  );
}

export function classifyApplicationMessage(
  text: string,
  applications: JobApplication[],
  date = today(),
) {
  const body = normalize(text.slice(0, 12000));
  // Conflicting signals (for example quoted older messages) require manual classification.
  const rules: {
    status: ApplicationStatus;
    pattern: RegExp;
    reason: string;
  }[] = [
    {
      status: "rejected",
      pattern:
        /(?:gått|gå|går) vidare med andra|inte (?:gå|går|kommer att gå) vidare med (?:din|er) ansökan|tyvärr.{0,80}(?:inte|annan kandidat)|not (?:be )?(?:moving|proceeding) forward|unfortunately.{0,80}(?:not|another candidate)|tjänsten har tillsatts/,
      reason: "Beskedet innehåller ett tydligt avslag.",
    },
    {
      status: "interview",
      pattern:
        /(?:bjuda|bjuder|välkomna|välkomnar|inbjudan).{0,65}(?:intervju|interview)|(?:boka|boka in|book|schedule).{0,40}(?:intervju|interview)|invite.{0,55}(?:interview)|intervju.{0,30}(?:bokad|bekräftad)/,
      reason: "Beskedet innehåller en inbjudan eller bokning till intervju.",
    },
    {
      status: "sent",
      pattern:
        /(?:tack för|mottagit|tagit emot|bekräftar).{0,55}(?:din ansökan|er ansökan)|(?:received|thank you for).{0,40}(?:your application|applying)/,
      reason: "Beskedet bekräftar att ansökan har tagits emot.",
    },
    {
      status: "offer",
      pattern:
        /(?:erbjuda|erbjuder).{0,45}(?:dig|er).{0,40}(?:tjänsten|anställning|jobbet)|(?:offer you|offering you).{0,40}(?:position|role|job)|anställningserbjudande|job offer/,
      reason: "Beskedet innehåller ett erbjudande om anställning.",
    },
  ];
  const signals = rules.filter((rule) => {
    if (!rule.pattern.test(body)) return false;
    if (
      rule.status === "interview" &&
      /(?:inte|not).{0,25}(?:bjuda|bjuder|boka|invite|schedule)/.test(body)
    )
      return false;
    if (
      rule.status === "offer" &&
      /(?:inte|not).{0,25}(?:erbjuda|erbjuder|offer)/.test(body)
    )
      return false;
    return true;
  });
  // A generic receipt is often included in a later response; the later explicit outcome wins.
  const outcomes = signals.filter((rule) => rule.status !== "sent");
  const signal =
    outcomes.length === 1
      ? outcomes[0]
      : outcomes.length === 0 && signals.length === 1
        ? signals[0]
        : undefined;
  const contains = (value: string) => {
    const needle = normalize(value);
    if (needle.length < 3) return false;
    const at = body.indexOf(needle);
    return (
      at >= 0 &&
      !/[\p{L}\p{N}]/u.test(body[at - 1] ?? " ") &&
      !/[\p{L}\p{N}]/u.test(body[at + needle.length] ?? " ")
    );
  };
  const matches = applications.filter((a) => contains(a.organization));
  const withRole = matches.filter((a) => contains(a.role));
  const candidates = withRole.length ? withRole : matches;
  const status = signal?.status;
  const nextAction =
    status === "sent"
      ? "Följ upp ansökan"
      : status === "interview"
        ? "Bekräfta intervjutid och förbered intervjun"
        : status === "offer"
          ? "Gå igenom erbjudandet och svara arbetsgivaren"
          : "";
  return {
    applicationId: candidates.length === 1 ? candidates[0].id : "",
    status,
    reason:
      signal?.reason ??
      (outcomes.length > 1
        ? "Flera motstridiga besked hittades. Välj status själv och kontrollera vilken del som är aktuell."
        : "Ingen säker status kunde identifieras. Välj status själv."),
    matchReason:
      candidates.length === 1
        ? "Arbetsgivarens namn matchar" +
          (withRole.length ? " tillsammans med tjänsten." : ".")
        : candidates.length > 1
          ? "Flera ansökningar matchar. Välj rätt ansökan."
          : "Ingen entydig ansökan hittades. Välj ansökan själv.",
    nextAction,
    followUpDate:
      status === "sent" ? addDays(date, 7) : nextAction ? addDays(date, 1) : "",
    nextActionKind: (status === "sent" ? "waiting" : "task") as
      "waiting" | "task",
  };
}

export type ApplicationMessageUpdate = Pick<
  JobApplication,
  "status" | "nextAction" | "followUpDate" | "nextActionKind"
>;

export function applyApplicationMessage(
  application: JobApplication,
  text: string,
  update: ApplicationMessageUpdate,
  now = new Date(),
) {
  if (!text.trim() || text.length > 12000)
    throw new Error("Klistra in ett besked på högst 12 000 tecken.");
  if (hasApplicationMessage(application, text))
    throw new Error("Det här beskedet är redan sparat på ansökan.");
  const closed = update.status === "rejected" || update.status === "closed";
  const nextAction = closed ? "" : update.nextAction.trim();
  const changed = saveApplication(
    application,
    {
      ...application,
      ...update,
      nextAction,
      followUpDate: nextAction ? update.followUpDate : "",
      nextActionKind: nextAction ? update.nextActionKind : undefined,
      nextActionOwner: nextAction
        ? update.nextActionKind === "waiting"
          ? application.organization
          : "Jag"
        : undefined,
      nextActionReason: nextAction
        ? "Nästa steg från inklistrat rekryteringsbesked."
        : undefined,
      // A new task must not reuse a booking for the preceding task.
      nextActionId: undefined,
    },
    now,
  );
  if (
    nextAction &&
    (application.nextAction !== nextAction ||
      application.nextActionKind !== update.nextActionKind)
  ) {
    // saveApplication preserves an existing action identity; force a fresh identity for a changed task.
    changed.nextActionId = uid();
  }
  return recordApplicationEvent(
    changed,
    "note",
    `${messageKey(text)}\nRekryteringsbesked (granskat):\n${text.trim().slice(0, 3500)}${text.trim().length > 3500 ? "\n[Texten är förkortad i historiken.]" : ""}`,
    now,
  );
}
