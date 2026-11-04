import type { JobApplication } from "./types";
import { today } from "./date";

export const isClosedApplication = (application: JobApplication) =>
  ["closed", "rejected"].includes(application.status);

export function applicationAttention(
  application: JobApplication,
  date = today(),
) {
  if (isClosedApplication(application)) return "Avslutad process";
  if (application.nextAction.trim() && application.followUpDate) {
    if (application.followUpDate < date) return "Uppföljning försenad";
    if (application.followUpDate === date) return "Följ upp idag";
    return "Nästa steg planerat";
  }
  if (application.status === "draft" && application.deadline) {
    if (application.deadline < date) return "Ansökningsdeadline passerad";
    if (application.deadline === date) return "Sista ansökningsdag idag";
  }
  return application.nextAction.trim()
    ? "Nästa steg saknar datum"
    : "Nästa steg saknas";
}

export function applicationOverview(
  applications: JobApplication[],
  options: {
    query: string;
    scope: "active" | "closed" | "all";
    status: string;
  },
) {
  const terms = options.query
    .trim()
    .toLocaleLowerCase("sv-SE")
    .split(/\s+/)
    .filter(Boolean);
  const nextDate = (a: JobApplication) =>
    [
      a.nextAction.trim() ? a.followUpDate : "",
      a.status === "draft" ? a.deadline : "",
    ]
      .filter(Boolean)
      .sort()[0] ?? "9999";
  return applications
    .filter((a) => {
      if (options.scope === "active" && isClosedApplication(a)) return false;
      if (options.scope === "closed" && !isClosedApplication(a)) return false;
      if (options.status !== "all" && a.status !== options.status) return false;
      const text =
        `${a.organization} ${a.role} ${a.nextAction}`.toLocaleLowerCase(
          "sv-SE",
        );
      return terms.every((term) => text.includes(term));
    })
    .sort(
      (a, b) =>
        Number(isClosedApplication(a)) - Number(isClosedApplication(b)) ||
        nextDate(a).localeCompare(nextDate(b)) ||
        a.organization.localeCompare(b.organization, "sv-SE") ||
        a.role.localeCompare(b.role, "sv-SE"),
    );
}
