import { describe, expect, it } from "vitest";
import { createData } from "../lib/defaults";
import {
  applyActivityExclusions,
  RETIRED_LINKEDIN_PASS,
} from "../lib/activity-exclusions";
import { upgradePersonalWeek } from "../lib/personal-week";
import { generateWeek, validatePlan } from "../lib/planner";
import { templateSettings } from "../lib/week-template";
import {
  googleEventActivities,
  previewGoogleImport,
  type GoogleSnapshot,
} from "../lib/google-calendar";
import { GOOGLE_CATEGORY } from "../lib/external-calendar";
import { decodeData } from "../lib/storage";
import type { Activity } from "../lib/types";

const boundary = { date: "2026-11-20", minute: 600 };
const current = "2026-11-16",
  next = "2026-11-23";
const calendar = {
  id: "calendar",
  summary: "Min kalender",
  timeZone: "Europe/Stockholm",
};
const pass = (id: string, patch: Partial<Activity> = {}): Activity => ({
  id,
  title: RETIRED_LINKEDIN_PASS,
  date: current,
  start: 510,
  end: 570,
  description: "",
  categoryId: "career",
  estimatedMinutes: 60,
  blockType: "flexible",
  priority: 3,
  status: "planned",
  source: "manual",
  ...patch,
});

describe("borttaget fristående LinkedIn-pass", () => {
  it("tar bara bort planerade matchande pass i aktuell och framtida veckor", () => {
    const data = createData();
    data.weeks = {
      "2026-11-09": {
        week: "2026-11-09",
        generatedAt: "",
        activities: [pass("history", { date: "2026-11-09" })],
      },
      [current]: {
        week: current,
        generatedAt: "",
        activities: [
          pass("remove"),
          pass("done", { status: "done" }),
          pass("skipped", { status: "skipped" }),
          pass("other", { title: "Uppdatera LinkedIn-profilen" }),
        ],
      },
      [next]: {
        week: next,
        generatedAt: "",
        templateId: "mon-thu-v1",
        activities: [
          pass("future", {
            date: next,
            title: "  ETT JOBB  om dagen på Linkedin  ",
          }),
          pass("meeting", { date: next, title: "Eget möte" }),
        ],
      },
    };
    const before = structuredClone(data);
    const cleaned = applyActivityExclusions(data, boundary);
    expect(cleaned.weeks[current].activities.map((a) => a.id)).toEqual([
      "done",
      "skipped",
      "other",
    ]);
    expect(cleaned.weeks[next].activities.map((a) => a.id)).toEqual([
      "meeting",
    ]);
    expect(cleaned.weeks[next].templateId).toBeUndefined();
    expect(cleaned.weeks["2026-11-09"]).toBe(data.weeks["2026-11-09"]);
    expect(cleaned.settings.excludedActivityTitles).toEqual([
      RETIRED_LINKEDIN_PASS,
    ]);
    expect(applyActivityExclusions(cleaned, boundary)).toBe(cleaned);
    expect(
      decodeData(JSON.stringify(cleaned)).settings.excludedActivityTitles,
    ).toEqual([RETIRED_LINKEDIN_PASS]);
    expect(data).toEqual(before);
  });

  it("frigör mallens riktiga jobbsökspass och stoppar den gamla återkommande regeln", () => {
    const data = createData();
    data.settings = templateSettings(data.settings);
    data.recurring = [
      {
        id: "linkedin-rule",
        title: RETIRED_LINKEDIN_PASS,
        startsOn: current,
        weekdays: [0, 1, 2, 3],
        start: 510,
        end: 570,
        description: "",
        categoryId: "career",
        estimatedMinutes: 60,
        priority: 3,
        blockType: "flexible",
      },
    ];
    data.weeks[next] = generateWeek(next, data).plan;
    expect(
      data.weeks[next].activities.filter(
        (a) => a.title === RETIRED_LINKEDIN_PASS,
      ),
    ).toHaveLength(4);
    const cleaned = upgradePersonalWeek(data, boundary);
    const activities = cleaned.weeks[next].activities;
    expect(activities.some((a) => a.title === RETIRED_LINKEDIN_PASS)).toBe(
      false,
    );
    expect(
      activities
        .filter((a) => a.title === "Söka jobb")
        .map(({ date, start, end }) => [date, start, end]),
    ).toEqual([
      [next, 540, 630],
      ["2026-11-24", 510, 600],
      ["2026-11-25", 510, 600],
      ["2026-11-26", 510, 600],
    ]);
    expect(activities).toHaveLength(19);
    expect(validatePlan(activities, cleaned.settings)).toEqual([]);
    expect(
      generateWeek("2026-11-30", cleaned).plan.activities.some(
        (a) => a.title === RETIRED_LINKEDIN_PASS,
      ),
    ).toBe(false);
    expect(
      generateWeek("2026-11-30", {
        ...cleaned,
        settings: { ...cleaned.settings, weekTemplate: "off" },
      }).plan.activities.some((a) => a.title === RETIRED_LINKEDIN_PASS),
    ).toBe(false);
    expect(upgradePersonalWeek(cleaned, boundary)).toBe(cleaned);
  });

  it("ersätter inte en LinkedIn-enda vecka med en tom vecka när jobbsök ska finnas kvar", () => {
    const data = createData();
    data.settings = templateSettings(data.settings);
    data.weeks[next] = {
      week: next,
      generatedAt: "",
      activities: [pass("only", { date: next })],
    };
    const cleaned = upgradePersonalWeek(data, boundary);
    expect(cleaned.weeks[next].activities).toHaveLength(19);
    expect(
      cleaned.weeks[next].activities.find((a) => a.title === "Söka jobb")
        ?.start,
    ).toBe(540);
  });

  it.each(["google", "ical"] as const)(
    "återimporterar inte planerade LinkedIn-pass via %s men behåller genomförda pass och andra möten",
    (transport) => {
      const data = createData();
      data.categories.push(GOOGLE_CATEGORY);
      data.settings = templateSettings(data.settings);
      const imported = googleEventActivities(
        calendar,
        [
          {
            id: "done",
            summary: RETIRED_LINKEDIN_PASS,
            start: { dateTime: "2026-11-17T08:30:00+01:00" },
            end: { dateTime: "2026-11-17T09:30:00+01:00" },
          },
          {
            id: "remove",
            summary: RETIRED_LINKEDIN_PASS,
            start: { dateTime: "2026-11-19T08:30:00+01:00" },
            end: { dateTime: "2026-11-19T09:30:00+01:00" },
          },
          {
            id: "meeting",
            summary: "Eget bokat möte",
            start: { dateTime: "2026-11-18T14:00:00+01:00" },
            end: { dateTime: "2026-11-18T15:00:00+01:00" },
          },
        ],
        current,
      );
      data.weeks[current] = {
        week: current,
        generatedAt: "",
        activities: [{ ...imported[0], status: "done" }],
        rules: data.settings,
      };
      const snapshot: GoogleSnapshot = {
        week: current,
        calendarIds: [calendar.id],
        activities: imported,
        importedAt: "2026-11-20T09:00:00Z",
        ...(transport === "ical" ? { transport: "ical" as const } : {}),
      };
      const first = previewGoogleImport(data, snapshot).data;
      const repeated = previewGoogleImport(first, snapshot).data;
      for (const result of [first, repeated]) {
        const activities = result.weeks[current].activities;
        expect(
          activities.some(
            (a) => a.title === RETIRED_LINKEDIN_PASS && a.status === "planned",
          ),
        ).toBe(false);
        expect(activities).toContainEqual(
          expect.objectContaining({ id: imported[0].id, status: "done" }),
        );
        expect(activities.some((a) => a.title === "Eget bokat möte")).toBe(
          true,
        );
      }
    },
  );

  it("tillåter att användaren väljer att visa rubriken igen", () => {
    const data = createData();
    data.settings.excludedActivityTitles = [];
    data.weeks[current] = {
      week: current,
      generatedAt: "",
      activities: [pass("allowed")],
    };
    expect(applyActivityExclusions(data, boundary)).toBe(data);
  });
});
