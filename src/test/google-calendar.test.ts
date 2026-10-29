import { afterEach, describe, expect, it, vi } from "vitest";
import { createData } from "../lib/defaults";
import {
  categoryMinutes,
  generateWeek,
  validatePlan,
  visibleDays,
} from "../lib/planner";
import { decodeData } from "../lib/storage";
import { GOOGLE_CATEGORY, googleEventUrl } from "../lib/external-calendar";
import { googleInstant, googleWeekRange } from "../lib/google-time";
import {
  fetchGoogleWeek,
  googleEventActivities,
  listGoogleCalendars,
  previewGoogleImport,
  removeGoogleImports,
  type GoogleEvent,
  type GoogleSnapshot,
} from "../lib/google-calendar";
import { validateGoogleClientId } from "../lib/cloud-config";
const week = "2026-10-26",
  calendar = {
    id: "a@example.test",
    summary: "Min kalender",
    timeZone: "Europe/Stockholm",
  };
function event(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "event-1",
    summary: "Möte",
    start: { dateTime: "2026-10-26T09:00:00+01:00" },
    end: { dateTime: "2026-10-26T10:00:00+01:00" },
    htmlLink: "https://www.google.com/calendar/event?eid=example",
    ...overrides,
  };
}
function fixture() {
  const data = createData();
  data.weeks[week] = generateWeek(week, data).plan;
  return data;
}
function snapshot(events = [event()], value = week): GoogleSnapshot {
  return {
    week: value,
    calendarIds: [calendar.id],
    activities: googleEventActivities(calendar, events, value),
    importedAt: "2026-10-29T10:00:00Z",
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("Google-kalenderns datum och källhändelser", () => {
  it("konverterar UTC till svensk tid och behåller stabila externa ID:n", () => {
    const [a] = googleEventActivities(
      calendar,
      [
        event({
          start: { dateTime: "2026-10-29T09:00:00Z" },
          end: { dateTime: "2026-10-29T10:00:00Z" },
        }),
      ],
      week,
    );
    expect(a).toMatchObject({
      date: "2026-10-29",
      start: 600,
      end: 660,
      blockType: "locked",
      source: "external",
      external: {
        calendarId: calendar.id,
        eventId: "event-1",
        busy: true,
        allDay: false,
      },
    });
    expect(googleEventActivities(calendar, [event()], week)[0].id).toBe(
      googleEventActivities(
        calendar,
        [event({ summary: "Ändrad rubrik" })],
        week,
      )[0].id,
    );
  });
  it("hanterar tidszon utan explicit offset och avvisar obefintlig svensk vårtid", () => {
    expect(
      new Date(
        googleInstant("2026-10-29T09:00:00", "America/New_York"),
      ).toISOString(),
    ).toBe("2026-10-29T13:00:00.000Z");
    expect(() => googleInstant("2026-03-29T02:30:00")).toThrow();
  });
  it("använder korrekta veckogränser vid båda tidsomställningarna", () => {
    expect(googleWeekRange("2026-03-23")).toEqual({
      timeMin: "2026-03-22T23:00:00.000Z",
      timeMax: "2026-03-29T22:00:00.000Z",
    });
    expect(googleWeekRange("2026-10-19")).toEqual({
      timeMin: "2026-10-18T22:00:00.000Z",
      timeMax: "2026-10-25T23:00:00.000Z",
    });
  });
  it("delar händelser över midnatt och behandlar heldagens slutdatum som exklusivt", () => {
    const parts = googleEventActivities(
      calendar,
      [
        event({
          start: { dateTime: "2026-10-29T23:30:00+01:00" },
          end: { dateTime: "2026-10-30T01:15:00+01:00" },
        }),
      ],
      week,
    );
    expect(parts.map((a) => [a.date, a.start, a.end])).toEqual([
      ["2026-10-29", 1410, 1440],
      ["2026-10-30", 0, 75],
    ]);
    const days = googleEventActivities(
      calendar,
      [event({ start: { date: "2026-10-30" }, end: { date: "2026-11-02" } })],
      week,
    );
    expect(days.map((a) => a.date)).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(
      days.every((a) => a.external?.allDay && a.start === 0 && a.end === 1440),
    ).toBe(true);
  });
  it("reserverar den upprepade hösttimmen utan negativ eller för kort tidslängd", () => {
    const [a] = googleEventActivities(
      calendar,
      [
        event({
          start: { dateTime: "2026-10-25T02:30:00+02:00" },
          end: { dateTime: "2026-10-25T02:15:00+01:00" },
        }),
      ],
      "2026-10-19",
    );
    expect(a.start).toBe(120);
    expect(a.end).toBe(180);
    expect(a.external?.originalStart).toBe("2026-10-25T00:30:00.000Z");
  });
  it("ignorerar avbokade poster och bevarar privat rubrik som Upptagen", () => {
    expect(
      googleEventActivities(
        calendar,
        [{ id: "cancel", status: "cancelled" }],
        week,
      ),
    ).toEqual([]);
    expect(
      googleEventActivities(calendar, [event({ summary: "" })], week)[0].title,
    ).toBe("Upptagen");
    expect(() =>
      googleEventActivities(calendar, [event({ end: undefined })], week),
    ).toThrow();
    expect(() =>
      googleEventActivities(calendar, [event(), event()], week),
    ).toThrow();
  });
  it("tillåter bara Googles kalenderlänkar och publika OAuth-klient-ID:n", () => {
    expect(googleEventUrl("javascript:alert(1)")).toBeUndefined();
    expect(
      googleEventUrl("https://calendar.google.com.evil.test/calendar/event"),
    ).toBeUndefined();
    expect(
      googleEventUrl("https://www.google.com/calendar/event?eid=ok"),
    ).toContain("google.com");
    expect(() =>
      validateGoogleClientId("123456789-test.apps.googleusercontent.com"),
    ).not.toThrow();
    expect(() => validateGoogleClientId("GOCSPX-not-a-client-id")).toThrow();
  });
});
describe("planering med importerade tider", () => {
  it("importerar utan dubbletter och behåller egna pass, avbockning och säkerhetskopior", () => {
    const data = fixture(),
      initial = data.weeks[week].activities.map((a) => ({ ...a }));
    const first = previewGoogleImport(data, snapshot(), false).data;
    const imported = first.weeks[week].activities.find((a) => a.external)!;
    imported.status = "done";
    const again = previewGoogleImport(first, snapshot(), false).data;
    expect(again.weeks[week].activities.filter((a) => a.external)).toHaveLength(
      1,
    );
    expect(again.weeks[week].activities.find((a) => a.external)?.status).toBe(
      "done",
    );
    expect(again.weeks[week].activities.filter((a) => !a.external)).toEqual(
      initial,
    );
    expect(decodeData(JSON.stringify(again))).toEqual(again);
    expect(removeGoogleImports(again).weeks[week].activities).toEqual(initial);
  });
  it("planerar om oredigerade förslag runt upptagen tid utan att flytta skyddad musik", () => {
    const data = fixture();
    const music = data.weeks[week].activities.filter(
      (a) => a.categoryId === "music",
    );
    const imported = previewGoogleImport(data, snapshot(), true);
    expect(imported.replanned).toBe(true);
    expect(imported.conflicts.filter((c) => c.severity === "error")).toEqual(
      [],
    );
    expect(
      imported.data.weeks[week].activities.filter(
        (a) => a.categoryId === "music",
      ),
    ).toEqual(music);
    const busy = imported.data.weeks[week].activities.find((a) => a.external)!;
    expect(
      imported.data.weeks[week].activities
        .filter((a) => !a.external && a.date === busy.date)
        .every((a) => a.end <= busy.start || a.start >= busy.end),
    ).toBe(true);
  });
  it("visar externa helg- och kvällshändelser utan tillgänglighetsfel", () => {
    const data = fixture();
    const entries = googleEventActivities(
      calendar,
      [
        event({
          start: { dateTime: "2026-10-31T18:00:00+01:00" },
          end: { dateTime: "2026-10-31T19:00:00+01:00" },
        }),
      ],
      week,
    );
    expect(validatePlan(entries, data.settings)).toEqual([]);
    expect(visibleDays(data.settings, entries)).toContain(5);
  });
  it("räknar bara upptagna tidsatta Google-poster i timsummor", () => {
    const entries = googleEventActivities(
      calendar,
      [
        event(),
        event({ id: "free", transparency: "transparent" }),
        event({
          id: "day",
          start: { date: week },
          end: { date: "2026-10-27" },
        }),
      ],
      week,
    );
    expect(categoryMinutes(entries)).toEqual({ "google-calendar": 60 });
    expect(categoryMinutes(entries, "done")).toEqual({});
  });
  it("låter en kvällsbokning förbli utanför planeringsluckorna", () => {
    const data = fixture();
    const result = previewGoogleImport(
      data,
      snapshot([
        event({
          start: { dateTime: "2026-10-26T18:00:00+01:00" },
          end: { dateTime: "2026-10-26T19:00:00+01:00" },
        }),
      ]),
    );
    expect(result.replanned).toBe(true);
    expect(
      result.data.weeks[week].activities
        .filter((a) => !a.external)
        .every(
          (a) => a.start >= data.settings.start && a.end <= data.settings.end,
        ),
    ).toBe(true);
  });
  it("låter transparenta Google-poster visas utan att blockera eller ge buffertfel", () => {
    const data = fixture(),
      normal = generateWeek(week, data).plan;
    const result = previewGoogleImport(
      data,
      snapshot([event({ transparency: "transparent" })]),
      true,
    );
    expect(result.replanned).toBe(true);
    expect(
      result.data.weeks[week].activities
        .filter((a) => !a.external)
        .map((a) => [a.categoryId, a.date, a.start, a.end]),
    ).toEqual(
      normal.activities.map((a) => [a.categoryId, a.date, a.start, a.end]),
    );
  });
  it("importerar bokningar men behåller egna aktiviteter när automatisk omplanering har hårda konflikter", () => {
    const data = fixture();
    data.weeks[week].activities[0].source = "manual";
    const original = structuredClone(data.weeks[week].activities[0]);
    const result = previewGoogleImport(data, snapshot(), true);
    expect(result.replanned).toBe(false);
    expect(result.conflicts.some((c) => c.severity === "error")).toBe(true);
    expect(
      result.data.weeks[week].activities.find((a) => a.id === original.id),
    ).toEqual(original);
  });
  it("tar bort avbokade källhändelser men inte lokala aktiviteter eller andra kalendrar", () => {
    const data = previewGoogleImport(fixture(), snapshot(), false).data;
    const second = {
      ...snapshot(),
      calendarIds: ["other"],
      activities: googleEventActivities(
        { id: "other", summary: "Andra" },
        [event()],
        week,
      ),
    };
    const both = previewGoogleImport(data, second, false).data;
    // Recreate both selected sources to make their independent identities explicit.
    const combined = {
      ...snapshot(),
      calendarIds: [calendar.id, "other"],
      activities: [...snapshot().activities, ...second.activities],
    };
    const current = previewGoogleImport(both, combined, false).data;
    const cancelled = {
      ...snapshot([]),
      deleted: [{ calendarId: calendar.id, eventId: "event-1" }],
      calendarIds: [calendar.id, "other"],
      activities: second.activities,
    };
    const next = previewGoogleImport(current, cancelled, false).data;
    expect(
      next.weeks[week].activities
        .filter((a) => a.external)
        .map((a) => a.external?.calendarId),
    ).toEqual(["other"]);
    expect(next.weeks[week].activities.filter((a) => !a.external)).toEqual(
      current.weeks[week].activities.filter((a) => !a.external),
    );
  });
  it("flyttar en uppdaterad källhändelse över veckogränsen utan att lämna en gammal dubblett", () => {
    const data = previewGoogleImport(fixture(), snapshot(), false).data;
    const moved = snapshot(
      [
        event({
          start: { dateTime: "2026-11-02T09:00:00+01:00" },
          end: { dateTime: "2026-11-02T10:00:00+01:00" },
        }),
      ],
      "2026-11-02",
    );
    const next = previewGoogleImport(data, moved, false).data;
    expect(next.weeks[week].activities.some((a) => a.external)).toBe(false);
    expect(
      next.weeks["2026-11-02"].activities.filter((a) => a.external),
    ).toHaveLength(1);
  });
  it("ersätter veckans tidigare kalenderval även efter import i en annan vecka", () => {
    const first = previewGoogleImport(fixture(), snapshot(), false).data;
    const nextWeek = previewGoogleImport(
      first,
      {
        ...snapshot([], "2026-11-02"),
        calendarIds: ["other"],
      },
      false,
    ).data;
    const result = previewGoogleImport(
      nextWeek,
      {
        ...snapshot([]),
        calendarIds: ["other"],
      },
      false,
    ).data;
    expect(result.weeks[week].activities.some((a) => a.external)).toBe(false);
  });
  it("avvisar manipulerad metadata i importerade filer", () => {
    const data = previewGoogleImport(fixture(), snapshot(), false).data;
    data.weeks[week].activities.find((a) => a.external)!.external!.url =
      "javascript:alert(1)";
    expect(() => decodeData(JSON.stringify(data))).toThrow(/kalenderhändelse/);
    const source = data.weeks[week].activities.find(
      (a) => a.external,
    )!.external!;
    delete source.url;
    source.originalStart = "not-a-date";
    expect(() => decodeData(JSON.stringify(data))).toThrow(/kalenderhändelse/);
  });
});
describe("Google API: hela svarslistor och fel", () => {
  it("hämtar alla sidor och återkommande instanser med token endast i Authorization", async () => {
    const requests: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL, init: RequestInit) => {
        const url = new URL(input);
        requests.push(url);
        expect((init.headers as Record<string, string>).Authorization).toBe(
          "Bearer test-token",
        );
        expect(url.search).not.toContain("test-token");
        return Response.json(
          url.searchParams.has("pageToken")
            ? { items: [event({ id: "instance-2" })] }
            : { items: [event()], nextPageToken: "page-2" },
        );
      }),
    );
    const result = await fetchGoogleWeek(
      "test-token",
      [calendar],
      week,
      new AbortController().signal,
    );
    expect(result.activities).toHaveLength(2);
    expect(requests[0].searchParams.get("singleEvents")).toBe("true");
    expect(requests[0].searchParams.get("timeMin")).toBe(
      "2026-10-25T23:00:00.000Z",
    );
  });
  it("returnerar ingen partiell import om en kalender eller senare sida misslyckas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) =>
        new URL(input).searchParams.has("pageToken")
          ? new Response("denied", { status: 403 })
          : Response.json({ items: [event()], nextPageToken: "second" }),
      ),
    );
    await expect(
      fetchGoogleWeek(
        "test-token",
        [calendar],
        week,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/behörighet/);
  });
  it("hanterar utgången behörighet och filtrerar bort kalendrar som inte kan läsas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("expired", { status: 401 })),
    );
    await expect(
      fetchGoogleWeek(
        "test-token",
        [calendar],
        week,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: "GoogleAuthorizationError" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          items: [
            { ...calendar, accessRole: "owner" },
            {
              id: "freebusy",
              summary: "Endast ledig/upptagen",
              accessRole: "freeBusyReader",
            },
          ],
        }),
      ),
    );
    expect(
      await listGoogleCalendars("test-token", new AbortController().signal),
    ).toEqual([{ ...calendar, accessRole: "owner" }]);
  });
});
