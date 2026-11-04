import { expect, it } from "vitest";
import {
  applicationAttention,
  applicationOverview,
} from "../lib/application-overview";
import type { JobApplication } from "../lib/types";

const make = (
  id: string,
  patch: Partial<JobApplication> = {},
): JobApplication => ({
  id,
  organization: "Stadshuset",
  role: "Utredare",
  status: "sent",
  deadline: "",
  nextAction: "Kontakta rekryteraren",
  followUpDate: "",
  notes: "",
  ...patch,
});
it("searches across employer, role and next step and separates closed processes", () => {
  const applications = [
    make("active"),
    make("closed", { status: "closed" }),
    make("rejected", { status: "rejected" }),
  ];
  expect(
    applicationOverview(applications, {
      query: "STADSHUSET utredare",
      scope: "active",
      status: "all",
    }).map((a) => a.id),
  ).toEqual(["active"]);
  expect(
    applicationOverview(applications, {
      query: "rekryteraren",
      scope: "closed",
      status: "all",
    }),
  ).toHaveLength(2);
  expect(
    applicationOverview(applications, {
      query: "",
      scope: "all",
      status: "rejected",
    }).map((a) => a.id),
  ).toEqual(["rejected"]);
});
it("sorts by relevant upcoming action or draft deadline without changing saved order", () => {
  const applications = [
    make("undated"),
    make("late", { followUpDate: "2026-11-05" }),
    make("draft", { status: "draft", deadline: "2026-11-03" }),
    make("early", { followUpDate: "2026-11-02", deadline: "2026-01-01" }),
  ];
  expect(
    applicationOverview(applications, {
      query: "",
      scope: "active",
      status: "all",
    }).map((a) => a.id),
  ).toEqual(["early", "draft", "late", "undated"]);
  expect(applications.map((a) => a.id)).toEqual([
    "undated",
    "late",
    "draft",
    "early",
  ]);
});
it("shows the next action state without flagging closed processes or sent deadlines", () => {
  const date = "2026-11-03";
  expect(
    applicationAttention(make("x", { followUpDate: "2026-11-02" }), date),
  ).toBe("Uppföljning försenad");
  expect(applicationAttention(make("x", { followUpDate: date }), date)).toBe(
    "Följ upp idag",
  );
  expect(applicationAttention(make("x", { nextAction: "" }), date)).toBe(
    "Nästa steg saknas",
  );
  expect(
    applicationAttention(
      make("x", { status: "closed", followUpDate: "2026-11-02" }),
      date,
    ),
  ).toBe("Avslutad process");
});
